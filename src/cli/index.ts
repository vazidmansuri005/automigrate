/**
 * automigrate CLI
 *
 * Default (no command):
 *   npx automigrate              — Guided scan → plan → refine → migrate flow
 *   npx automigrate --plan <f>   — Resume from a saved plan file
 *
 * Commands:
 *   scan <sourceDir>    — Deep-scan project structure
 *   analyze <sourceDir> — Detect frameworks, estimate complexity
 *   migrate <sourceDir> — Run full migration pipeline (non-interactive)
 *   diff <sourceDir>    — Preview changes as unified diffs
 *   init                — Generate .automigrate.config.ts template
 */

import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { MigrationEngine } from '../core/migration-engine.js';
import { loadConfig, generateConfigTemplate } from '../config/loader.js';
import {
  formatAnalysisReport,
  formatMigrationReport,
  formatScanReport,
  toJSON,
} from '../core/reporters/migration-reporter.js';
import { formatDiffForTerminal } from '../utils/diff-generator.js';
import type { MigrationConfig, SourceFramework, TargetLanguage } from '../types/index.js';
import { runGuidedMigration } from './guided.js';
import { MigrationWatcher } from './watcher.js';

const program = new Command();

program
  .name('automigrate')
  .description(
    'Migrate any test framework (Selenium, Cypress, Puppeteer, Appium, Cucumber) to Playwright',
  )
  .version('0.1.0')
  .option('--plan <path>', 'Resume migration from a saved plan file')
  .passThroughOptions()
  .action(async (opts) => {
    // Default action: run guided migration
    await runGuidedMigration({
      sourceDir: opts.args?.[0],
      outputDir: undefined,
      planFile: opts.plan,
      yes: opts.yes,
      verbose: opts.verbose,
    });
  });

// ─── scan ──────────────────────────────────────────────────────────────────

program
  .command('scan')
  .description(
    'Deep-scan project structure — detect frameworks, file roles, patterns, and generate migration blueprint',
  )
  .argument('<sourceDir>', 'Directory containing source tests')
  .option('--format <format>', 'Output format: table, json', 'table')
  .option('--output <file>', 'Write report to file instead of stdout')
  .option('-v, --verbose', 'Verbose output')
  .action(async (sourceDir: string, opts) => {
    const config = await loadConfig(
      {
        sourceDir: resolve(sourceDir),
        verbose: opts.verbose ?? false,
      },
      undefined,
    );

    const engine = new MigrationEngine(config);
    const structure = await engine.scan();

    let output: string;
    if (opts.format === 'json') {
      output = JSON.stringify(structure, null, 2);
    } else {
      output = formatScanReport(structure);
    }

    if (opts.output) {
      await writeFile(opts.output, output, 'utf-8');
      console.log(`Scan report written to ${opts.output}`);
    } else {
      console.log(output);
    }
  });

// ─── analyze ────────────────────────────────────────────────────────────────

program
  .command('analyze')
  .description('Analyze source tests — detect frameworks, estimate complexity')
  .argument('<sourceDir>', 'Directory containing source tests')
  .option('--format <format>', 'Output format: table, json, markdown', 'table')
  .option('--output <file>', 'Write report to file instead of stdout')
  .option('--config <path>', 'Path to config file')
  .option('-v, --verbose', 'Verbose output')
  .action(async (sourceDir: string, opts) => {
    const config = await loadConfig(
      {
        sourceDir: resolve(sourceDir),
        verbose: opts.verbose ?? false,
      },
      opts.config,
    );

    const engine = new MigrationEngine(config);
    const result = await engine.analyze();

    let output: string;
    if (opts.format === 'json') {
      output = JSON.stringify(result, null, 2);
    } else {
      output = formatAnalysisReport(result);
    }

    if (opts.output) {
      await writeFile(opts.output, output, 'utf-8');
      console.log(`Report written to ${opts.output}`);
    } else {
      console.log(output);
    }
  });

// ─── migrate ────────────────────────────────────────────────────────────────

