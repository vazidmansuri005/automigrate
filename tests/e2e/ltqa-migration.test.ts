/**
 * End-to-end test: Run automigrate against real-world Selenium/Appium/Cucumber fixtures
 * to measure migration coverage and output quality.
 *
 * Uses local fixtures (no external repo dependency).
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { MigrationEngine } from '../../src/core/migration-engine.js';
import type { MigrationConfig } from '../../src/types/index.js';

const fixturesRoot = resolve(__dirname, '../fixtures');
const javaFixtures = resolve(fixturesRoot, 'selenium/java');
const outputDir = '/tmp/automigrate-test/playwright-output';

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: javaFixtures,
    outputDir,
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java'],
    excludePatterns: ['**/node_modules/**', '**/target/**'],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: true,
    maxConcurrency: 4,
    verbose: false,
    ...overrides,
  };
}

describe('Real-world Java migration coverage', () => {
  it('should analyze all Java fixture files without crashing', async () => {
    const engine = new MigrationEngine(makeConfig());
    const analysis = await engine.analyze();

    expect(analysis.files.length).toBeGreaterThan(0);

    // Should detect selenium framework
    const frameworks = new Set(analysis.files.map((f) => f.framework));
    expect(frameworks.has('selenium')).toBe(true);

    // Should detect java language
    const languages = new Set(analysis.files.map((f) => f.language));
    expect(languages.has('java')).toBe(true);
  });

  it('should migrate all files without crashing', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    expect(report.results.length).toBeGreaterThan(0);

    // No files should crash (status: "failed")
    const failed = report.results.filter((r) => r.status === 'failed');
    expect(failed).toHaveLength(0);

    // Should have some successful transformations
    expect(report.summary.totalTransformations).toBeGreaterThan(0);
  });

  it('should produce meaningful output for driver helper files', async () => {
    const engine = new MigrationEngine(
      makeConfig({
        includePatterns: ['**/SeleniumWebDriverHelper.java'],
      }),
    );
    const report = await engine.migrate();

    expect(report.results.length).toBe(1);
    const result = report.results[0];
    const code = result.generatedCode!;

    // Should contain Playwright imports
    expect(code).toContain('import');

    // Should have transformed some Selenium patterns
    const lines = code.split('\n');
    const playwrightLines = lines.filter(
      (l) =>
        l.includes('page.') ||
        l.includes('locator(') ||
        l.includes('expect(') ||
        l.includes('automigrate'),
    ).length;

    // Helper file should have meaningful Playwright content
    expect(playwrightLines).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(10);
  });

  it('should handle step definition files (Cucumber BDD)', async () => {
    const engine = new MigrationEngine(
      makeConfig({
        includePatterns: ['**/stepDefinitions/*.java'],
      }),
    );
    const report = await engine.migrate();

    expect(report.results.length).toBeGreaterThan(0);

    // All step defs should at least not crash
    expect(report.results.every((r) => r.status !== 'failed')).toBe(true);

    // Should produce output with Playwright content
    for (const r of report.results) {
      expect(r.generatedCode).toBeTruthy();
      expect(r.generatedCode!.length).toBeGreaterThan(0);
    }
  });

  it('should show migration coverage breakdown', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    // Categorize results
    const fullyConverted = report.results.filter(
      (r) => r.status === 'success' && r.manualInterventionsRequired === 0,
    );
    const partiallyConverted = report.results.filter(
      (r) => r.status === 'success' && r.manualInterventionsRequired > 0,
    );
    const needsWork = report.results.filter((r) => r.status === 'partial');
    const failed = report.results.filter((r) => r.status === 'failed');

    // Basic sanity: some files should be at least partially converted
    expect(fullyConverted.length + partiallyConverted.length + needsWork.length).toBeGreaterThan(0);
    expect(failed.length).toBe(0);

    // Success rate should be reasonable
    expect(report.summary.successRate).toBeGreaterThanOrEqual(0.5);
  });
});
