/**
 * Framework auto-detection and project scanning.
 * Detects source framework and language from file content and structure.
 */

import fg from 'fast-glob';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type {
  SourceFile,
  SourceFramework,
  SourceLanguage,
  MigrationConfig,
} from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('detector');

interface DetectionResult {
  framework: SourceFramework;
  language: SourceLanguage;
  confidence: number;
}

// ─── Import patterns per framework ─────────────────────────────────────────

const FRAMEWORK_SIGNATURES: Array<{
  pattern: RegExp;
  framework: SourceFramework;
  language?: SourceLanguage;
  confidence: number;
}> = [
  // Robot Framework
  {
    pattern: /^\*{3}\s+Settings\s+\*{3}/m,
    framework: 'robot',
    language: 'robot',
    confidence: 0.99,
  },
  {
    pattern: /^\*{3}\s+Test Cases\s+\*{3}/m,
    framework: 'robot',
    language: 'robot',
    confidence: 0.99,
  },
  {
    pattern: /^\*{3}\s+Keywords\s+\*{3}/m,
    framework: 'robot',
    language: 'robot',
    confidence: 0.95,
  },
  {
    pattern: /^\*{3}\s+Variables\s+\*{3}/m,
    framework: 'robot',
    language: 'robot',
    confidence: 0.9,
  },
  {
    pattern: /Library\s+SeleniumLibrary/m,
    framework: 'robot',
    language: 'robot',
    confidence: 0.99,
  },
  { pattern: /Library\s+AppiumLibrary/m, framework: 'robot', language: 'robot', confidence: 0.99 },

  // Gherkin / Cucumber feature files
  { pattern: /^Feature:\s+/m, framework: 'selenium', confidence: 0.9 },
  { pattern: /^\s+Scenario:\s+/m, framework: 'selenium', confidence: 0.85 },
  { pattern: /^\s+(?:Given|When|Then|And|But)\s+/m, framework: 'selenium', confidence: 0.8 },

  // Cypress
  {
    pattern: /\bcy\.(visit|get|contains|intercept|request)\b/,
    framework: 'cypress',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /\bCypress\.(Commands|env|config)\b/,
    framework: 'cypress',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /cypress\.config\.(js|ts|mjs)/,
    framework: 'cypress',
    language: 'javascript',
    confidence: 0.99,
  },

  // Puppeteer
  {
    pattern: /require\s*\(\s*['"]puppeteer(?:-core)?['"]\s*\)/,
    framework: 'puppeteer',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /from\s+['"]puppeteer(?:-core)?['"]/,
    framework: 'puppeteer',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /puppeteer\.launch\s*\(/,
    framework: 'puppeteer',
    language: 'javascript',
    confidence: 0.9,
  },

  // Appium (Java)
  {
    pattern: /import\s+io\.appium\.java_client/,
    framework: 'appium',
    language: 'java',
    confidence: 0.95,
  },
  {
    pattern: /\b(?:IOSDriver|AndroidDriver|AppiumDriver)\b/,
    framework: 'appium',
    language: 'java',
    confidence: 0.85,
  },
  { pattern: /\b(?:MobileBy|AppiumBy)\b/, framework: 'appium', language: 'java', confidence: 0.9 },

  // Appium (JS) — only if Appium-specific APIs are used
  {
    pattern: /require\s*\(\s*['"]appium['"]\s*\)/,
    framework: 'appium',
    language: 'javascript',
    confidence: 0.9,
  },
  {
    pattern: /from\s+['"]appium['"]/,
    framework: 'appium',
    language: 'javascript',
    confidence: 0.9,
  },

  // Appium (Python)
  { pattern: /from\s+appium/, framework: 'appium', language: 'python', confidence: 0.95 },

  // WebdriverIO (MUST come before Selenium JS — both use describe/it but WDIO has $(), browser.*)
  {
    pattern: /require\s*\(\s*['"]@wdio\/globals['"]\s*\)/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.99,
  },
  {
    pattern: /from\s+['"]@wdio\/globals['"]/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.99,
  },
  {
    pattern: /require\s*\(\s*['"]@wdio\//,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /from\s+['"]@wdio\//,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /require\s*\(\s*['"]webdriverio['"]\s*\)/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.9,
  },
  {
    pattern: /from\s+['"]webdriverio['"]/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.9,
  },
  {
    pattern: /(?:await\s+)?\$\s*\(\s*['"]/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.7,
  },
  {
    pattern: /(?:await\s+)?\$\$\s*\(\s*['"]/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.7,
  },
  {
    pattern: /(?:await\s+)?browser\.url\s*\(/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.8,
  },
  {
    pattern: /wdio\.conf\.(js|ts)/,
    framework: 'webdriverio',
    language: 'javascript',
    confidence: 0.99,
  },

  // Selenium (Java)
  {
    pattern: /import\s+org\.openqa\.selenium/,
    framework: 'selenium',
    language: 'java',
    confidence: 0.95,
  },
  {
    pattern: /\bWebDriver\b.*\b(?:Chrome|Firefox|Edge|Remote)Driver\b/,
    framework: 'selenium',
    language: 'java',
    confidence: 0.9,
  },
  {
    pattern: /\bBy\.(id|cssSelector|xpath|name|className)\b/,
    framework: 'selenium',
    confidence: 0.8,
  },

  // Selenium (JS)
  {
    pattern: /require\s*\(\s*['"]selenium-webdriver['"]\s*\)/,
    framework: 'selenium',
    language: 'javascript',
    confidence: 0.95,
  },
  {
    pattern: /from\s+['"]selenium-webdriver['"]/,
    framework: 'selenium',
    language: 'javascript',
    confidence: 0.95,
  },

  // Selenium (Python)
  { pattern: /from\s+selenium/, framework: 'selenium', language: 'python', confidence: 0.95 },
  {
    pattern: /from\s+selenium\.webdriver\.common\.by\s+import\s+By/,
    framework: 'selenium',
    language: 'python',
    confidence: 0.98,
  },

  // Selenium (C#)
  {
    pattern: /using\s+OpenQA\.Selenium/,
    framework: 'selenium',
    language: 'csharp',
    confidence: 0.95,
  },
  {
    pattern: /using\s+NUnit\.Framework/,
    framework: 'selenium',
    language: 'csharp',
    confidence: 0.85,
  },
  { pattern: /using\s+Xunit/, framework: 'selenium', language: 'csharp', confidence: 0.95 },
  {
    pattern: /using\s+Microsoft\.VisualStudio\.TestTools\.UnitTesting/,
    framework: 'selenium',
    language: 'csharp',
    confidence: 0.95,
  },
];

// ─── Language detection by extension ────────────────────────────────────────

const EXTENSION_LANGUAGE: Record<string, SourceLanguage> = {
  '.java': 'java',
  '.py': 'python',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.cs': 'csharp',
  '.robot': 'robot',
  '.resource': 'robot',
  '.feature': 'java', // Gherkin features are framework-agnostic; default to java for Cucumber
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function detectFramework(filePath: string, content: string): DetectionResult {
  const ext = extname(filePath).toLowerCase();
  const language = EXTENSION_LANGUAGE[ext];

  if (!language) {
    return { framework: 'selenium', language: 'javascript', confidence: 0 };
  }

  // Score each framework
  const scores = new Map<SourceFramework, { score: number; lang: SourceLanguage }>();

  for (const sig of FRAMEWORK_SIGNATURES) {
    if (sig.pattern.test(content)) {
      const fw = sig.framework;
      const existing = scores.get(fw);
      const lang = sig.language ?? language;
      if (!existing || sig.confidence > existing.score) {
        scores.set(fw, { score: sig.confidence, lang });
      }
    }
  }

  // Return highest scoring
  let best: DetectionResult = { framework: 'selenium', language, confidence: 0.1 };
  for (const [framework, { score, lang }] of scores) {
    if (score > best.confidence) {
      best = { framework, language: lang, confidence: score };
    }
  }

  return best;
}

export async function scanProject(config: MigrationConfig): Promise<SourceFile[]> {
  const { sourceDir, includePatterns, excludePatterns } = config;

  log.info(`Scanning ${sourceDir} for test files...`);

  const files = await fg(includePatterns, {
    cwd: sourceDir,
    ignore: excludePatterns,
    absolute: false,
    dot: false,
  });

  log.info(`Found ${files.length} candidate files`);

  const sourceFiles: SourceFile[] = [];

  for (const relativePath of files) {
    const absolutePath = `${sourceDir}/${relativePath}`;
    try {
      // Read as buffer first to detect binary files
      const { readFile: readFileRaw } = await import('node:fs/promises');
      const buffer = await readFileRaw(absolutePath);

      // Binary file detection: check for null bytes in first 8KB
      const checkSize = Math.min(buffer.length, 8192);
      let isBinary = false;
      for (let i = 0; i < checkSize; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }
      if (isBinary) {
        log.debug(`Skipping binary file: ${relativePath}`);
        continue;
      }

      const content = buffer.toString('utf-8');

      // Large file warning (>10K lines)
      const lineCount = content.split('\n').length;
      if (lineCount > 10_000) {
        log.warn(
          `Large file detected: ${relativePath} (${lineCount.toLocaleString()} lines). ` +
            `Processing may be slow. Consider splitting this file.`,
        );
      }

      const detection = detectFramework(relativePath, content);

      // Skip files with zero confidence (not test files)
      if (detection.confidence < 0.1) continue;

      sourceFiles.push({
        path: absolutePath,
        relativePath,
        content,
        language: detection.language,
        framework: detection.framework,
        encoding: 'utf-8',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT')) {
        log.warn(`File not found: ${relativePath}`);
      } else if (msg.includes('EACCES') || msg.includes('EPERM')) {
        log.warn(`Permission denied: ${relativePath}`);
      } else {
        log.warn(`Could not read file: ${relativePath} (${msg})`);
      }
    }
  }

  log.info(
    `Identified ${sourceFiles.length} test files across ${summarizeFrameworks(sourceFiles)} frameworks`,
  );

  return sourceFiles;
}

function summarizeFrameworks(files: SourceFile[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    counts.set(f.framework, (counts.get(f.framework) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([fw, n]) => `${fw}(${n})`)
    .join(', ');
}