program
  .command('migrate')
  .description('Migrate tests to Playwright (non-interactive)')
  .argument('<sourceDir>', 'Directory containing source tests')
  .requiredOption('--output <dir>', 'Output directory for Playwright tests')
  .option(
    '--framework <fw>',
    'Source framework: selenium, cypress, puppeteer, appium (auto-detected if omitted)',
  )
  .option('--language <lang>', 'Target language: typescript, javascript', 'typescript')
  .option('--no-dry-run', 'Actually write files (default is dry-run)')
  .option(
    '--selector-strategy <strategy>',
    'Selector strategy: preserve, modernize, best-practice',
    'preserve',
  )
  .option('--wait-strategy <strategy>', 'Wait strategy: preserve, auto-wait, explicit', 'auto-wait')
  .option('--include <glob>', 'Include glob patterns (repeatable)', collect, [])
  .option('--exclude <glob>', 'Exclude glob patterns (repeatable)', collect, [])
  .option('--page-objects', 'Generate Playwright page object classes')
  .option('--fixtures', 'Generate Playwright test fixtures')
  .option('--concurrency <n>', 'Max concurrent file processing', '4')
  .option('--watch', 'Watch source directory for changes and re-migrate incrementally')
  .option('--filter <glob>', 'Only watch files matching this glob (requires --watch)')
  .option('--config <path>', 'Path to config file')
  .option('--format <format>', 'Report format: table, json', 'table')
  .option('--report <file>', 'Write report to file')
  .option('--ai <provider>', 'Enable AI-powered refinement: anthropic, openai')
  .option('--ai-key <key>', 'API key for AI provider (or set ANTHROPIC_API_KEY / OPENAI_API_KEY)')
  .option('--ai-model <model>', 'AI model override (default: claude-sonnet-4-20250514 / gpt-4o)')
  .option('-v, --verbose', 'Verbose output')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (sourceDir: string, opts) => {
    const overrides: Partial<MigrationConfig> = {
      sourceDir: resolve(sourceDir),
      outputDir: resolve(opts.output),
      targetLanguage: opts.language as TargetLanguage,
      dryRun: opts.dryRun !== false,
      selectorStrategy: opts.selectorStrategy,
      waitStrategy: opts.waitStrategy,
      generatePageObjects: opts.pageObjects ?? false,
      generateFixtures: opts.fixtures ?? false,
      maxConcurrency: parseInt(opts.concurrency, 10),
      verbose: opts.verbose ?? false,
    };

    // AI configuration
    if (opts.ai) {
      const aiKey =
        opts.aiKey ||
        (opts.ai === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);
      if (!aiKey) {
        console.error(
          `\n  Error: AI provider "${opts.ai}" requires an API key.\n` +
            `  Pass --ai-key <key> or set ${opts.ai === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} env var.\n`,
        );
        process.exit(1);
      }
      overrides.ai = {
        provider: opts.ai as 'anthropic' | 'openai',
        apiKey: aiKey,
        model: opts.aiModel,
      };
    }

    if (opts.framework) {
      overrides.sourceFramework = opts.framework as SourceFramework;
    }
    if (opts.include?.length) {
      overrides.includePatterns = opts.include;
    }
    if (opts.exclude?.length) {
      overrides.excludePatterns = opts.exclude;
    }

    const config = await loadConfig(overrides, opts.config);

    // Watch mode (US-014)
    if (opts.watch) {
      console.log(`\n  Watching ${resolve(sourceDir)} for changes...\n`);
      const watcher = new MigrationWatcher({
        config,
        filter: opts.filter,
        onFileChange: (event) => {
          const time = event.timestamp.toLocaleTimeString();
          console.log(`  [${time}] ${event.type}: ${event.relativePath}`);
        },
        onError: (error) => {
          console.error(`  Error: ${error.message}`);
        },
      });

      process.on('SIGINT', async () => {
        console.log('\n  Stopping watcher...');
        await watcher.stop();
        const state = watcher.getState();
        console.log(`  Done. Ran ${state.migrationsRun} migration(s).\n`);
        process.exit(0);
      });

      await watcher.start();
      return;
    }

    // Safety confirmation for non-dry-run
    if (!config.dryRun && !opts.yes) {
      const { createInterface } = await import('node:readline');
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((res) => {
        rl.question(`\nThis will write files to ${config.outputDir}. Continue? (y/N) `, res);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    if (config.dryRun) {
      console.log('\n  [DRY RUN] No files will be written.\n');
    }

    const engine = new MigrationEngine(config);
    const report = await engine.migrate();

    let output: string;
    if (opts.format === 'json') {
      output = toJSON(report);
    } else {
      output = formatMigrationReport(report);
    }

    console.log(output);

    if (opts.report) {
      await writeFile(opts.report, toJSON(report), 'utf-8');
      console.log(`Full report written to ${opts.report}`);
    }

    // Show generated code preview in dry-run mode
    if (config.dryRun && report.results.length > 0) {
      console.log('\n  Preview of generated files:');
      console.log('  ' + '-'.repeat(50));
      for (const result of report.results.slice(0, 3)) {
        if (result.generatedCode) {
          console.log(`\n  --- ${result.targetPath} ---`);
          const preview = result.generatedCode
            .split('\n')
            .slice(0, 30)
            .map((l) => `  ${l}`)
            .join('\n');
          console.log(preview);
          if (result.generatedCode.split('\n').length > 30) {
            console.log('  ... (truncated)');
          }
        }
      }
      console.log('\n  To write files, run again with --no-dry-run\n');
    }
  });

// ─── diff ───────────────────────────────────────────────────────────────────

program
  .command('diff')
  .description('Preview what would change without writing files')
  .argument('<sourceDir>', 'Directory containing source tests')
  .option('--output <dir>', 'Target output directory (for path computation)', './playwright-tests')
  .option('--config <path>', 'Path to config file')
  .option('-v, --verbose', 'Verbose output')
  .action(async (sourceDir: string, opts) => {
    const config = await loadConfig(
      {
        sourceDir: resolve(sourceDir),
        outputDir: resolve(opts.output ?? './playwright-tests'),
        dryRun: true,
        verbose: opts.verbose ?? false,
      },
      opts.config,
    );

    const engine = new MigrationEngine(config);
    const diffs = await engine.diff();

    if (diffs.length === 0) {
      console.log('No files to diff.');
      return;
    }

    for (const d of diffs) {
      console.log(formatDiffForTerminal(d.diff));
      console.log(`  +${d.additions} -${d.deletions} ~${d.unchanged} unchanged\n`);
    }

    console.log(`\n  ${diffs.length} file(s) would be created/modified.\n`);
  });

// ─── init ───────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Generate a .automigrate.config.ts configuration template')
  .action(async () => {
    const configPath = join(process.cwd(), '.automigrate.config.ts');
    const template = generateConfigTemplate();

    await writeFile(configPath, template, 'utf-8');
    console.log(`\n  Created ${configPath}`);
    console.log('  Edit this file to customize your migration settings.\n');
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

// ─── Run ────────────────────────────────────────────────────────────────────

program.parse();
