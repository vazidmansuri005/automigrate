import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { MigrationEngine } from '../../src/core/migration-engine.js';
import type { MigrationConfig } from '../../src/types/index.js';

const FIXTURES_DIR = resolve(__dirname, '../fixtures');
const OUTPUT_DIR = resolve(__dirname, '../__output_integration__');

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: FIXTURES_DIR,
    outputDir: OUTPUT_DIR,
    targetLanguage: 'typescript',
    dryRun: false,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java', '**/*.js', '**/*.ts'],
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

// Clean up output directory after tests
afterAll(() => {
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe('MigrationEngine - safety checks', () => {
  it('should throw if sourceDir equals outputDir', () => {
    expect(() => {
      new MigrationEngine(makeConfig({ sourceDir: '/tmp/same', outputDir: '/tmp/same' }));
    }).toThrow('Safety error');
  });
});

describe('MigrationEngine - analyze', () => {
  it('should analyze the fixtures directory', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const analysis = await engine.analyze();

    expect(analysis.sourceDir).toBe(FIXTURES_DIR);
    expect(analysis.files.length).toBeGreaterThan(0);
    expect(analysis.summary.totalFiles).toBeGreaterThan(0);
  });

  it('should detect multiple frameworks in fixtures', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const analysis = await engine.analyze();

    const frameworks = new Set(analysis.files.map((f) => f.framework));
    // The fixtures have selenium (Java), cypress (JS), and puppeteer (JS)
    expect(frameworks.size).toBeGreaterThanOrEqual(2);
  });

  it('should include complexity for each file', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const analysis = await engine.analyze();

    for (const file of analysis.files) {
      expect(['low', 'medium', 'high']).toContain(file.complexity);
    }
  });
});

describe('MigrationEngine - migrate (dry run)', () => {
  it('should return migration results for all files', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const report = await engine.migrate();

    expect(report.results.length).toBeGreaterThan(0);
    expect(report.duration).toBeGreaterThan(0);
    expect(report.timestamp).toBeDefined();
  });

  it('should have transformation counts', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const report = await engine.migrate();

    const totalTransformations = report.results.reduce(
      (sum, r) => sum + r.transformationsApplied,
      0,
    );
    expect(totalTransformations).toBeGreaterThan(0);
  });

  it('should not create output files in dry run mode', async () => {
    const dryRunOutput = resolve(__dirname, '../__dryrun_output__');
    const engine = new MigrationEngine(makeConfig({ dryRun: true, outputDir: dryRunOutput }));
    await engine.migrate();

    expect(existsSync(dryRunOutput)).toBe(false);
  });
});

describe('MigrationEngine - migrate (write files)', () => {
  it('should write output files when dryRun is false', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: false }));
    const report = await engine.migrate();

    expect(report.results.length).toBeGreaterThan(0);

    // At least one generated file should exist
    const successResults = report.results.filter(
      (r) => r.status === 'success' || r.status === 'partial',
    );
    expect(successResults.length).toBeGreaterThan(0);

    // Check that output files were created
    for (const result of successResults) {
      const outputPath = resolve(OUTPUT_DIR, result.targetPath);
      expect(existsSync(outputPath)).toBe(true);
    }
  });

  it('should produce generated code containing page.locator or page.goto', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: false }));
    const report = await engine.migrate();

    const successResults = report.results.filter(
      (r) => r.generatedCode && (r.status === 'success' || r.status === 'partial'),
    );

    const hasPlaywrightCode = successResults.some(
      (r) =>
        r.generatedCode!.includes('page.locator') ||
        r.generatedCode!.includes('page.goto') ||
        r.generatedCode!.includes('page.getByText'),
    );
    expect(hasPlaywrightCode).toBe(true);
  });

  it('should produce generated code with @playwright/test import', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: false }));
    const report = await engine.migrate();

    const successResults = report.results.filter(
      (r) => r.generatedCode && (r.status === 'success' || r.status === 'partial'),
    );

    const hasImport = successResults.some((r) => r.generatedCode!.includes('@playwright/test'));
    expect(hasImport).toBe(true);
  });
});

describe('MigrationEngine - diff', () => {
  it('should generate diffs for all files', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const diffs = await engine.diff();

    expect(diffs.length).toBeGreaterThan(0);

    for (const diff of diffs) {
      expect(diff.sourcePath).toBeDefined();
      expect(diff.targetPath).toBeDefined();
      expect(diff.diff).toBeDefined();
      expect(diff.additions).toBeGreaterThanOrEqual(0);
      expect(diff.deletions).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('MigrationEngine - report summary', () => {
  it('should have success rate between 0 and 1', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const report = await engine.migrate();

    expect(report.summary.successRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.successRate).toBeLessThanOrEqual(1);
  });

  it('should count files correctly', async () => {
    const engine = new MigrationEngine(makeConfig({ dryRun: true }));
    const report = await engine.migrate();

    const totalFiles =
      report.summary.filesSuccessful +
      report.summary.filesPartial +
      report.summary.filesFailed +
      report.summary.filesSkipped;
    expect(totalFiles).toBe(report.results.length);
  });
});
