import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CodeGenerator } from '../../../src/core/generators/code-generator.js';
import { Transformer, getRulesForFramework } from '../../../src/core/transformers/transformer.js';
import { JavaParser } from '../../../src/core/parsers/java-parser.js';
import { JavaScriptParser } from '../../../src/core/parsers/javascript-parser.js';
import type { MigrationConfig, ParsedFile, TransformFileResult } from '../../../src/types/index.js';

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: '/tmp/src',
    outputDir: '/tmp/out',
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: [],
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

describe('CodeGenerator - Java/Selenium class structure', () => {
  let parsed: ParsedFile;
  let transformResult: TransformFileResult;

  it('should generate code with @playwright/test import', async () => {
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/selenium/java/LoginTest.java'),
      'utf-8',
    );
    const parser = new JavaParser();
    parsed = await parser.parse({
      path: '/tmp/LoginTest.java',
      relativePath: 'LoginTest.java',
      content: fixtureContent,
      language: 'java',
      framework: 'selenium',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, config, 'selenium');
    transformResult = transformer.transform(parsed);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsed);

    expect(generated.content).toContain('@playwright/test');
    expect(generated.content).toContain('import');
  });

  it('should wrap class-based tests in test.describe', async () => {
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/selenium/java/LoginTest.java'),
      'utf-8',
    );
    const parser = new JavaParser();
    parsed = await parser.parse({
      path: '/tmp/LoginTest.java',
      relativePath: 'LoginTest.java',
      content: fixtureContent,
      language: 'java',
      framework: 'selenium',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, config, 'selenium');
    transformResult = transformer.transform(parsed);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsed);

    expect(generated.content).toContain('test.describe(');
    expect(generated.content).toContain('LoginTest');
  });

  it('should generate individual test blocks for each test case', async () => {
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/selenium/java/LoginTest.java'),
      'utf-8',
    );
    const parser = new JavaParser();
    parsed = await parser.parse({
      path: '/tmp/LoginTest.java',
      relativePath: 'LoginTest.java',
      content: fixtureContent,
      language: 'java',
      framework: 'selenium',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, config, 'selenium');
    transformResult = transformer.transform(parsed);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsed);

    expect(generated.content).toContain("test('testSuccessfulLogin'");
    expect(generated.content).toContain("test('testFailedLogin'");
    expect(generated.content).toContain('async ({ page })');
  });

  it('should generate hook blocks when hooks are present in parsed data', async () => {
    // The regex-based Java parser may not always extract hook annotations.
    // Test with explicitly provided hooks to verify the generator logic.
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/selenium/java/LoginTest.java'),
      'utf-8',
    );
    const parser = new JavaParser();
    parsed = await parser.parse({
      path: '/tmp/LoginTest.java',
      relativePath: 'LoginTest.java',
      content: fixtureContent,
      language: 'java',
      framework: 'selenium',
      encoding: 'utf-8',
    });

    // Manually add hooks to verify generator handles them
    const parsedWithHooks = {
      ...parsed,
      hooks: [
        { type: 'beforeEach' as const, body: 'driver = new ChromeDriver();', line: 19 },
        { type: 'afterEach' as const, body: 'driver.quit();', line: 64 },
      ],
    };

    const config = makeConfig();
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, config, 'selenium');
    transformResult = transformer.transform(parsedWithHooks);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsedWithHooks);

    expect(generated.content).toContain('test.beforeEach(');
    expect(generated.content).toContain('test.afterEach(');
  });
});

describe('CodeGenerator - Cypress describe-it conversion', () => {
  it('should convert describe/it to test.describe/test', async () => {
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/cypress/login.cy.js'),
      'utf-8',
    );
    const parser = new JavaScriptParser();
    const parsed = await parser.parse({
      path: '/tmp/login.cy.js',
      relativePath: 'login.cy.js',
      content: fixtureContent,
      language: 'javascript',
      framework: 'cypress',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, config, 'cypress');
    const transformResult = transformer.transform(parsed);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsed);

    expect(generated.content).toContain('test.describe(');
    expect(generated.content).toContain('test(');
  });

  it('should convert beforeEach to test.beforeEach with async page', async () => {
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/cypress/login.cy.js'),
      'utf-8',
    );
    const parser = new JavaScriptParser();
    const parsed = await parser.parse({
      path: '/tmp/login.cy.js',
      relativePath: 'login.cy.js',
      content: fixtureContent,
      language: 'javascript',
      framework: 'cypress',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('cypress');
    const transformer = new Transformer(rules, config, 'cypress');
    const transformResult = transformer.transform(parsed);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsed);

    expect(generated.content).toContain('test.beforeEach(');
  });
});

