/**
 * Gherkin/Cucumber feature file parser.
 * Parses .feature files and generates Playwright test structures from Gherkin scenarios.
 *
 * Converts:
 * - Feature → test.describe
 * - Scenario → test
 * - Scenario Outline → parameterized test
 * - Background → test.beforeEach
 * - Given/When/Then → test steps with comments
 */

import type {
  SourceFile,
  SourceLanguage,
  SourceFramework,
  ParsedFile,
  TestCase,
  HookUsage,
  FunctionDefinition,
} from '../../types/index.js';
import type { Parser } from './base-parser.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('gherkin-parser');

// ─── Gherkin Types ──────────────────────────────────────────────────────────

export interface GherkinFeature {
  name: string;
  description: string;
  tags: string[];
  background?: GherkinBackground;
  scenarios: GherkinScenario[];
  line: number;
}

export interface GherkinBackground {
  steps: GherkinStep[];
  line: number;
}

export interface GherkinScenario {
  name: string;
  tags: string[];
  steps: GherkinStep[];
  examples?: GherkinExamples[];
  isOutline: boolean;
  line: number;
}

export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  docString?: string;
  dataTable?: string[][];
  line: number;
}

export interface GherkinExamples {
  name: string;
  headers: string[];
  rows: string[][];
  line: number;
}

// ─── Gherkin Parser ─────────────────────────────────────────────────────────

export class GherkinParser implements Parser {
  language: SourceLanguage = 'java';
  supportedFrameworks: SourceFramework[] = ['selenium', 'appium'];

  canParse(file: SourceFile): boolean {
    return file.relativePath.endsWith('.feature');
  }

  async parse(source: SourceFile): Promise<ParsedFile> {
    const feature = this.parseFeature(source.content);

    if (!feature) {
      log.warn(`No feature found in ${source.relativePath}`);
      return this.emptyParsedFile(source);
    }

    const testCases: TestCase[] = [];
    const hooks: HookUsage[] = [];
    const functions: FunctionDefinition[] = [];

    // Background → beforeEach hook
    if (feature.background) {
      const hookBody = feature.background.steps
        .map((s) => `  // ${s.keyword} ${s.text}`)
        .join('\n');

      hooks.push({
        type: 'beforeEach',
        body: hookBody,
        line: feature.background.line,
      });
    }

    // Scenarios → test cases
    for (const scenario of feature.scenarios) {
      const body = scenario.steps.map((s) => `// ${s.keyword} ${s.text}`).join('\n');

      testCases.push({
        name: scenario.name,
        description: scenario.tags.join(', '),
        body,
        selectors: [],
        actions: [],
        assertions: [],
        waits: [],
        hooks: [],
        line: scenario.line,
        endLine:
          scenario.steps.length > 0
            ? scenario.steps[scenario.steps.length - 1].line
            : scenario.line,
      });

      functions.push({
        name: scenario.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
        params: [],
        body,
        annotations: scenario.tags.map((t) => ({
          name: t,
          line: scenario.line,
        })),
        isAsync: true,
        isTest: true,
        line: scenario.line,
      });
    }

    return {
      source,
      ast: feature,
      imports: [],
      classes: [],
      functions,
      testCases,
      pageObjects: [],
      selectors: [],
      waits: [],
      assertions: [],
      hooks,
      capabilities: [],
    };
  }

