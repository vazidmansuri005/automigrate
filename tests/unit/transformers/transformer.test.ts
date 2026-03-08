import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildSmartPattern,
  Transformer,
  getRulesForFramework,
} from '../../../src/core/transformers/transformer.js';
import type {
  MigrationConfig,
  ParsedFile,
  SourceFile,
  SmartPattern,
} from '../../../src/types/index.js';

// ─── Helper: minimal MigrationConfig ──────────────────────────────────────

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

// ─── buildSmartPattern tests ──────────────────────────────────────────────

describe('buildSmartPattern', () => {
  it('should create a regex for simple method call with one param', () => {
    const sp = buildSmartPattern('driver.get(url)', 'await page.goto(url)');
    expect(sp.regex).toBeInstanceOf(RegExp);
    expect(sp.captureNames).toContain('url');
    expect(sp.template).toContain('$1');
  });

  it('should match a concrete call and produce correct template substitution', () => {
    const sp = buildSmartPattern('driver.get(url)', 'await page.goto(url)');
    const match = sp.regex.exec('driver.get("https://example.com")');
    expect(match).not.toBeNull();

    let result = sp.template;
    if (match) {
      for (let g = 1; g < match.length; g++) {
        result = result.replace(`$${g}`, match[g] ?? '');
      }
    }
    expect(result).toBe('await page.goto("https://example.com")');
  });

  it('should handle multiple params', () => {
    const sp = buildSmartPattern('element.sendKeys(text)', 'await locator.fill(text)');
    const match = sp.regex.exec('element.sendKeys("hello")');
    expect(match).not.toBeNull();
  });

  it('should escape dots in method chains', () => {
    const sp = buildSmartPattern('driver.navigate().back()', 'await page.goBack()');
    // The dot between navigate() and back() should be escaped
    expect(sp.regex.source).toContain('\\.');
  });

  it('should handle no-param methods by producing a regex with an empty capture group', () => {
    // buildSmartPattern treats () as a parameter group, generating a capture
    // for the (empty) content. The resulting regex still contains the parens.
    const sp = buildSmartPattern('driver.getTitle()', 'await page.title()');
    expect(sp.regex).toBeInstanceOf(RegExp);
    // The regex source should include escaped parens
    expect(sp.regex.source).toContain('\\(');
    expect(sp.regex.source).toContain('\\)');
  });
});

// ─── Direct rules: Selenium Java patterns ─────────────────────────────────

describe('Transformer - Selenium Java direct rules', () => {
  const fixtureContent = readFileSync(
    resolve(__dirname, '../../fixtures/selenium/java/LoginTest.java'),
    'utf-8',
  );

  const source = makeSourceFile(fixtureContent, 'selenium', 'java');

  it('should transform driver.get() to page.goto()', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const gotoLine = result.transformedLines.find((l) => l.transformed.includes('page.goto'));
    expect(gotoLine).toBeDefined();
    expect(gotoLine!.transformed).toContain('await page.goto');
  });

  it('should transform findElement(By.id).sendKeys to locator.fill', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const fillLine = result.transformedLines.find(
      (l) => l.transformed.includes('.fill(') && l.transformed.includes('#username'),
    );
    expect(fillLine).toBeDefined();
  });

  it('should transform findElement(By.cssSelector).click to locator.click', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const clickLine = result.transformedLines.find(
      (l) => l.transformed.includes('.click()') && l.transformed.includes('.login-btn'),
    );
    expect(clickLine).toBeDefined();
  });

  it('should transform assertEquals(title) to expect.toHaveTitle', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const titleLine = result.transformedLines.find((l) => l.transformed.includes('toHaveTitle'));
    expect(titleLine).toBeDefined();
  });

  it('should transform assertTrue(isDisplayed) to expect.toBeVisible', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const visibleLine = result.transformedLines.find((l) => l.transformed.includes('toBeVisible'));
    expect(visibleLine).toBeDefined();
  });

  it('should transform Thread.sleep to auto-wait comment', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const sleepLine = result.transformedLines.find(
      (l) => l.original.includes('Thread.sleep') && l.transformed.includes('[automigrate]'),
    );
    expect(sleepLine).toBeDefined();
  });

  it('should transform WebDriverWait with ExpectedConditions to locator.waitFor', () => {
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const waitLine = result.transformedLines.find((l) => l.transformed.includes('waitFor'));
    expect(waitLine).toBeDefined();
  });
});

