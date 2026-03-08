/**
 * End-to-end test: migrate a realistic, complex Selenium Java test
 * and verify what converts cleanly vs. what needs manual review.
 */

import { describe, it, expect } from 'vitest';
import { MigrationEngine } from '../../src/core/migration-engine.js';
import type { MigrationConfig } from '../../src/types/index.js';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../fixtures');

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: fixturesDir,
    outputDir: resolve(__dirname, '../__e2e_output__'),
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java', '**/*.js', '**/*.ts', '**/*.py', '**/*.cs'],
    excludePatterns: ['**/node_modules/**'],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: false,
    maxConcurrency: 1,
    verbose: false,
    ...overrides,
  };
}

describe('Real-world migration coverage', () => {
  it('should migrate EcommerceCheckoutTest.java and produce valid Playwright output', async () => {
    const config = makeConfig({
      includePatterns: ['**/EcommerceCheckoutTest.java'],
    });
    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    expect(report.results.length).toBe(1);
    const result = report.results[0];
    expect(result.generatedCode).toBeDefined();

    const code = result.generatedCode!;

    // --- Imports ---
    expect(code).toContain("import { test, expect } from '@playwright/test'");

    // --- Navigation ---
    expect(code).toContain('page.goto(');

    // --- Selectors converted ---
    expect(code).toContain("page.locator('#search-input')");
    expect(code).toContain("page.locator('#add-to-cart-btn')");
    expect(code).toContain("page.locator('#cart-icon')");

    // --- By.name compound rules ---
    expect(code).toContain('[name="firstName"]');
    expect(code).toContain('[name="lastName"]');

    // --- Actions converted ---
    expect(code).toContain('.fill(');
    expect(code).toContain('.click()');

    // --- Assertions converted ---
    expect(code).toContain('expect(');

    // --- Lifecycle handled ---
    expect(code).not.toContain('new ChromeDriver');
    expect(code).not.toContain('driver.quit()');

    // Print the generated code for visual inspection
    console.log('\n=== GENERATED CODE ===\n');
    console.log(code);
    console.log('\n=== END ===\n');
  });

  it('should flag complex patterns that need manual review', async () => {
    const config = makeConfig({
      includePatterns: ['**/EcommerceCheckoutTest.java'],
    });
    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    const result = report.results[0];
    const code = result.generatedCode!;

    // These patterns should have TODO markers or manual review warnings
    const todoCount = (code.match(/TODO.*automigrate/g) || []).length;
    const reviewCount = (code.match(/Review this/g) || []).length;

    console.log(`\n--- Migration Quality ---`);
    console.log(`Total transformations applied: ${result.transformationsApplied}`);
    console.log(`Manual interventions needed: ${result.manualInterventionsRequired}`);
    console.log(`TODO markers in output: ${todoCount}`);
    console.log(`Review markers: ${reviewCount}`);
    console.log(`Status: ${result.status}`);
    console.log(`Warnings: ${result.warnings.length}`);
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  });

  it('should handle all fixture files without crashing', async () => {
    const config = makeConfig();
    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    // No files should have "failed" status
    const failed = report.results.filter((r) => r.status === 'failed');
    expect(failed).toHaveLength(0);

    console.log(`\n--- Full Suite Migration ---`);
    console.log(`Files processed: ${report.results.length}`);
    console.log(`Success: ${report.summary.filesSuccessful}`);
    console.log(`Partial: ${report.summary.filesPartial}`);
    console.log(`Failed: ${report.summary.filesFailed}`);
    console.log(`Total transformations: ${report.summary.totalTransformations}`);
    console.log(`Success rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
  });

  it('should migrate Cypress fixture correctly', async () => {
    const config = makeConfig({
      includePatterns: ['**/login.cy.js'],
    });
    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).toContain('test.describe(');
    expect(code).toContain('test(');
    expect(code).toContain('page.goto(');
    expect(code).toContain('page.locator(');
    expect(code).not.toContain('cy.visit');
    expect(code).not.toContain('cy.get');
  });

  it('should migrate Puppeteer fixture correctly', async () => {
    const config = makeConfig({
      includePatterns: ['**/search.test.js'],
    });
    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).toContain('page.locator(');
    expect(code).not.toContain('page.$');
    expect(code).not.toContain('puppeteer.launch');
    expect(code).not.toContain('browser.close');
  });

  it('should migrate Selenium JS fixture correctly', async () => {
    const config = makeConfig({
      includePatterns: ['**/selenium/js/login.test.js'],
    });
    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).toContain('page.goto(');
    expect(code).toContain('page.locator(');
    expect(code).toContain('.fill(');
    expect(code).not.toContain('driver.findElement');
    expect(code).not.toContain("require('selenium-webdriver')");
  });
});
