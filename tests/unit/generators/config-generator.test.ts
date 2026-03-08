import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  parseSourceConfig,
  generatePlaywrightConfig,
  renderPlaywrightConfigTS,
} from '../../../src/core/generators/config-generator.js';
import {
  generatePackageJson,
  generateRequirementsTxt,
  generateGitignore,
} from '../../../src/core/generators/dependency-generator.js';

const configsDir = resolve(__dirname, '../../fixtures/configs');

describe('Config Generator (US-010)', () => {
  it('should parse wdio.conf.js and extract baseUrl', async () => {
    const config = await parseSourceConfig(`${configsDir}/wdio.conf.js`);
    expect(config.baseURL).toBe('https://app.example.com');
    expect(config.framework).toBe('webdriverio');
  });

  it('should parse wdio.conf.js browser capabilities', async () => {
    const config = await parseSourceConfig(`${configsDir}/wdio.conf.js`);
    expect(config.browsers).toContain('chrome');
    expect(config.browsers).toContain('firefox');
  });

  it('should parse wdio.conf.js parallel config', async () => {
    const config = await parseSourceConfig(`${configsDir}/wdio.conf.js`);
    expect(config.parallel).toBe(5);
    expect(config.timeout).toBe(15000);
  });

  it('should parse cypress.config.js settings', async () => {
    const config = await parseSourceConfig(`${configsDir}/cypress.config.js`);
    expect(config.baseURL).toBe('https://staging.example.com');
    expect(config.timeout).toBe(10000);
    expect(config.retries).toBe(2);
    expect(config.viewport).toEqual({ width: 1920, height: 1080 });
    expect(config.video).toBe(true);
    expect(config.screenshots).toBe(true);
  });

  it('should parse testng.xml settings', async () => {
    const config = await parseSourceConfig(`${configsDir}/testng.xml`);
    expect(config.baseURL).toBe('https://prod.example.com');
    expect(config.parallel).toBe(4);
    expect(config.browsers).toContain('chrome');
  });

  it('should generate Playwright config with browser projects', () => {
    const pwConfig = generatePlaywrightConfig({
      baseURL: 'https://example.com',
      browsers: ['chrome', 'firefox'],
      timeout: 15000,
      retries: 1,
      parallel: 4,
    });

    expect(pwConfig.projects).toHaveLength(2);
    expect(pwConfig.projects[0].use.browserName).toBe('chromium');
    expect(pwConfig.projects[0].use.channel).toBe('chrome');
    expect(pwConfig.projects[1].use.browserName).toBe('firefox');
    expect(pwConfig.timeout).toBe(15000);
    expect(pwConfig.retries).toBe(1);
    expect(pwConfig.workers).toBe(4);
  });

  it('should render valid TypeScript config file', () => {
    const pwConfig = generatePlaywrightConfig({
      baseURL: 'https://example.com',
      browsers: ['chrome'],
      viewport: { width: 1920, height: 1080 },
      video: true,
    });
    const ts = renderPlaywrightConfigTS(pwConfig);

    expect(ts).toContain('import { defineConfig');
    expect(ts).toContain('@playwright/test');
    expect(ts).toContain("baseURL: 'https://example.com'");
    expect(ts).toContain("browserName: 'chromium'");
    expect(ts).toContain("channel: 'chrome'");
    expect(ts).toContain('width: 1920');
    expect(ts).toContain("video: 'on'");
  });

  it('should map edge browser correctly', () => {
    const pwConfig = generatePlaywrightConfig({ browsers: ['edge'] });
    expect(pwConfig.projects[0].use.browserName).toBe('chromium');
    expect(pwConfig.projects[0].use.channel).toBe('msedge');
  });

  it('should map safari to webkit', () => {
    const pwConfig = generatePlaywrightConfig({ browsers: ['safari'] });
    expect(pwConfig.projects[0].use.browserName).toBe('webkit');
  });
});

describe('Dependency Generator (US-011)', () => {
  it('should generate package.json with Playwright deps', () => {
    const json = generatePackageJson({ targetLanguage: 'typescript' });
    const pkg = JSON.parse(json);

    expect(pkg.devDependencies['@playwright/test']).toBeTruthy();
    expect(pkg.devDependencies['typescript']).toBeTruthy();
    expect(pkg.scripts.test).toContain('playwright test');
  });

  it('should exclude source framework packages', () => {
    const json = generatePackageJson({
      targetLanguage: 'javascript',
      existingDeps: {
        'selenium-webdriver': '^4.0.0',
        dotenv: '^16.0.0',
        faker: '^5.0.0',
      },
      existingDevDeps: {
        cypress: '^13.0.0',
        eslint: '^8.0.0',
      },
    });
    const pkg = JSON.parse(json);

    // Framework deps excluded
    expect(pkg.dependencies?.['selenium-webdriver']).toBeUndefined();
    expect(pkg.devDependencies?.['cypress']).toBeUndefined();

    // Non-framework deps carried over
    expect(pkg.dependencies?.['dotenv']).toBe('^16.0.0');
    expect(pkg.dependencies?.['faker']).toBe('^5.0.0');
    expect(pkg.devDependencies?.['eslint']).toBe('^8.0.0');
  });

  it('should not include TypeScript deps for JS target', () => {
    const json = generatePackageJson({ targetLanguage: 'javascript' });
    const pkg = JSON.parse(json);

    expect(pkg.devDependencies['typescript']).toBeUndefined();
    expect(pkg.devDependencies['@playwright/test']).toBeTruthy();
  });

  it('should generate requirements.txt for Python', () => {
    const txt = generateRequirementsTxt();

    expect(txt).toContain('playwright>=');
    expect(txt).toContain('pytest-playwright>=');
    expect(txt).toContain('pytest>=');
  });

  it('should generate .gitignore with Playwright entries', () => {
    const gitignore = generateGitignore();

    expect(gitignore).toContain('test-results/');
    expect(gitignore).toContain('playwright-report/');
    expect(gitignore).toContain('node_modules/');
  });
});