// ─── __SKIP__ handling ──────────────────────────────────────────────────

describe('Transformer - __SKIP__ handling', () => {
  it('should produce empty string for skipped lines (Java boilerplate)', () => {
    const content = `import org.openqa.selenium.*;
public class LoginTest {
    WebDriver driver;
    @Test
    public void testLogin() {
        driver.get("https://example.com");
    }
}`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    // Class declaration, @Test, method signature, etc. should be skipped
    const classLine = result.transformedLines.find((l) =>
      l.original.includes('public class LoginTest'),
    );
    expect(classLine).toBeDefined();
    expect(classLine!.transformed).toBe('');

    const testAnnotation = result.transformedLines.find((l) => l.original.trim() === '@Test');
    expect(testAnnotation).toBeDefined();
    expect(testAnnotation!.transformed).toBe('');
  });

  it('should produce empty string for Puppeteer require statement', () => {
    const content = `const puppeteer = require('puppeteer');
describe('test', () => {
  test('basic', async () => {
    await page.goto('https://example.com');
  });
});`;
    const source = makeSourceFile(content, 'puppeteer');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, makeConfig(), 'puppeteer');
    const result = transformer.transform(parsed);

    // The require line should be skipped (import handling removes it)
    const requireLine = result.transformedLines.find((l) =>
      l.original.includes("require('puppeteer')"),
    );
    expect(requireLine).toBeDefined();
    expect(requireLine!.transformed).toBe('');
  });
});

// ─── Direct rules: Cypress patterns ──────────────────────────────────────

describe('Transformer - Cypress direct rules', () => {
  it('should transform cy.visit to page.goto', () => {
    const content = `cy.visit('/login');`;
    const source = makeSourceFile(content, 'cypress');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, makeConfig(), 'cypress');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('page.goto'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("await page.goto('/login')");
  });

  it('should transform cy.get.click to locator.click', () => {
    const content = `cy.get('.login-btn').click();`;
    const source = makeSourceFile(content, 'cypress');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, makeConfig(), 'cypress');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.click()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.login-btn').click()");
  });

  it('should transform cy.get.should(be.visible) to expect.toBeVisible', () => {
    const content = `cy.get('.error-message').should('be.visible');`;
    const source = makeSourceFile(content, 'cypress');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, makeConfig(), 'cypress');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('toBeVisible'));
    expect(line).toBeDefined();
  });

  it('should transform cy.get.should(contain.text) to expect.toContainText', () => {
    const content = `cy.get('.error-message').should('contain.text', 'Invalid credentials');`;
    const source = makeSourceFile(content, 'cypress');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, makeConfig(), 'cypress');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('toContainText'));
    expect(line).toBeDefined();
  });

  it('should transform cy.url.should(include) to expect.toHaveURL', () => {
    const content = `cy.url().should('include', '/dashboard');`;
    const source = makeSourceFile(content, 'cypress');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, makeConfig(), 'cypress');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('toHaveURL'));
    expect(line).toBeDefined();
  });
});

// ─── Direct rules: Puppeteer patterns ────────────────────────────────────

describe('Transformer - Puppeteer direct rules', () => {
  it('should transform page.click(selector) to locator.click', () => {
    const content = `await page.click('#search-button');`;
    const source = makeSourceFile(content, 'puppeteer');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, makeConfig(), 'puppeteer');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('locator'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('#search-button').click()");
  });

  it('should transform page.type(selector, text) to locator.fill', () => {
    const content = `await page.type('#search-input', 'laptop');`;
    const source = makeSourceFile(content, 'puppeteer');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, makeConfig(), 'puppeteer');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.fill('));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('#search-input').fill('laptop')");
  });

  it('should transform page.waitForSelector to locator.waitFor', () => {
    const content = `await page.waitForSelector('#search-input');`;
    const source = makeSourceFile(content, 'puppeteer');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, makeConfig(), 'puppeteer');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.waitFor()'));
    expect(line).toBeDefined();
  });

  it('should transform page.$$(selector) to page.locator(selector)', () => {
    const content = `const results = await page.$$('.product-card');`;
    const source = makeSourceFile(content, 'puppeteer');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, makeConfig(), 'puppeteer');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('page.locator'));
    expect(line).toBeDefined();
  });

  it('should transform page.hover to locator.hover', () => {
    const content = `await page.hover('.cart-icon');`;
    const source = makeSourceFile(content, 'puppeteer');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, makeConfig(), 'puppeteer');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.hover()'));
    expect(line).toBeDefined();
  });
});

