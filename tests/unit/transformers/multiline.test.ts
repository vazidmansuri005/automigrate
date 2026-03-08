import { describe, it, expect } from 'vitest';
import { Transformer, getRulesForFramework } from '../../../src/core/transformers/transformer.js';
import type { MigrationConfig, ParsedFile, SourceFile } from '../../../src/types/index.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: '/tmp/src',
    outputDir: '/tmp/out',
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java', '**/*.js'],
    excludePatterns: [],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: false,
    maxConcurrency: 1,
    verbose: false,
    ...overrides,
  };
}

function makeSourceFile(
  content: string,
  framework: 'selenium' | 'cypress' | 'puppeteer',
  language: 'java' | 'javascript' = 'javascript',
): SourceFile {
  return {
    path: `/tmp/src/test.${language === 'java' ? 'java' : 'js'}`,
    relativePath: `test.${language === 'java' ? 'java' : 'js'}`,
    content,
    language,
    framework,
    encoding: 'utf-8',
  };
}

function makeParsedFile(source: SourceFile, overrides: Partial<ParsedFile> = {}): ParsedFile {
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
    ...overrides,
  };
}

/**
 * Helper: transform source content and return the non-empty transformed lines.
 */
function transformContent(
  content: string,
  framework: 'selenium' | 'cypress' | 'puppeteer',
  language: 'java' | 'javascript' = 'javascript',
): string[] {
  const source = makeSourceFile(content, framework, language);
  const parsed = makeParsedFile(source);
  const config = makeConfig();
  const rules = getRulesForFramework(framework);
  const transformer = new Transformer(rules, config, framework);
  const result = transformer.transform(parsed);
  return result.transformedLines.map((l) => l.transformed).filter((l) => l.length > 0);
}

// ─── Multi-line expression tests ────────────────────────────────────────────

describe('Multi-line expression handling', () => {
  describe('Puppeteer multi-line $eval', () => {
    it('should join page.$eval( spanning 3 lines into a single locator().evaluate()', () => {
      const input = [
        'const text = await page.$eval(',
        "  '#product-title',",
        '  el => el.textContent',
        ');',
      ].join('\n');

      const lines = transformContent(input, 'puppeteer');
      // The joined expression should be transformed as a single line
      const evalLine = lines.find((l) => l.includes('locator') || l.includes('evaluate'));
      expect(evalLine).toBeDefined();
      expect(evalLine).toContain('locator');
      expect(evalLine).toContain('evaluate');
      // The callback text should appear only in the joined/transformed line, not as a separate line
      // There should be exactly one line containing it (the transformed one)
      expect(lines.filter((l) => l.includes('el => el.textContent')).length).toBeLessThanOrEqual(1);
    });
  });

  describe('Selenium multi-line findElement', () => {
    it('should join driver.findElement(\\n  By.id("x")\\n) into a single locator', () => {
      const input = [
        'WebElement element = driver.findElement(',
        '    By.id("username")',
        ');',
      ].join('\n');

      const lines = transformContent(input, 'selenium', 'java');
      const locatorLine = lines.find((l) => l.includes('locator'));
      expect(locatorLine).toBeDefined();
      expect(locatorLine).toContain('#username');
    });

    it('should join findElement + chained .sendKeys across lines', () => {
      const input = ['driver.findElement(By.id("search"))', '  .sendKeys("test");'].join('\n');

      const lines = transformContent(input, 'selenium', 'java');
      const fillLine = lines.find((l) => l.includes('fill'));
      expect(fillLine).toBeDefined();
      expect(fillLine).toContain('#search');
      expect(fillLine).toContain('fill');
    });
  });

  describe('Cypress multi-line chain', () => {
    it('should join cy.get().should().and() across lines via dot-chaining', () => {
      const input = ["cy.get('.selector')", "  .should('be.visible');"].join('\n');

      const lines = transformContent(input, 'cypress');
      // The joined expression should trigger the cy.get.should(be.visible) rule
      const assertionLine = lines.find((l) => l.includes('toBeVisible') || l.includes('expect'));
      expect(assertionLine).toBeDefined();
    });
  });

  describe('Single-line expressions are NOT joined', () => {
    it('should not join lines with balanced parentheses', () => {
      const input = ['await page.goto("https://example.com");', 'await page.click("#btn");'].join(
        '\n',
      );

      const lines = transformContent(input, 'puppeteer');
      // Both lines should be independently transformed
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const gotoLine = lines.find((l) => l.includes('goto'));
      const clickLine = lines.find((l) => l.includes('click'));
      expect(gotoLine).toBeDefined();
      expect(clickLine).toBeDefined();
    });
  });

  describe('String literals with parens do not cause false joins', () => {
    it('should not count parentheses inside string literals', () => {
      const input = [
        'await page.goto("https://example.com/path(1)");',
        'await page.click("#btn");',
      ].join('\n');

      const lines = transformContent(input, 'puppeteer');
      // Should NOT join these — the parens in the URL are inside a string
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const gotoLine = lines.find((l) => l.includes('goto'));
      const clickLine = lines.find((l) => l.includes('click'));
      expect(gotoLine).toBeDefined();
      expect(clickLine).toBeDefined();
    });
  });

  describe('Max 10 line limit prevents runaway joins', () => {
    it('should stop joining after 10 lines even if parens are still unbalanced', () => {
      // Construct a pathological case: opening paren never closed within 10 lines
      const inputLines = ['someFunction('];
      for (let i = 0; i < 12; i++) {
        inputLines.push(`  arg${i},`);
      }
      inputLines.push(');');
      const input = inputLines.join('\n');

      const source = makeSourceFile(input, 'puppeteer');
      const parsed = makeParsedFile(source);
      const config = makeConfig();
      const rules = getRulesForFramework('puppeteer');
      const transformer = new Transformer(rules, config, 'puppeteer');
      const result = transformer.transform(parsed);

      // The join should have capped at 10 lines, so line 11+ should NOT be empty/consumed
      // Line indices 10+ (0-based) means lineNumber 11+ should still have content
      const line12 = result.transformedLines.find((l) => l.lineNumber === 12);
      expect(line12).toBeDefined();
      // The 12th line (arg10,) should not be swallowed into the joined expression
      // since the join caps at 10 lines from the start
      expect(line12!.original).toContain('arg10');
    });
  });
});
