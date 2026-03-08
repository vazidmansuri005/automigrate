/**
 * Generates dependency files (package.json, requirements.txt) for the
 * migrated Playwright project, carrying over non-framework deps.
 */

import type { TargetLanguage } from '../../types/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DependencyConfig {
  targetLanguage: TargetLanguage;
  existingDeps?: Record<string, string>;
  existingDevDeps?: Record<string, string>;
  projectName?: string;
}

// Source framework packages to exclude
const EXCLUDED_PACKAGES = new Set([
  // Selenium
  'selenium-webdriver',
  'chromedriver',
  'geckodriver',
  'edgedriver',
  '@types/selenium-webdriver',
  // Cypress
  'cypress',
  '@cypress/webpack-preprocessor',
  'cypress-cucumber-preprocessor',
  // Puppeteer
  'puppeteer',
  'puppeteer-core',
  '@types/puppeteer',
  // WebdriverIO
  'webdriverio',
  '@wdio/cli',
  '@wdio/local-runner',
  '@wdio/mocha-framework',
  '@wdio/jasmine-framework',
  '@wdio/cucumber-framework',
  '@wdio/spec-reporter',
  '@wdio/allure-reporter',
  '@wdio/globals',
  '@wdio/sync',
  '@wdio/selenium-standalone-service',
  // Appium
  'appium',
  'wd',
  'webdriveragent',
  // Robot Framework (Python)
  'robotframework',
  'robotframework-seleniumlibrary',
  'robotframework-appiumlibrary',
  // Selenium (Python)
  'selenium',
]);

// ─── Package.json Generator ─────────────────────────────────────────────────

export function generatePackageJson(config: DependencyConfig): string {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {
    '@playwright/test': '^1.50.0',
  };

  if (config.targetLanguage === 'typescript') {
    devDeps['typescript'] = '^5.0.0';
    devDeps['@types/node'] = '^20.0.0';
  }

  // Carry over non-framework deps
  if (config.existingDeps) {
    for (const [pkg, ver] of Object.entries(config.existingDeps)) {
      if (!EXCLUDED_PACKAGES.has(pkg)) {
        deps[pkg] = ver;
      }
    }
  }
  if (config.existingDevDeps) {
    for (const [pkg, ver] of Object.entries(config.existingDevDeps)) {
      if (!EXCLUDED_PACKAGES.has(pkg)) {
        devDeps[pkg] = ver;
      }
    }
  }

  const pkg: Record<string, unknown> = {
    name: config.projectName ?? 'playwright-tests',
    version: '1.0.0',
    private: true,
    scripts: {
      test: 'npx playwright test',
      'test:headed': 'npx playwright test --headed',
      'test:ui': 'npx playwright test --ui',
      report: 'npx playwright show-report',
      codegen: 'npx playwright codegen',
    },
    devDependencies: sortObject(devDeps),
  };

  if (Object.keys(deps).length > 0) {
    pkg.dependencies = sortObject(deps);
  }

  return JSON.stringify(pkg, null, 2) + '\n';
}

// ─── Requirements.txt Generator ─────────────────────────────────────────────

export function generateRequirementsTxt(): string {
  return ['playwright>=1.50.0', 'pytest-playwright>=0.5.0', 'pytest>=8.0.0', ''].join('\n');
}

// ─── .gitignore Generator ───────────────────────────────────────────────────

export function generateGitignore(): string {
  return [
    'node_modules/',
    'test-results/',
    'playwright-report/',
    'blob-report/',
    '.playwright/',
    '*.png',
    '*.webm',
    '',
  ].join('\n');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sortObject(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