// ─── Rule ordering: assertions before element actions ─────────────────────

describe('Transformer - rule ordering', () => {
  it('should match assertion rules before generic element action rules for Selenium', () => {
    // assertTrue(element.isDisplayed()) should match the assertion rule,
    // not the generic element.isDisplayed() → locator.isVisible() rule
    const content = `assertTrue(welcomeMsg.isDisplayed());`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.original.includes('assertTrue'));
    expect(line).toBeDefined();
    // Should produce expect().toBeVisible(), not just isVisible()
    expect(line!.transformed).toContain('toBeVisible');
  });

  it('should match assertEquals(getTitle) as assertion, not standalone getTitle', () => {
    const content = `assertEquals(driver.getTitle(), "Dashboard - MyApp");`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.original.includes('assertEquals'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('toHaveTitle');
  });
});

// ─── getRulesForFramework ─────────────────────────────────────────────────

describe('getRulesForFramework', () => {
  it('should return selenium rules for selenium framework', () => {
    const rules = getRulesForFramework('selenium');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.sourceFramework === 'selenium')).toBe(true);
  });

  it('should return cypress rules for cypress framework', () => {
    const rules = getRulesForFramework('cypress');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.sourceFramework === 'cypress')).toBe(true);
  });

  it('should return puppeteer rules for puppeteer framework', () => {
    const rules = getRulesForFramework('puppeteer');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.sourceFramework === 'puppeteer')).toBe(true);
  });

  it('should prepend custom rules when provided', () => {
    const customRule = {
      id: 'custom-1',
      name: 'custom',
      description: 'test',
      sourceFramework: 'selenium' as const,
      sourcePattern: 'foo',
      targetTemplate: 'bar',
      confidence: 'high' as const,
      category: 'action' as const,
      requiresManualReview: false,
      examples: [{ input: 'foo', output: 'bar', language: 'javascript' as const }],
    };
    const rules = getRulesForFramework('selenium', [customRule]);
    expect(rules[0]).toBe(customRule);
  });
});

// ─── Import block generation ──────────────────────────────────────────────

describe('Transformer - import block generation', () => {
  it('should generate @playwright/test import for typescript target', () => {
    const source = makeSourceFile('driver.get("https://example.com");', 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    expect(result.importBlock).toContain('@playwright/test');
    expect(result.importBlock).toContain('test');
  });

  it('should include expect in imports when assertions exist', () => {
    const source = makeSourceFile('assertTrue(element.isDisplayed());', 'selenium', 'java');
    const parsed = makeParsedFile(source, {
      assertions: [{ type: 'visible', line: 1, raw: 'assertTrue(element.isDisplayed())' }],
    });
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);

    expect(result.importBlock).toContain('expect');
  });
});

// ─── Test structure detection ─────────────────────────────────────────────

describe('Transformer - test structure detection', () => {
  it('should detect class structure for Java test classes', () => {
    const source = makeSourceFile('', 'selenium', 'java');
    const parsed = makeParsedFile(source, {
      classes: [
        {
          name: 'LoginTest',
          methods: [],
          properties: [],
          annotations: [],
          line: 1,
          isPageObject: false,
          isTestClass: true,
        },
      ],
    });
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium');
    const result = transformer.transform(parsed);
    expect(result.testStructure).toBe('class');
  });

  it('should detect describe-it structure for Cypress', () => {
    const content = `describe('test', () => { it('works', () => {}); });`;
    const source = makeSourceFile(content, 'cypress');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, makeConfig(), 'cypress');
    const result = transformer.transform(parsed);
    expect(result.testStructure).toBe('describe-it');
  });
});
