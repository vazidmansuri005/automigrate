import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { MigrationEngine } from '../../../src/core/migration-engine.js';
import type { MigrationConfig } from '../../../src/types/index.js';

const fixturesDir = resolve(__dirname, '../../fixtures/selenium/java');
const outputDir = '/tmp/automigrate-selenium-advanced-test';

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: fixturesDir,
    outputDir,
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/AdvancedSeleniumTest.java'],
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

describe('Java Selenium Advanced Transforms (US-006)', () => {
  it('should migrate AdvancedSeleniumTest.java without crashing', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    expect(report.results.length).toBe(1);
    expect(report.results[0].status).not.toBe('failed');
    expect(report.results[0].generatedCode).toBeTruthy();
  });

  it('should convert Actions.moveToElement to .hover()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.hover()');
    expect(code).not.toContain('new Actions(driver).moveToElement');
  });

  it('should convert Actions.dragAndDrop to .dragTo()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.dragTo(');
    expect(code).not.toContain('new Actions(driver).dragAndDrop');
  });

  it('should convert Actions.contextClick to .click({right})', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain("click({ button: 'right' })");
  });

  it('should convert Actions.doubleClick to .dblclick()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('.dblclick()');
  });

  it('should convert Select.selectByVisibleText to selectOption({label})', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('selectOption({ label:');
  });

  it('should convert Select.selectByValue to selectOption()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('selectOption("us")');
  });

  it('should convert Select.selectByIndex to selectOption({index})', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('selectOption({ index:');
  });

  it('should convert getWindowHandles to context.pages()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('context.pages()');
  });

  it('should convert WebDriverWait(visibilityOfElementLocated) to waitFor()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain("waitFor({ state: 'visible' })");
  });

  it('should convert WebDriverWait(titleIs) to toHaveTitle()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toHaveTitle(');
  });

  it('should convert WebDriverWait(urlContains) to toHaveURL()', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('toHaveURL(');
  });

  it('should convert WebDriverWait(alertIsPresent) to waitForEvent', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain("waitForEvent('dialog')");
  });

  it('should convert alert().accept() to dialog handling', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('dialog.accept()');
  });

  it('should include Playwright imports in output', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();
    const code = report.results[0].generatedCode!;

    expect(code).toContain('@playwright/test');
  });
});
