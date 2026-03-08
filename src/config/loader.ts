/**
 * Configuration loader using cosmiconfig.
 * Searches for .automigrate.config.ts, .automigrate.config.js,
 * "automigrate" key in package.json, etc.
 */

import { cosmiconfig } from 'cosmiconfig';
import type { MigrationConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from './defaults.js';

const MODULE_NAME = 'automigrate';

export async function loadConfig(
  overrides?: Partial<MigrationConfig>,
  configPath?: string,
): Promise<MigrationConfig> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      `.${MODULE_NAME}.config.ts`,
      `.${MODULE_NAME}.config.js`,
      `.${MODULE_NAME}.config.json`,
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.yaml`,
      `package.json`,
    ],
  });

  let fileConfig: Partial<MigrationConfig> = {};

  if (configPath) {
    const result = await explorer.load(configPath);
    if (result) {
      fileConfig = result.config as Partial<MigrationConfig>;
    }
  } else {
    const result = await explorer.search();
    if (result) {
      fileConfig = result.config as Partial<MigrationConfig>;
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...overrides,
  };
}

export function generateConfigTemplate(): string {
  return `/** @type {import('automigrate').MigrationConfig} */
export default {
  // Source directory containing your existing tests
  sourceDir: './tests',

  // Output directory for generated Playwright tests (must differ from sourceDir)
  outputDir: './playwright-tests',

  // Target language for generated tests
  targetLanguage: 'typescript',

  // Source framework (auto-detected if omitted)
  // sourceFramework: 'selenium',

  // Dry run - preview changes without writing files (default: true)
  dryRun: true,

  // Selector conversion strategy
  // - 'preserve': Keep selectors as-is, only change the API
  // - 'modernize': Convert xpath to CSS where possible, prefer getByTestId
  // - 'best-practice': Full rewrite to role-based selectors (needs manual review)
  selectorStrategy: 'preserve',

  // Wait handling strategy
  // - 'preserve': Convert waits to Playwright equivalents
  // - 'auto-wait': Remove explicit waits (Playwright auto-waits)
  // - 'explicit': Convert to Playwright waitFor() methods
  waitStrategy: 'auto-wait',

  // Generate Playwright Page Object classes from detected page objects
  generatePageObjects: false,

  // Generate Playwright test fixtures
  generateFixtures: false,

  // File patterns to include/exclude
  includePatterns: ['**/*.java', '**/*.js', '**/*.ts', '**/*.py'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**'],

  // Parallel processing
  parallel: true,
  maxConcurrency: 4,

  // Custom transformation rules (added before built-in rules)
  // customRules: [],
};
`;
}
