import { describe, it, expect } from 'vitest';
import { GherkinParser } from '../../../src/core/parsers/gherkin-parser.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceFile } from '../../../src/types/index.js';

const featurePath = resolve(__dirname, '../../fixtures/cucumber/login.feature');

function makeSource(content?: string): SourceFile {
  return {
    path: featurePath,
    relativePath: 'cucumber/login.feature',
    content: content ?? readFileSync(featurePath, 'utf-8'),
    language: 'java',
    framework: 'selenium',
    encoding: 'utf-8',
  };
}

describe('GherkinParser', () => {
  it('should parse a feature file and extract scenarios', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());

    // Should find 3 scenarios (successful, failed, outline with 3 rows)
    expect(result.testCases.length).toBe(3);
    expect(result.testCases[0].name).toBe('Successful login with valid credentials');
    expect(result.testCases[1].name).toBe('Failed login with invalid password');
    expect(result.testCases[2].name).toBe('Login with multiple users');
  });

  it('should extract Background as beforeEach hook', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());

    expect(result.hooks.length).toBe(1);
    expect(result.hooks[0].type).toBe('beforeEach');
    expect(result.hooks[0].body).toContain('Given');
  });

  it('should extract step keywords correctly', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());

    // First scenario should have When/And/And/Then/And steps
    const body = result.testCases[0].body;
    expect(body).toContain('When');
    expect(body).toContain('Then');
  });

  it('should generate Playwright test code from feature', async () => {
    const parser = new GherkinParser();
    const source = makeSource();
    const parsed = await parser.parse(source);

    const feature = parsed.ast as any;
    const code = parser.generatePlaywrightTest(feature);

    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain("test.describe('User Login'");
    expect(code).toContain('test.beforeEach');
    expect(code).toContain("test('Successful login with valid credentials'");
    expect(code).toContain("test('Failed login with invalid password'");
    // Scenario outline should expand into parameterized tests
    expect(code).toContain('Admin Dashboard');
    expect(code).toContain('User Dashboard');
  });

  it('should handle a minimal feature file', async () => {
    const parser = new GherkinParser();
    const minimal = `
Feature: Minimal
  Scenario: Just one test
    Given I am here
    Then I am done
`;
    const result = await parser.parse(makeSource(minimal));

    expect(result.testCases.length).toBe(1);
    expect(result.testCases[0].name).toBe('Just one test');
    expect(result.hooks.length).toBe(0); // no background
  });

  it('should preserve tags on scenarios', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());

    // First scenario has @positive tag
    expect(result.testCases[0].description).toContain('@positive');
    // Second scenario has @negative tag
    expect(result.testCases[1].description).toContain('@negative');
  });

  it('should extract feature-level tags', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());
    const feature = result.ast as any;
    expect(feature.tags).toContain('@smoke');
    expect(feature.tags).toContain('@login');
  });

  it('should extract Scenario Outline examples', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());
    const feature = result.ast as any;
    const outline = feature.scenarios.find((s: any) => s.isOutline);
    expect(outline).toBeTruthy();
    expect(outline.examples.length).toBe(1);
    expect(outline.examples[0].headers).toContain('username');
    expect(outline.examples[0].rows.length).toBe(3);
  });

  it('should handle empty feature content', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource(''));
    expect(result.testCases).toEqual([]);
    expect(result.hooks).toEqual([]);
  });

  it('should handle feature with only comments', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource('# This is a comment\n# Another comment\n'));
    expect(result.testCases).toEqual([]);
  });

  it('should generate step hints for click actions', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());
    const feature = result.ast as any;
    const code = parser.generatePlaywrightTest(feature);
    expect(code).toContain("getByRole('button'");
    expect(code).toContain('click()');
  });

  it('should generate tag annotations in output', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeSource());
    const feature = result.ast as any;
    const code = parser.generatePlaywrightTest(feature);
    expect(code).toContain('Tags: @positive');
    expect(code).toContain('Tags: @negative');
  });
});

// ── Shopping feature (data tables, doc strings) ──

const shoppingPath = resolve(__dirname, '../../fixtures/cucumber/shopping.feature');

function makeShoppingSource(): SourceFile {
  return {
    path: shoppingPath,
    relativePath: 'cucumber/shopping.feature',
    content: readFileSync(shoppingPath, 'utf-8'),
    language: 'java',
    framework: 'selenium',
    encoding: 'utf-8',
  };
}

describe('GherkinParser — Data Tables & Doc Strings (US-008)', () => {
  it('should parse data tables in steps', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeShoppingSource());
    const feature = result.ast as any;
    const checkoutScenario = feature.scenarios.find((s: any) => s.name.includes('checkout'));
    expect(checkoutScenario).toBeTruthy();
    const tableStep = checkoutScenario.steps.find(
      (s: any) => s.dataTable && s.dataTable.length > 0,
    );
    expect(tableStep).toBeTruthy();
    // First row is header, subsequent rows are data
    expect(tableStep.dataTable[0]).toContain('product');
    expect(tableStep.dataTable[1]).toContain('Widget A');
    expect(tableStep.dataTable.length).toBe(3); // 1 header + 2 data rows
  });

  it('should parse doc strings in steps', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeShoppingSource());
    const feature = result.ast as any;
    const checkoutScenario = feature.scenarios.find((s: any) => s.name.includes('checkout'));
    const docStep = checkoutScenario.steps.find((s: any) => s.docString);
    expect(docStep).toBeTruthy();
    expect(docStep.docString).toContain('John Doe');
    expect(docStep.docString).toContain('123 Main St');
  });

  it('should generate Playwright tests for shopping feature', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeShoppingSource());
    const feature = result.ast as any;
    const code = parser.generatePlaywrightTest(feature);
    expect(code).toContain("test.describe('Shopping Cart'");
    expect(code).toContain('test.beforeEach');
    expect(code).toContain('page.goto');
  });

  it('should expand Scenario Outline for shopping', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeShoppingSource());
    const feature = result.ast as any;
    const code = parser.generatePlaywrightTest(feature);
    expect(code).toContain('Electronics');
    expect(code).toContain('Clothing');
    expect(code).toContain('Books');
  });

  it('should parse Background with multiple steps', async () => {
    const parser = new GherkinParser();
    const result = await parser.parse(makeShoppingSource());
    expect(result.hooks.length).toBe(1);
    expect(result.hooks[0].body).toContain('logged in');
    expect(result.hooks[0].body).toContain('navigate');
  });
});
