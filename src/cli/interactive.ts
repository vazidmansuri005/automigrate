/**
 * Interactive CLI wizard for guided migration.
 *
 * Walks the user through every migration option step-by-step,
 * auto-detects frameworks, shows a summary, then runs the migration.
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { MigrationEngine } from '../core/migration-engine.js';
import { loadConfig } from '../config/loader.js';
import {
  formatAnalysisReport,
  formatMigrationReport,
} from '../core/reporters/migration-reporter.js';
import type {
  SourceFramework,
  TargetLanguage,
  AnalysisResult,
  MigrationConfig,
} from '../types/index.js';

// ─── Readline helpers (fallback when inquirer is unavailable) ────────────────

function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl: ReturnType<typeof createRl>, question: string): Promise<string> {
  return new Promise((res) => rl.question(question, res));
}

// ─── Inquirer dynamic import wrapper ─────────────────────────────────────────

interface InquirerAnswers {
  [key: string]: unknown;
}

async function loadInquirer() {
  try {
    const mod = await import('inquirer');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SELECTOR_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  preserve: 'Keep original selectors as-is (safest, no behavior change)',
  modernize: "Convert legacy selectors to modern equivalents (e.g. By.id -> locator('[id=...]'))",
  'best-practice':
    'Rewrite selectors following Playwright best practices (data-testid, role, text)',
};

const WAIT_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  preserve: 'Keep explicit waits as-is (may be redundant with Playwright auto-wait)',
  'auto-wait': "Remove explicit waits and rely on Playwright's built-in auto-waiting (recommended)",
  explicit: 'Convert to Playwright explicit waitFor* calls',
};

const TARGET_LANGUAGES: { value: TargetLanguage; label: string }[] = [
  { value: 'typescript', label: 'TypeScript (recommended)' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
];

// ─── Wizard with inquirer ────────────────────────────────────────────────────

async function runWithInquirer(inquirer: any): Promise<void> {
  console.log('\n  ================================================');
  console.log('    automigrate - Interactive Migration Wizard');
  console.log('  ================================================\n');

  // Step 1: Source directory
  const { sourceDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'sourceDir',
      message: 'Source directory containing tests to migrate:',
      default: '.',
      validate: (input: string) => {
        const resolved = resolve(input);
        if (!existsSync(resolved)) {
          return `Directory does not exist: ${resolved}`;
        }
        return true;
      },
    },
  ]);
  const resolvedSource = resolve(sourceDir);

  // Step 2: Output directory
  const { outputDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputDir',
      message: 'Output directory for migrated Playwright tests:',
      default: './playwright-tests',
      validate: (input: string) => {
        const resolved = resolve(input);
        if (resolved === resolvedSource) {
          return 'Output directory must differ from the source directory.';
        }
        return true;
      },
    },
  ]);
  const resolvedOutput = resolve(outputDir);

  // Step 3: Auto-detect frameworks
  console.log('\n  Analyzing source directory...\n');

  const analysisConfig = await loadConfig({
    sourceDir: resolvedSource,
    outputDir: resolvedOutput,
    verbose: false,
  });

  const engine = new MigrationEngine(analysisConfig);
  let analysis: AnalysisResult;

  try {
    analysis = await engine.analyze();
  } catch (err: any) {
    console.error(`\n  Analysis failed: ${err.message}\n`);
    process.exit(1);
  }

  console.log(formatAnalysisReport(analysis));

  const detectedFrameworks = Object.entries(analysis.summary.frameworkBreakdown)
    .filter(([, count]) => count > 0)
    .map(([fw]) => fw as SourceFramework);

  if (detectedFrameworks.length === 0) {
    console.log('\n  No supported test frameworks detected in the source directory.');
    console.log('  Supported: selenium, cypress, puppeteer, appium\n');
    process.exit(1);
  }

  // Step 4: Select framework
  let selectedFramework: SourceFramework;

  if (detectedFrameworks.length === 1) {
    const { confirmFramework } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmFramework',
        message: `Detected framework: ${detectedFrameworks[0]}. Proceed with this?`,
        default: true,
      },
    ]);
    if (!confirmFramework) {
      console.log('\n  Aborted.\n');
      process.exit(0);
    }
    selectedFramework = detectedFrameworks[0];
  } else {
    const { framework } = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: 'Multiple frameworks detected. Which one do you want to migrate?',
        choices: detectedFrameworks.map((fw) => {
          const count = analysis.summary.frameworkBreakdown[fw];
          return { name: `${fw} (${count} file${count !== 1 ? 's' : ''})`, value: fw };
        }),
      },
    ]);
    selectedFramework = framework;
  }

  // Step 5: Target language
  const { targetLanguage } = await inquirer.prompt([
    {
      type: 'list',
      name: 'targetLanguage',
      message: 'Target language for generated Playwright tests:',
      choices: TARGET_LANGUAGES.map((tl) => ({ name: tl.label, value: tl.value })),
      default: 'typescript',
    },
  ]);

  // Step 6: Selector strategy
  const { selectorStrategy } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectorStrategy',
      message: 'Selector migration strategy:',
      choices: Object.entries(SELECTOR_STRATEGY_DESCRIPTIONS).map(([value, desc]) => ({
        name: `${value} - ${desc}`,
        value,
      })),
      default: 'preserve',
    },
  ]);

  // Step 7: Wait strategy
  const { waitStrategy } = await inquirer.prompt([
    {
      type: 'list',
      name: 'waitStrategy',
      message: 'Wait/timing strategy:',
      choices: Object.entries(WAIT_STRATEGY_DESCRIPTIONS).map(([value, desc]) => ({
        name: `${value} - ${desc}`,
        value,
      })),
      default: 'auto-wait',
    },
  ]);

  // Step 8: Summary & confirmation
  console.log('\n  ─── Migration Summary ────────────────────────────');
  console.log(`    Source directory:    ${resolvedSource}`);
  console.log(`    Output directory:    ${resolvedOutput}`);
  console.log(`    Source framework:    ${selectedFramework}`);
  console.log(`    Target language:     ${targetLanguage}`);
  console.log(`    Selector strategy:   ${selectorStrategy}`);
  console.log(`    Wait strategy:       ${waitStrategy}`);
  console.log(`    Files to migrate:    ${analysis.summary.frameworkBreakdown[selectedFramework]}`);
  console.log('  ──────────────────────────────────────────────────\n');

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with migration?',
      default: true,
    },
  ]);

  if (!confirm) {
    console.log('\n  Migration cancelled.\n');
    return;
  }

  // Step 9: Run migration
  console.log('\n  Running migration...\n');

  const migrationConfig = await loadConfig({
    sourceDir: resolvedSource,
    outputDir: resolvedOutput,
    sourceFramework: selectedFramework,
    targetLanguage,
    selectorStrategy,
    waitStrategy,
    dryRun: false,
    verbose: false,
  });

  const migrationEngine = new MigrationEngine(migrationConfig);
  const report = await migrationEngine.migrate();

  // Step 10: Results
  console.log(formatMigrationReport(report));

  const { filesSuccessful, filesPartial, filesFailed, filesSkipped } = report.summary;
  console.log('\n  ─── Migration Complete ───────────────────────────');
  console.log(`    Successful:  ${filesSuccessful}`);
  console.log(`    Partial:     ${filesPartial}`);
  console.log(`    Failed:      ${filesFailed}`);
  console.log(`    Skipped:     ${filesSkipped}`);
  console.log(`    Duration:    ${(report.duration / 1000).toFixed(2)}s`);
  console.log('  ──────────────────────────────────────────────────\n');

  if (report.summary.manualInterventions > 0) {
    console.log(`  Note: ${report.summary.manualInterventions} manual intervention(s) required.`);
    console.log('  Review the generated files for TODO comments.\n');
  }
}

// ─── Fallback wizard using readline ──────────────────────────────────────────

async function runWithReadline(): Promise<void> {
  const rl = createRl();

  console.log('\n  ================================================');
  console.log('    automigrate - Interactive Migration Wizard');
  console.log('  ================================================');
  console.log('  (inquirer not available, using basic prompts)\n');

  try {
    // Step 1: Source directory
    let resolvedSource = '';
    for (;;) {
      const sourceDir = (await ask(rl, '  Source directory [.]: ')) || '.';
      resolvedSource = resolve(sourceDir);
      if (existsSync(resolvedSource)) break;
      console.log(`  Directory does not exist: ${resolvedSource}`);
    }

    // Step 2: Output directory
    let resolvedOutput = '';
    for (;;) {
      const outputDir =
        (await ask(rl, '  Output directory [./playwright-tests]: ')) || './playwright-tests';
      resolvedOutput = resolve(outputDir);
      if (resolvedOutput !== resolvedSource) break;
      console.log('  Output directory must differ from the source directory.');
    }

    // Step 3: Auto-detect frameworks
    console.log('\n  Analyzing source directory...\n');

    const analysisConfig = await loadConfig({
      sourceDir: resolvedSource,
      outputDir: resolvedOutput,
      verbose: false,
    });

    const engine = new MigrationEngine(analysisConfig);
    let analysis: AnalysisResult;

    try {
      analysis = await engine.analyze();
    } catch (err: any) {
      console.error(`\n  Analysis failed: ${err.message}\n`);
      rl.close();
      process.exit(1);
    }

    console.log(formatAnalysisReport(analysis));

    const detectedFrameworks = Object.entries(analysis.summary.frameworkBreakdown)
      .filter(([, count]) => count > 0)
      .map(([fw]) => fw as SourceFramework);

    if (detectedFrameworks.length === 0) {
      console.log('\n  No supported test frameworks detected.');
      rl.close();
      process.exit(1);
    }

    // Step 4: Select framework
    let selectedFramework: SourceFramework;
    if (detectedFrameworks.length === 1) {
      const confirmFw = await ask(rl, `  Detected: ${detectedFrameworks[0]}. Use it? [Y/n]: `);
      if (confirmFw.toLowerCase() === 'n') {
        console.log('\n  Aborted.\n');
        rl.close();
        return;
      }
      selectedFramework = detectedFrameworks[0];
    } else {
      console.log('\n  Detected frameworks:');
      detectedFrameworks.forEach((fw, i) => {
        const count = analysis.summary.frameworkBreakdown[fw];
        console.log(`    ${i + 1}. ${fw} (${count} files)`);
      });
      const choice = await ask(rl, `  Select framework [1-${detectedFrameworks.length}]: `);
      const idx = parseInt(choice, 10) - 1;
      selectedFramework = detectedFrameworks[idx] ?? detectedFrameworks[0];
    }

    // Step 5: Target language
    console.log('\n  Target languages:');
    TARGET_LANGUAGES.forEach((tl, i) => console.log(`    ${i + 1}. ${tl.label}`));
    const langChoice = await ask(rl, '  Select target language [1]: ');
    const langIdx = parseInt(langChoice, 10) - 1;
    const targetLanguage = TARGET_LANGUAGES[langIdx]?.value ?? 'typescript';

    // Step 6: Selector strategy
    const selectorKeys = Object.keys(SELECTOR_STRATEGY_DESCRIPTIONS);
    console.log('\n  Selector strategies:');
    selectorKeys.forEach((key, i) => {
      console.log(`    ${i + 1}. ${key} - ${SELECTOR_STRATEGY_DESCRIPTIONS[key]}`);
    });
    const selChoice = await ask(rl, '  Select strategy [1]: ');
    const selIdx = parseInt(selChoice, 10) - 1;
    const selectorStrategy = selectorKeys[selIdx] ?? 'preserve';

    // Step 7: Wait strategy
    const waitKeys = Object.keys(WAIT_STRATEGY_DESCRIPTIONS);
    console.log('\n  Wait strategies:');
    waitKeys.forEach((key, i) => {
      console.log(`    ${i + 1}. ${key} - ${WAIT_STRATEGY_DESCRIPTIONS[key]}`);
    });
    const waitChoice = await ask(rl, '  Select strategy [2]: ');
    const waitIdx = parseInt(waitChoice, 10) - 1;
    const waitStrategy = waitKeys[waitIdx] ?? 'auto-wait';

    // Step 8: Summary
    console.log('\n  ─── Migration Summary ────────────────────────────');
    console.log(`    Source directory:    ${resolvedSource}`);
    console.log(`    Output directory:    ${resolvedOutput}`);
    console.log(`    Source framework:    ${selectedFramework}`);
    console.log(`    Target language:     ${targetLanguage}`);
    console.log(`    Selector strategy:   ${selectorStrategy}`);
    console.log(`    Wait strategy:       ${waitStrategy}`);
    console.log(
      `    Files to migrate:    ${analysis.summary.frameworkBreakdown[selectedFramework]}`,
    );
    console.log('  ──────────────────────────────────────────────────\n');

    const confirmMigration = await ask(rl, '  Proceed with migration? [Y/n]: ');
    if (confirmMigration.toLowerCase() === 'n') {
      console.log('\n  Migration cancelled.\n');
      rl.close();
      return;
    }

    rl.close();

    // Step 9: Run migration
    console.log('\n  Running migration...\n');

    const migrationConfig = await loadConfig({
      sourceDir: resolvedSource,
      outputDir: resolvedOutput,
      sourceFramework: selectedFramework,
      targetLanguage: targetLanguage as TargetLanguage,
      selectorStrategy: selectorStrategy as MigrationConfig['selectorStrategy'],
      waitStrategy: waitStrategy as MigrationConfig['waitStrategy'],
      dryRun: false,
      verbose: false,
    });

    const migrationEngine = new MigrationEngine(migrationConfig);
    const report = await migrationEngine.migrate();

    // Step 10: Results
    console.log(formatMigrationReport(report));

    const { filesSuccessful, filesPartial, filesFailed, filesSkipped } = report.summary;
    console.log('\n  ─── Migration Complete ───────────────────────────');
    console.log(`    Successful:  ${filesSuccessful}`);
    console.log(`    Partial:     ${filesPartial}`);
    console.log(`    Failed:      ${filesFailed}`);
    console.log(`    Skipped:     ${filesSkipped}`);
    console.log(`    Duration:    ${(report.duration / 1000).toFixed(2)}s`);
    console.log('  ──────────────────────────────────────────────────\n');

    if (report.summary.manualInterventions > 0) {
      console.log(`  Note: ${report.summary.manualInterventions} manual intervention(s) required.`);
      console.log('  Review the generated files for TODO comments.\n');
    }
  } catch (err) {
    rl.close();
    throw err;
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runInteractiveMode(): Promise<void> {
  const inquirer = await loadInquirer();

  if (inquirer) {
    await runWithInquirer(inquirer);
  } else {
    await runWithReadline();
  }
}
