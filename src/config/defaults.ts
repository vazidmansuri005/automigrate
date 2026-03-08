/**
 * Default configuration for automigrate.
 */

import type { MigrationConfig } from '../types/index.js';

export const DEFAULT_CONFIG: MigrationConfig = {
  sourceDir: '.',
  outputDir: './playwright-tests',
  targetLanguage: 'typescript',
  dryRun: true,
  preserveOriginal: true,
  generatePageObjects: false,
  generateFixtures: false,
  includePatterns: [
    '**/*.java',
    '**/*.js',
    '**/*.ts',
    '**/*.jsx',
    '**/*.tsx',
    '**/*.py',
    '**/*.cs',
    '**/*.cy.js',
    '**/*.cy.ts',
    '**/*.spec.js',
    '**/*.spec.ts',
    '**/*.test.js',
    '**/*.test.ts',
    '**/*.feature',
    '**/*.robot',
    '**/*.resource',
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/target/**',
    '**/__pycache__/**',
    '**/playwright-tests/**',
  ],
  selectorStrategy: 'preserve',
  waitStrategy: 'auto-wait',
  assertionStyle: 'expect',
  parallel: true,
  maxConcurrency: 4,
  verbose: false,
};
