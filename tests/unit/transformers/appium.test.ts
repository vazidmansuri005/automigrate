import { describe, it, expect } from 'vitest';
import { MigrationEngine } from '../../../src/core/migration-engine.js';
import type { MigrationConfig } from '../../../src/types/index.js';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../../fixtures');

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: fixturesDir,
    outputDir: resolve(__dirname, '../../__appium_output__'),
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/appium/**/MobileLoginTest.java'],
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

describe('Appium-to-Playwright migration', () => {
  it('should migrate MobileLoginTest.java without crashing', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    expect(report.results.length).toBe(1);
    const result = report.results[0];
    expect(result.status).not.toBe('failed');
  });

  it('should convert MobileBy.AccessibilityId to getByLabel', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).toContain('getByLabel');
    expect(code).not.toContain('MobileBy.AccessibilityId');
  });

  it('should handle TouchAction patterns', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    // Touch actions should have TODO markers
    expect(code).toContain('automigrate');
    expect(code).not.toContain('new TouchAction');
  });

  it('should convert context switching to comments', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).not.toContain('driver.context("WEBVIEW');
    expect(code).not.toContain('driver.context("NATIVE_APP');
  });

  it('should handle lambda-status reporting', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).not.toContain('lambda-status=passed');
    expect(code).toContain('automigrate');
  });

  it('should skip DesiredCapabilities and setCapability', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).not.toContain('DesiredCapabilities');
    expect(code).not.toContain('setCapability');
  });

  it('should include Playwright imports', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    const code = report.results[0].generatedCode!;
    expect(code).toContain('import');
    expect(code).toContain('@playwright/test');
  });
});

// ── US-007: Advanced Appium transform tests ──

const advancedConfig = (): MigrationConfig => ({
  sourceDir: fixturesDir,
  outputDir: resolve(__dirname, '../../__appium_advanced_output__'),
  targetLanguage: 'typescript',
  dryRun: true,
  preserveOriginal: true,
  generatePageObjects: false,
  generateFixtures: false,
  includePatterns: ['**/appium/**/AdvancedMobileTest.java'],
  excludePatterns: ['**/node_modules/**'],
  selectorStrategy: 'preserve',
  waitStrategy: 'auto-wait',
  assertionStyle: 'expect',
  parallel: false,
  maxConcurrency: 1,
  verbose: false,
});

describe('Appium Advanced Transforms (US-007)', () => {
  let code: string;

  it('should migrate AdvancedMobileTest.java without crashing', async () => {
    const engine = new MigrationEngine(advancedConfig());
    const report = await engine.migrate();
    expect(report.results.length).toBe(1);
    expect(report.results[0].status).not.toBe('failed');
    code = report.results[0].generatedCode!;
  });

  it('should convert findElementById to page.locator', () => {
    expect(code).toContain("page.locator('#com.app:id/username')");
    expect(code).not.toContain('driver.findElementById');
  });

  it('should convert findElementByXPath to page.locator xpath', () => {
    expect(code).toContain("page.locator('xpath=");
    expect(code).not.toContain('driver.findElementByXPath');
  });

  it('should convert findElementByClassName to page.locator', () => {
    expect(code).toContain("page.locator('.");
    expect(code).not.toContain('driver.findElementByClassName');
  });

  it('should convert MobileElement to const', () => {
    expect(code).not.toContain('MobileElement');
  });

  it('should handle W3C PointerInput with TODO', () => {
    expect(code).toContain('PointerInput');
    expect(code).not.toContain('new PointerInput');
  });

  it('should handle W3C driver.perform', () => {
    expect(code).not.toContain('driver.perform(Collections');
  });

  it('should convert setLocation to setGeolocation', () => {
    expect(code).toContain('setGeolocation');
    expect(code).toContain('37.7749');
    expect(code).not.toContain('driver.setLocation');
  });

  it('should handle toggleWifi with setOffline suggestion', () => {
    expect(code).toContain('setOffline');
    expect(code).not.toContain('driver.toggleWifi');
  });

  it('should handle toggleAirplaneMode', () => {
    expect(code).not.toContain('driver.toggleAirplaneMode');
  });

  it('should handle lockDevice/unlockDevice as not applicable', () => {
    expect(code).not.toContain('driver.lockDevice');
    expect(code).not.toContain('driver.unlockDevice');
  });

  it('should handle runAppInBackground as not applicable', () => {
    expect(code).not.toContain('driver.runAppInBackground');
  });

  it('should handle isAppInstalled as not applicable', () => {
    expect(code).not.toContain('driver.isAppInstalled');
  });

  it('should handle pushFile/pullFile as not applicable', () => {
    expect(code).not.toContain('driver.pushFile');
    expect(code).not.toContain('driver.pullFile');
  });

  it('should convert clipboard operations', () => {
    expect(code).toContain('navigator.clipboard');
    expect(code).not.toContain('driver.setClipboardText');
    expect(code).not.toContain('driver.getClipboardText');
  });

  it('should handle activateApp/terminateApp', () => {
    expect(code).not.toContain('driver.activateApp');
    expect(code).not.toContain('driver.terminateApp');
  });

  it('should handle getDeviceTime', () => {
    expect(code).not.toContain('driver.getDeviceTime');
  });

  it('should skip W3C and Java stdlib imports', () => {
    expect(code).not.toContain('import org.openqa.selenium.interactions');
    expect(code).not.toContain('import java.util');
    expect(code).not.toContain('import java.net');
    expect(code).not.toContain('import java.time');
  });

  it('should not contain any raw driver references outside comments', () => {
    // All driver.xxx calls should be transformed (filter out comments and TODO markers)
    const lines = code.split('\n');
    const untransformedDriverCalls = lines.filter((l) => {
      const trimmed = l.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      return /\bdriver\.\w+\s*\(/.test(trimmed);
    });
    expect(untransformedDriverCalls).toEqual([]);
  });
});