  /**
   * Generate Playwright test code from a parsed Gherkin feature.
   */
  generatePlaywrightTest(feature: GherkinFeature): string {
    const lines: string[] = [];

    lines.push("import { test, expect } from '@playwright/test';");
    lines.push('');

    // Feature → test.describe
    lines.push(`test.describe('${this.escape(feature.name)}', () => {`);

    // Background → test.beforeEach
    if (feature.background) {
      lines.push('  test.beforeEach(async ({ page }) => {');
      for (const step of feature.background.steps) {
        lines.push(`    // ${step.keyword} ${step.text}`);
        lines.push(`    // TODO: [automigrate] Implement step: ${step.text}`);
      }
      lines.push('  });');
      lines.push('');
    }

    // Scenarios
    for (const scenario of feature.scenarios) {
      if (scenario.isOutline && scenario.examples) {
        // Scenario Outline → parameterized tests
        for (const examples of scenario.examples) {
          for (const row of examples.rows) {
            let testName = scenario.name;
            for (let i = 0; i < examples.headers.length; i++) {
              testName = testName.replace(`<${examples.headers[i]}>`, row[i] ?? '');
            }

            lines.push(`  test('${this.escape(testName)}', async ({ page }) => {`);
            for (const step of scenario.steps) {
              let stepText = step.text;
              for (let i = 0; i < examples.headers.length; i++) {
                stepText = stepText.replace(`<${examples.headers[i]}>`, row[i] ?? '');
              }
              lines.push(`    // ${step.keyword} ${stepText}`);
              lines.push(`    // TODO: [automigrate] Implement step: ${stepText}`);
            }
            lines.push('  });');
            lines.push('');
          }
        }
      } else {
        // Regular scenario
        const tagAnnotation =
          scenario.tags.length > 0 ? `  // Tags: ${scenario.tags.join(', ')}\n` : '';

        lines.push(`${tagAnnotation}  test('${this.escape(scenario.name)}', async ({ page }) => {`);
        for (const step of scenario.steps) {
          lines.push(`    // ${step.keyword} ${step.text}`);
          lines.push(`    // TODO: [automigrate] Implement step: ${step.text}`);

          // Add hints for common step patterns
          const hint = this.getStepHint(step);
          if (hint) {
            lines.push(`    ${hint}`);
          }
        }
        lines.push('  });');
        lines.push('');
      }
    }

    lines.push('});');

    return lines.join('\n');
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private parseFeature(content: string): GherkinFeature | null {
    const lines = content.split('\n');
    let feature: GherkinFeature | null = null;
    let currentScenario: GherkinScenario | null = null;
    let currentExamples: GherkinExamples | null = null;
    let currentBackground: GherkinBackground | null = null;
    let pendingTags: string[] = [];
    let inDocString = false;
    let docStringContent: string[] = [];
    let lastStep: GherkinStep | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Doc strings
      if (trimmed === '"""' || trimmed === '```') {
        if (inDocString) {
          if (lastStep) {
            lastStep.docString = docStringContent.join('\n');
          }
          docStringContent = [];
          inDocString = false;
        } else {
          inDocString = true;
        }
        continue;
      }

      if (inDocString) {
        docStringContent.push(line);
        continue;
      }

      // Tags
      if (trimmed.startsWith('@')) {
        pendingTags.push(...trimmed.split(/\s+/).filter((t) => t.startsWith('@')));
        continue;
      }

      // Feature
      if (trimmed.startsWith('Feature:')) {
        const name = trimmed.substring('Feature:'.length).trim();
        feature = {
          name,
          description: '',
          tags: [...pendingTags],
          scenarios: [],
          line: lineNum,
        };
        pendingTags = [];
        continue;
      }

      if (!feature) continue;

      // Background
      if (trimmed.startsWith('Background:')) {
        currentScenario = null;
        currentExamples = null;
        currentBackground = { steps: [], line: lineNum };
        feature.background = currentBackground;
        continue;
      }

      // Scenario Outline
      if (trimmed.startsWith('Scenario Outline:') || trimmed.startsWith('Scenario Template:')) {
        const name = trimmed.replace(/^Scenario (?:Outline|Template):/, '').trim();
        currentBackground = null;
        currentExamples = null;
        currentScenario = {
          name,
          tags: [...pendingTags],
          steps: [],
          examples: [],
          isOutline: true,
          line: lineNum,
        };
        feature.scenarios.push(currentScenario);
        pendingTags = [];
        continue;
      }

      // Scenario
      if (trimmed.startsWith('Scenario:')) {
        const name = trimmed.substring('Scenario:'.length).trim();
        currentBackground = null;
        currentExamples = null;
        currentScenario = {
          name,
          tags: [...pendingTags],
          steps: [],
          isOutline: false,
          line: lineNum,
        };
        feature.scenarios.push(currentScenario);
        pendingTags = [];
        continue;
      }

      // Examples
      if (trimmed.startsWith('Examples:') || trimmed.startsWith('Scenarios:')) {
        if (currentScenario?.isOutline) {
          currentExamples = {
            name: trimmed.replace(/^(?:Examples|Scenarios):/, '').trim(),
            headers: [],
            rows: [],
            line: lineNum,
          };
          currentScenario.examples!.push(currentExamples);
        }
        continue;
      }

      // Data table row
      if (trimmed.startsWith('|')) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        if (currentExamples) {
          if (currentExamples.headers.length === 0) {
            currentExamples.headers = cells;
          } else {
            currentExamples.rows.push(cells);
          }
        } else if (lastStep) {
          if (!lastStep.dataTable) lastStep.dataTable = [];
          lastStep.dataTable.push(cells);
        }
        continue;
      }

      // Steps (Given/When/Then/And/But)
      const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)$/);
      if (stepMatch) {
        const step: GherkinStep = {
          keyword: stepMatch[1] as GherkinStep['keyword'],
          text: stepMatch[2],
          line: lineNum,
        };

        lastStep = step;

        if (currentBackground) {
          currentBackground.steps.push(step);
        } else if (currentScenario) {
          currentScenario.steps.push(step);
        }
        continue;
      }
    }

    return feature;
  }

  private getStepHint(step: GherkinStep): string | null {
    const text = step.text.toLowerCase();

    // Navigation hints
    if (text.match(/^(?:i am on|i (?:go|navigate) to|i open|i visit)\s/)) {
      const urlMatch = step.text.match(/"([^"]+)"/);
      if (urlMatch) {
        return `await page.goto('${urlMatch[1]}');`;
      }
      return `await page.goto('/* URL */');`;
    }

    // Click hints
    if (text.match(/^i (?:click|tap|press)\s/)) {
      const elementMatch = step.text.match(/"([^"]+)"/);
      if (elementMatch) {
        return `await page.getByRole('button', { name: '${elementMatch[1]}' }).click();`;
      }
    }

    // Type/fill hints
    if (text.match(/^i (?:type|enter|fill|input)\s/)) {
      const matches = step.text.match(/"([^"]+)"/g);
      if (matches && matches.length >= 2) {
        const value = matches[0].replace(/"/g, '');
        const field = matches[1].replace(/"/g, '');
        return `await page.getByLabel('${field}').fill('${value}');`;
      }
    }

    // Visibility assertions
    if (text.match(/^i should see|.+should be (?:visible|displayed)/)) {
      const elementMatch = step.text.match(/"([^"]+)"/);
      if (elementMatch) {
        return `await expect(page.getByText('${elementMatch[1]}')).toBeVisible();`;
      }
    }

    // Text assertions
    if (text.match(/should (?:contain|have|show)\s.*text/)) {
      const matches = step.text.match(/"([^"]+)"/g);
      if (matches && matches.length >= 1) {
        const text = matches[0].replace(/"/g, '');
        return `await expect(page.locator('/* selector */')).toContainText('${text}');`;
      }
    }

    return null;
  }

  private escape(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private emptyParsedFile(source: SourceFile): ParsedFile {
    return {
      source,
      ast: null,
      imports: [],
      classes: [],
      functions: [],
      testCases: [],
      pageObjects: [],
      selectors: [],
      waits: [],
      assertions: [],
      hooks: [],
      capabilities: [],
    };
  }
}
