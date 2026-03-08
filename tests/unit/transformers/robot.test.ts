import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { MigrationEngine } from '../../../src/core/migration-engine.js';
import type { MigrationConfig } from '../../../src/types/index.js';

const fixturesDir = resolve(__dirname, '../../fixtures/robot');
const outputDir = '/tmp/automigrate-robot-test';

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: fixturesDir,
    outputDir,
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.robot', '**/*.resource'],
    excludePatterns: [],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: true,
    maxConcurrency: 4,
    verbose: false,
    ...overrides,
  };
}

describe('Robot Framework-to-Playwright migration', () => {
  it('should detect Robot Framework in fixture files', async () => {
    const engine = new MigrationEngine(makeConfig());
    const analysis = await engine.analyze();

    expect(analysis.files.length).toBeGreaterThan(0);
    const frameworks = new Set(analysis.files.map((f) => f.framework));
    expect(frameworks.has('robot')).toBe(true);
  });

  it('should migrate login.robot without crashing', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();

    expect(report.results.length).toBe(1);
    expect(report.results[0].status).not.toBe('failed');
    expect(report.results[0].generatedCode).toBeTruthy();
  });

  it('should convert Go To to page.goto()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('page.goto(');
  });

  it('should convert Input Text to .fill()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.fill(');
  });

  it('should convert Click Element to .click()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.click()');
  });

  it('should convert Element Should Be Visible to toBeVisible()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toBeVisible()');
  });

  it('should convert Element Text Should Be to toHaveText()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toHaveText(');
  });

  it('should convert Element Should Contain to toContainText()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toContainText(');
  });

  it('should convert Wait Until Element Is Visible to waitFor()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('waitFor(');
  });

  it('should convert Location Should Be to toHaveURL()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toHaveURL(');
  });

  it('should include Playwright imports in output', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/login.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('@playwright/test');
  });

  it('should convert Select Frame to frameLocator()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('frameLocator(');
  });

  it('should convert Capture Page Screenshot to page.screenshot()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('page.screenshot(');
  });

  it('should convert Execute JavaScript to page.evaluate()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('page.evaluate(');
  });

  it('should convert Title Should Be to toHaveTitle()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toHaveTitle(');
  });

  it('should convert Select From List By Value to selectOption()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('selectOption(');
  });

  it('should convert Select Checkbox to .check()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.check()');
  });

  it('should convert Checkbox Should Be Selected to toBeChecked()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toBeChecked()');
  });

  it('should convert Mouse Over to .hover()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.hover()');
  });

  it('should convert Scroll Element Into View to scrollIntoViewIfNeeded()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('scrollIntoViewIfNeeded()');
  });

  it('should convert Drag And Drop to .dragTo()', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.dragTo(');
  });

  it('should convert cookie operations', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('addCookies(');
    expect(code).toContain('clearCookies()');
  });

  it('should convert Switch Window NEW to waitForEvent', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/advanced.robot'] }));
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain("waitForEvent('page')");
  });

  it('should migrate all Robot fixture files without crashing', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    expect(report.results.length).toBe(3);
    const failed = report.results.filter((r) => r.status === 'failed');
    expect(failed).toHaveLength(0);
  });

  it('should scan Robot fixtures and detect framework in structure analyzer', async () => {
    const engine = new MigrationEngine(makeConfig());
    const structure = await engine.scan();

    const robotFramework = structure.testFrameworks.find((fw) => fw.name === 'Robot Framework');
    expect(robotFramework).toBeDefined();
    expect(robotFramework!.fileCount).toBeGreaterThan(0);
  });

  it('should parse custom keywords from resource file', async () => {
    const engine = new MigrationEngine(makeConfig({ includePatterns: ['**/common.resource'] }));
    const report = await engine.migrate();

    expect(report.results.length).toBe(1);
    expect(report.results[0].status).not.toBe('failed');
  });
});
