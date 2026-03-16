/**
 * AI Refiner — Post-transformation pass that uses LLMs to handle
 * lines the regex engine couldn't transform.
 *
 * Only processes lines marked with [automigrate] or that passed through
 * untransformed. Sends full file context for accurate conversion.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('ai-refiner');

export type AIProvider = 'anthropic' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

interface AIRefineResult {
  refined: string;
  linesProcessed: number;
  linesImproved: number;
  tokensUsed: number;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

const SYSTEM_PROMPT = `You are an expert test automation engineer specializing in migrating tests to Playwright.

You will receive a partially-migrated test file. Some lines have already been converted to Playwright by a regex engine (these are correct — do NOT change them). Other lines are marked with "// TODO: [automigrate]" or "// [automigrate]" comments — these need your help.

Your job:
1. Convert any remaining framework-specific code (Selenium, Cypress, WebdriverIO, Appium) to idiomatic Playwright
2. Convert Java/Python type declarations and control flow to TypeScript
3. Convert capability setup blocks to playwright.config.ts comments or remove them
4. Convert custom helper method calls to Playwright equivalents where the intent is clear
5. Remove or convert remaining Java boilerplate (try/catch wrapping driver.quit, etc.)
6. Fix any syntax issues from partial regex conversion

Rules:
- Keep ALL correctly-converted Playwright lines unchanged
- Only modify lines that still contain old framework code or [automigrate] markers
- Use idiomatic Playwright patterns (locators, auto-wait, expect assertions)
- If you can't determine the correct conversion, add a clear "// TODO: Manual review needed — " comment
- Preserve the test structure (test.describe, test blocks)
- Output ONLY the complete refined TypeScript code, no explanations`;

/**
 * Refine a partially-migrated file using AI.
 */
export async function refineWithAI(
  originalSource: string,
  partiallyMigrated: string,
  sourceFramework: string,
  aiConfig: AIConfig,
): Promise<AIRefineResult> {
  const model = aiConfig.model || DEFAULT_MODELS[aiConfig.provider];

  // Count lines that need AI help
  const lines = partiallyMigrated.split('\n');
  const needsHelp = lines.filter(
    (l) =>
      l.includes('[automigrate]') ||
      l.includes('// TODO:') ||
      // Java remnants
      /\b(driver\.|By\.|WebElement|HashMap|ArrayList|Map<String|DesiredCapabilities|AppiumDriver|IOSDriver|AndroidDriver)\b/.test(
        l,
      ) ||
      // Untransformed patterns
      /\b(new\s+Actions|new\s+Select|new\s+WebDriverWait|new\s+TouchAction)\b/.test(l),
  );

  if (needsHelp.length === 0) {
    log.info('[ai-refiner] No lines need AI refinement — skipping');
    return {
      refined: partiallyMigrated,
      linesProcessed: 0,
      linesImproved: 0,
      tokensUsed: 0,
    };
  }

  log.info(`[ai-refiner] ${needsHelp.length} lines need AI refinement (using ${model})`);

  const userPrompt = `## Source file (${sourceFramework})
\`\`\`
${originalSource}
\`\`\`

## Partially migrated to Playwright (needs refinement)
\`\`\`typescript
${partiallyMigrated}
\`\`\`

Refine the partially migrated code above. Fix all lines with [automigrate] markers and any remaining ${sourceFramework} code. Output ONLY the complete refined TypeScript file.`;

  try {
    let refined: string;
    let tokensUsed = 0;

    if (aiConfig.provider === 'anthropic') {
      const result = await callAnthropic(aiConfig.apiKey, model, userPrompt);
      refined = result.content;
      tokensUsed = result.tokensUsed;
    } else {
      const result = await callOpenAI(aiConfig.apiKey, model, userPrompt);
      refined = result.content;
      tokensUsed = result.tokensUsed;
    }

    // Extract code from markdown code blocks if present
    refined = extractCode(refined);

    // Count improvements
    const refinedLines = refined.split('\n');
    const stillNeedsHelp = refinedLines.filter(
      (l) => l.includes('[automigrate]') || l.includes('// TODO:'),
    );
    const linesImproved = needsHelp.length - stillNeedsHelp.length;

    log.info(
      `[ai-refiner] Improved ${linesImproved}/${needsHelp.length} lines (${tokensUsed} tokens used)`,
    );

    return {
      refined,
      linesProcessed: needsHelp.length,
      linesImproved,
      tokensUsed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[ai-refiner] AI refinement failed: ${message}. Falling back to regex-only output.`);
    return {
      refined: partiallyMigrated,
      linesProcessed: needsHelp.length,
      linesImproved: 0,
      tokensUsed: 0,
    };
  }
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const text = data.content.find((c) => c.type === 'text')?.text || '';
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return { content: text, tokensUsed };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { total_tokens: number };
  };

  const text = data.choices[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  return { content: text, tokensUsed };
}

/**
 * Extract code from markdown code blocks
 */
function extractCode(text: string): string {
  // Match ```typescript ... ``` or ```ts ... ``` or ``` ... ```
  const match = text.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();

  // If no code block, return the text as-is (it might already be raw code)
  return text.trim();
}