describe('CodeGenerator - Puppeteer', () => {
  it('should generate valid Playwright code from Puppeteer fixture', async () => {
    const fixtureContent = readFileSync(
      resolve(__dirname, '../../fixtures/puppeteer/search.test.js'),
      'utf-8',
    );
    const parser = new JavaScriptParser();
    const parsed = await parser.parse({
      path: '/tmp/search.test.js',
      relativePath: 'search.test.js',
      content: fixtureContent,
      language: 'javascript',
      framework: 'puppeteer',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('puppeteer');
    const transformer = new Transformer(rules, config, 'puppeteer');
    const transformResult = transformer.transform(parsed);

    const generator = new CodeGenerator(config);
    const generated = generator.generate(transformResult, parsed);

    expect(generated.content).toContain('@playwright/test');
    // Should not contain puppeteer references
    expect(generated.content).not.toContain("require('puppeteer')");
    // Should contain page.locator conversions
    expect(generated.content).toContain('page.locator');
  });
});

describe('CodeGenerator - generateConfig', () => {
  it('should generate a playwright.config.ts', () => {
    const config = makeConfig();
    const generator = new CodeGenerator(config);
    const configFile = generator.generateConfig([]);

    expect(configFile.path).toBe('playwright.config.ts');
    expect(configFile.type).toBe('config');
    expect(configFile.content).toContain('defineConfig');
    expect(configFile.content).toContain('chromium');
    expect(configFile.content).toContain('firefox');
    expect(configFile.content).toContain('webkit');
  });

  it('should include baseURL from capabilities', () => {
    const config = makeConfig();
    const generator = new CodeGenerator(config);
    const configFile = generator.generateConfig([
      { key: 'baseUrl', value: 'http://localhost:3000', line: 1 },
    ]);

    expect(configFile.content).toContain('http://localhost:3000');
  });
});

describe('CodeGenerator - generatePageObject', () => {
  it('should generate a TypeScript page object class', () => {
    const config = makeConfig();
    const generator = new CodeGenerator(config);
    const po = generator.generatePageObject(
      {
        name: 'LoginPage',
        selectors: [
          {
            name: 'usernameInput',
            selector: {
              type: 'id',
              value: 'username',
              strategy: 'By.id',
              line: 1,
              raw: 'By.id("username")',
              confidence: 0.95,
            },
            line: 1,
          },
        ],
        methods: [
          {
            name: 'login',
            params: [{ name: 'username' }, { name: 'password' }],
            actions: [],
            line: 10,
          },
        ],
        line: 1,
      },
      'typescript',
    );

    expect(po.type).toBe('page-object');
    expect(po.content).toContain('class LoginPage');
    expect(po.content).toContain('readonly page: Page');
    expect(po.content).toContain('usernameInput');
    expect(po.content).toContain("page.locator('#username')");
    expect(po.content).toContain('async login(');
  });
});

describe('CodeGenerator - target path', () => {
  it('should produce .spec.ts path for typescript target', async () => {
    const parser = new JavaParser();
    const parsed = await parser.parse({
      path: '/tmp/LoginTest.java',
      relativePath: 'LoginTest.java',
      content: readFileSync(
        resolve(__dirname, '../../fixtures/selenium/java/LoginTest.java'),
        'utf-8',
      ),
      language: 'java',
      framework: 'selenium',
      encoding: 'utf-8',
    });

    const config = makeConfig();
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, config, 'selenium');
    const transformResult = transformer.transform(parsed);

    expect(transformResult.targetPath).toContain('.spec.ts');
  });
});
