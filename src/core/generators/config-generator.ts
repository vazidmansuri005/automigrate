/**
 * Generates playwright.config.ts from source framework configuration.
 * Parses wdio.conf.js, cypress.config.js, testng.xml, etc. and maps
 * their settings to Playwright equivalents.
 */

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { SourceFramework } from '../../types/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SourceConfig {
  baseURL?: string;
  testDir?: string;
  timeout?: number;
  retries?: number;
  parallel?: number;
  browsers?: string[];
  viewport?: { width: number; height: number };
  screenshots?: boolean | string;
  video?: boolean | string;
  headless?: boolean;
  reporter?: string[];
  envVars?: Record<string, string>;
  framework?: SourceFramework;
}

export interface PlaywrightConfig {
  baseURL?: string;
  testDir: string;
  timeout: number;
  retries: number;
  workers: number | string;
  reporter: string;
  projects: Array<{ name: string; use: { browserName: string; channel?: string } }>;
  use: {
    baseURL?: string;
    viewport?: { width: number; height: number };
    screenshot?: string;
    video?: string;
    trace?: string;
    headless?: boolean;
  };
}

// ─── Browser mapping ────────────────────────────────────────────────────────

const BROWSER_MAP: Record<string, { browserName: string; channel?: string }> = {
  chrome: { browserName: 'chromium', channel: 'chrome' },
  chromium: { browserName: 'chromium' },
  firefox: { browserName: 'firefox' },
  gecko: { browserName: 'firefox' },
  geckodriver: { browserName: 'firefox' },
  safari: { browserName: 'webkit' },
  webkit: { browserName: 'webkit' },
  edge: { browserName: 'chromium', channel: 'msedge' },
  msedge: { browserName: 'chromium', channel: 'msedge' },
  'chrome:headless': { browserName: 'chromium', channel: 'chrome' },
  electron: { browserName: 'chromium' },
};

// ─── Config Parsers ─────────────────────────────────────────────────────────

export async function parseSourceConfig(configPath: string): Promise<SourceConfig> {
  const content = await readFile(configPath, 'utf-8');
  const name = basename(configPath).toLowerCase();

  if (name.includes('wdio.conf')) return parseWdioConfig(content);
  if (name.includes('cypress.config') || name.includes('cypress.json'))
    return parseCypressConfig(content);
  if (name.endsWith('.xml') && content.includes('<suite')) return parseTestNGConfig(content);
  if (name === 'pytest.ini' || name === 'setup.cfg' || name === 'pyproject.toml')
    return parsePytestConfig(content);
  if (name === 'robot.yaml' || name === 'robot.yml') return parseRobotYamlConfig(content);

  return {};
}

function parseWdioConfig(content: string): SourceConfig {
  const config: SourceConfig = { framework: 'webdriverio' };

  // baseUrl
  const baseUrl = content.match(/baseUrl\s*:\s*['"]([^'"]+)['"]/);
  if (baseUrl) config.baseURL = baseUrl[1];

  // specs / testDir
  const specs = content.match(/specs\s*:\s*\[\s*['"]([^'"]+)['"]/);
  if (specs) config.testDir = specs[1].replace(/\/\*\*.*/, '');

  // waitforTimeout
  const timeout = content.match(/waitforTimeout\s*:\s*(\d+)/);
  if (timeout) config.timeout = parseInt(timeout[1]);

  // maxInstances
  const parallel = content.match(/maxInstances\s*:\s*(\d+)/);
  if (parallel) config.parallel = parseInt(parallel[1]);

  // capabilities → browsers
  const browsers: string[] = [];
  const capMatches = content.matchAll(/browserName\s*:\s*['"](\w+)['"]/g);
  for (const m of capMatches) browsers.push(m[1].toLowerCase());
  if (browsers.length > 0) config.browsers = [...new Set(browsers)];

  // reporters
  const reporters: string[] = [];
  const repMatches = content.matchAll(/reporters\s*:\s*\[([^\]]+)\]/g);
  for (const m of repMatches) {
    const items = m[1].match(/['"](\w+)['"]/g);
    if (items) reporters.push(...items.map((i) => i.replace(/['"]/g, '')));
  }
  if (reporters.length > 0) config.reporter = reporters;

  // screenshots / video
  if (content.includes('screenshotPath') || content.includes('saveScreenshot'))
    config.screenshots = true;
  if (content.includes('video')) config.video = true;

  return config;
}

function parseCypressConfig(content: string): SourceConfig {
  const config: SourceConfig = { framework: 'cypress' };

  // baseUrl
  const baseUrl = content.match(/baseUrl\s*:\s*['"]([^'"]+)['"]/);
  if (baseUrl) config.baseURL = baseUrl[1];

  // specPattern → testDir
  const specPattern = content.match(/specPattern\s*:\s*['"]([^'"]+)['"]/);
  if (specPattern) config.testDir = specPattern[1].replace(/\/\*\*.*/, '');

  // defaultCommandTimeout
  const timeout = content.match(/defaultCommandTimeout\s*:\s*(\d+)/);
  if (timeout) config.timeout = parseInt(timeout[1]);

  // retries
  const retries = content.match(/retries\s*:\s*(?:\{[^}]*runMode\s*:\s*)?(\d+)/);
  if (retries) config.retries = parseInt(retries[1]);

  // viewportWidth / viewportHeight
  const vw = content.match(/viewportWidth\s*:\s*(\d+)/);
  const vh = content.match(/viewportHeight\s*:\s*(\d+)/);
  if (vw && vh) config.viewport = { width: parseInt(vw[1]), height: parseInt(vh[1]) };

  // video
  if (content.match(/video\s*:\s*true/)) config.video = true;

  // screenshotOnRunFailure
  if (content.match(/screenshotOnRunFailure\s*:\s*true/)) config.screenshots = true;

  // browser
  const browser = content.match(/browser\s*:\s*['"](\w+)['"]/);
  if (browser) config.browsers = [browser[1].toLowerCase()];

  return config;
}

function parseTestNGConfig(content: string): SourceConfig {
  const config: SourceConfig = { framework: 'selenium' };

  // parallel + thread-count
  const parallel = content.match(/parallel\s*=\s*["'](\w+)["']/);
  const threads = content.match(/thread-count\s*=\s*["'](\d+)["']/);
  if (threads) config.parallel = parseInt(threads[1]);

  // suite parameters (often contain baseUrl)
  const paramMatches = content.matchAll(
    /<parameter\s+name\s*=\s*["'](\w+)["']\s+value\s*=\s*["']([^"']+)["']/g,
  );
  for (const m of paramMatches) {
    if (m[1].toLowerCase().includes('url') || m[1].toLowerCase().includes('base')) {
      config.baseURL = m[2];
    }
    if (m[1].toLowerCase() === 'browser') {
      config.browsers = [m[2].toLowerCase()];
    }
  }

  return config;
}

function parsePytestConfig(content: string): SourceConfig {
  const config: SourceConfig = { framework: 'selenium' };

  // base_url
  const baseUrl = content.match(/base_url\s*=\s*(.+)/);
  if (baseUrl) config.baseURL = baseUrl[1].trim();

  // testpaths
  const testPaths = content.match(/testpaths\s*=\s*(.+)/);
  if (testPaths) config.testDir = testPaths[1].trim();

  // timeout
  const timeout = content.match(/timeout\s*=\s*(\d+)/);
  if (timeout) config.timeout = parseInt(timeout[1]) * 1000; // pytest uses seconds

  // -n auto (parallel)
  const parallel = content.match(/addopts\s*=.*?-n\s*(\d+|auto)/);
  if (parallel) config.parallel = parallel[1] === 'auto' ? 0 : parseInt(parallel[1]);

  return config;
}

function parseRobotYamlConfig(content: string): SourceConfig {
  const config: SourceConfig = { framework: 'robot' };

  // browser
  const browser = content.match(/browser\s*:\s*(\w+)/i);
  if (browser) config.browsers = [browser[1].toLowerCase()];

  // url / base_url
  const url = content.match(/(?:base_?url|url)\s*:\s*(.+)/i);
  if (url) config.baseURL = url[1].trim();

  return config;
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generatePlaywrightConfig(source: SourceConfig): PlaywrightConfig {
  const browsers = source.browsers ?? ['chrome'];
  const projects = browsers.map((b) => {
    const mapped = BROWSER_MAP[b.toLowerCase()] ?? { browserName: 'chromium' };
    return {
      name: b,
      use: mapped,
    };
  });

  return {
    baseURL: source.baseURL,
    testDir: source.testDir ?? './tests',
    timeout: source.timeout ?? 30000,
    retries: source.retries ?? 0,
    workers: source.parallel ?? '50%',
    reporter: 'html',
    projects,
    use: {
      baseURL: source.baseURL,
      viewport: source.viewport ?? { width: 1280, height: 720 },
      screenshot: source.screenshots ? 'on' : 'only-on-failure',
      video: source.video ? 'on' : 'retain-on-failure',
      trace: 'on-first-retry',
      headless: source.headless,
    },
  };
}

export function renderPlaywrightConfigTS(config: PlaywrightConfig): string {
  const lines: string[] = [
    `import { defineConfig, devices } from '@playwright/test';`,
    ``,
    `export default defineConfig({`,
  ];

  if (config.baseURL) {
    lines.push(`  baseURL: '${config.baseURL}',`);
  }
  lines.push(`  testDir: '${config.testDir}',`);
  lines.push(`  timeout: ${config.timeout},`);
  lines.push(`  retries: ${config.retries},`);
  lines.push(
    `  workers: ${typeof config.workers === 'string' ? `'${config.workers}'` : config.workers},`,
  );
  lines.push(`  reporter: '${config.reporter}',`);
  lines.push(``);
  lines.push(`  use: {`);
  if (config.use.baseURL) {
    lines.push(`    baseURL: '${config.use.baseURL}',`);
  }
  if (config.use.viewport) {
    lines.push(
      `    viewport: { width: ${config.use.viewport.width}, height: ${config.use.viewport.height} },`,
    );
  }
  lines.push(`    screenshot: '${config.use.screenshot ?? 'only-on-failure'}',`);
  lines.push(`    video: '${config.use.video ?? 'retain-on-failure'}',`);
  lines.push(`    trace: '${config.use.trace ?? 'on-first-retry'}',`);
  if (config.use.headless !== undefined) {
    lines.push(`    headless: ${config.use.headless},`);
  }
  lines.push(`  },`);
  lines.push(``);
  lines.push(`  projects: [`);

  for (const project of config.projects) {
    lines.push(`    {`);
    lines.push(`      name: '${project.name}',`);
    lines.push(`      use: {`);
    lines.push(`        browserName: '${project.use.browserName}',`);
    if (project.use.channel) {
      lines.push(`        channel: '${project.use.channel}',`);
    }
    lines.push(`      },`);
    lines.push(`    },`);
  }

  lines.push(`  ],`);
  lines.push(`});`);
  lines.push(``);

  return lines.join('\n');
}
