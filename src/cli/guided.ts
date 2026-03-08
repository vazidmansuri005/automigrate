/**
 * Guided Migration Flow
 *
 * The default `npx automigrate` experience:
 *
 *   Phase 1: Scan — deep-analyze the repo, show what was found
 *   Phase 2: Plan — show the proposed migration plan, save to .automigrate/plan.json
 *   Phase 3: Refine — user reviews, reclassifies files, adds context for missed patterns
 *   Phase 4: Migrate — execute migration based on the refined plan
 *
 * The plan file (.automigrate/plan.json) is human-editable and can be re-used
 * across runs. Users can also run `npx automigrate --plan .automigrate/plan.json`
 * to skip the scan phase and migrate from a saved plan.
 */

import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { MigrationEngine } from '../core/migration-engine.js';
import { loadConfig } from '../config/loader.js';
import { formatScanReport, formatMigrationReport } from '../core/reporters/migration-reporter.js';
import type { MigrationConfig } from '../types/index.js';
import type {
  ProjectStructure,
  FileMigrationPlan,
  FileCategoryType,
} from '../core/analyzers/structure-analyzer.js';

// ─── Plan file types ─────────────────────────────────────────────────────────

export interface MigrationPlanFile {
  version: '1.0';
  createdAt: string;
  sourceDir: string;
  outputDir: string;
  targetLanguage: string;
  selectorStrategy: string;
  waitStrategy: string;
  scan: {
    primaryLanguage: string;
    frameworks: Array<{
      name: string;
      language: string;
      fileCount: number;
      confidence: number;
      features: string[];
    }>;
    patterns: Array<{
      name: string;
      description: string;
      migrationStrategy: string;
    }>;
  };
  files: Array<{
    sourcePath: string;
    targetPath: string;
    category: FileCategoryType;
    strategy: FileMigrationPlan['strategy'];
    include: boolean;
    userNotes?: string;
  }>;
  targetStructure: Array<{
    path: string;
    purpose: string;
  }>;
  userContext?: string;
}

// ─── Readline helpers ────────────────────────────────────────────────────────

function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl: ReturnType<typeof createRl>, question: string): Promise<string> {
  return new Promise((res) => rl.question(question, res));
}

// ─── Pretty output helpers ──────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';

function banner() {
  console.log('');
  console.log(`  ${BOLD}automigrate${RESET} — Migrate any test framework to Playwright`);
  console.log(`  ${'─'.repeat(55)}`);
  console.log('');
}

function section(title: string) {
  console.log(`\n  ${BOLD}${CYAN}${title}${RESET}`);
  console.log(`  ${'─'.repeat(55)}`);
}

function fileTree(files: MigrationPlanFile['files']) {
  // Group by category
  const groups = new Map<string, typeof files>();
  for (const f of files) {
    const cat = f.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(f);
  }

  const categoryLabels: Record<string, string> = {
    test: 'Tests',
    'page-object': 'Page Objects',
    helper: 'Helpers & Utilities',
    'base-class': 'Base Classes',
    config: 'Configuration',
    fixture: 'Fixtures & Data Providers',
    'step-definition': 'Step Definitions (BDD)',
    'feature-file': 'Feature Files (BDD)',
    'data-provider': 'Data Providers',
    utility: 'Utilities',
    model: 'Models',
    unknown: 'Uncategorized',
  };

  for (const [category, groupFiles] of groups) {
    const label = categoryLabels[category] ?? category;
    const included = groupFiles.filter((f) => f.include).length;
    const total = groupFiles.length;
    const marker = included === total ? GREEN + '●' : YELLOW + '◐';
    console.log(
      `\n  ${marker}${RESET} ${BOLD}${label}${RESET} ${DIM}(${included}/${total} files)${RESET}`,
    );

    for (const f of groupFiles) {
      const check = f.include ? `${GREEN}✓${RESET}` : `${DIM}✗${RESET}`;
      const arrow = `${DIM}→${RESET}`;
      const strategy = `${DIM}[${f.strategy}]${RESET}`;
      console.log(`    ${check} ${f.sourcePath} ${arrow} ${f.targetPath} ${strategy}`);
      if (f.userNotes) {
        console.log(`      ${DIM}note: ${f.userNotes}${RESET}`);
      }
    }
  }
}

function targetTree(structure: MigrationPlanFile['targetStructure']) {
  console.log(`\n  ${BOLD}Target Playwright structure:${RESET}`);
  for (const folder of structure) {
    console.log(`    ${BLUE}📁 ${folder.path}${RESET} ${DIM}— ${folder.purpose}${RESET}`);
  }
}

// ─── Main flow ──────────────────────────────────────────────────────────────

export async function runGuidedMigration(opts: {
  sourceDir?: string;
  outputDir?: string;
  planFile?: string;
  yes?: boolean;
  verbose?: boolean;
}): Promise<void> {
  banner();

  // If a plan file is provided, load it and skip to Phase 4
  if (opts.planFile) {
    const planPath = resolve(opts.planFile);
    if (!existsSync(planPath)) {
      console.error(`  Plan file not found: ${planPath}`);
      process.exit(1);
    }
    const plan = JSON.parse(await readFile(planPath, 'utf-8')) as MigrationPlanFile;
    console.log(`  ${GREEN}Loaded plan from ${planPath}${RESET}`);
    console.log(`  ${plan.files.filter((f) => f.include).length} files to migrate\n`);
    await executeMigration(plan, opts.verbose ?? false);
    return;
  }

  const rl = createRl();

  try {
    // ── Phase 1: Scan ──────────────────────────────────────────────────────

    const rawSource =
      opts.sourceDir ?? ((await ask(rl, `  Source directory ${DIM}[.]${RESET}: `)) || '.');
    const sourceDir = resolve(rawSource);

    if (!existsSync(sourceDir)) {
      console.error(`\n  Directory not found: ${sourceDir}`);
      rl.close();
      process.exit(1);
    }

    section('Phase 1: Scanning your repository');
    console.log(`  Analyzing ${sourceDir}...\n`);

    const config = await loadConfig({
      sourceDir,
      verbose: opts.verbose ?? false,
    });

    const engine = new MigrationEngine(config);
    let structure: ProjectStructure;

    try {
      structure = await engine.scan();
    } catch (err: any) {
      console.error(`\n  Scan failed: ${err.message}`);
      rl.close();
      process.exit(1);
    }

    // Show scan results
    console.log(formatScanReport(structure));

    if (structure.fileCategories.length === 0 || structure.blueprint.filePlans.length === 0) {
      console.log('  No test files found. Check your source directory.\n');
      rl.close();
      return;
    }

    // ── Phase 2: Build plan ────────────────────────────────────────────────

    section('Phase 2: Migration Plan');

    const rawOutput =
      opts.outputDir ??
      ((await ask(rl, `  Output directory ${DIM}[./playwright-tests]${RESET}: `)) ||
        './playwright-tests');
    const outputDir = resolve(rawOutput);

    if (resolve(outputDir) === resolve(sourceDir)) {
      console.error('  Output directory must differ from source directory.');
      rl.close();
      process.exit(1);
    }

    // Ask for target language
    const defaultLang = structure.primaryLanguage === 'python' ? 'python' : 'typescript';
    const langPrompt = `  Target language ${DIM}[${defaultLang}]${RESET} (typescript/javascript/python): `;
    const langInput = opts.yes ? '' : await ask(rl, langPrompt);
    const targetLanguage = ['typescript', 'javascript', 'python'].includes(langInput.trim())
      ? langInput.trim()
      : defaultLang;

    console.log(`  ${DIM}Using target language: ${targetLanguage}${RESET}\n`);

    // Build the plan file
    const plan: MigrationPlanFile = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      sourceDir,
      outputDir,
      targetLanguage,
      selectorStrategy: 'preserve',
      waitStrategy: 'auto-wait',
      scan: {
        primaryLanguage: structure.primaryLanguage,
        frameworks: structure.testFrameworks.map((fw) => ({
          name: fw.name,
          language: fw.language,
          fileCount: fw.fileCount,
          confidence: fw.confidence,
          features: fw.features,
        })),
        patterns: structure.patterns.map((p) => ({
          name: p.name,
          description: p.description,
          migrationStrategy: p.migrationStrategy,
        })),
      },
      files: structure.blueprint.filePlans.map((fp) => ({
        sourcePath: fp.sourcePath,
        targetPath: fp.targetPath,
        category: fp.category,
        strategy: fp.strategy,
        include: fp.strategy !== 'skip',
      })),
      targetStructure: structure.blueprint.targetStructure,
    };

    // Show file mapping
    fileTree(plan.files);
    targetTree(plan.targetStructure);

    console.log(`\n  ${BOLD}Complexity:${RESET} ${structure.blueprint.complexity}`);
    console.log(`  ${BOLD}Total files:${RESET} ${plan.files.length}`);
    console.log('');

    // Save plan file
    const planDir = join(sourceDir, '.automigrate');
    await mkdir(planDir, { recursive: true });
    const planPath = join(planDir, 'plan.json');
    await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    console.log(`  ${DIM}Plan saved to ${planPath}${RESET}`);
    console.log(
      `  ${DIM}You can edit this file and re-run with: npx automigrate --plan ${planPath}${RESET}\n`,
    );

    // ── Phase 3: Refine ────────────────────────────────────────────────────

    section('Phase 3: Review & Refine');

    const wantsRefine = opts.yes
      ? 'n'
      : await ask(rl, `  Would you like to refine the plan? ${DIM}(y/N)${RESET}: `);

    if (wantsRefine.toLowerCase() === 'y') {
      await refinePlan(rl, plan);
      // Save updated plan
      await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
      console.log(`\n  ${GREEN}Plan updated and saved.${RESET}\n`);
    }

    // ── Phase 4: Migrate ───────────────────────────────────────────────────

    section('Phase 4: Execute Migration');

    const includedCount = plan.files.filter((f) => f.include).length;
    console.log(`\n  ${includedCount} files will be migrated to ${plan.outputDir}\n`);

    if (!opts.yes) {
      const confirm = await ask(rl, `  Proceed with migration? ${DIM}(Y/n)${RESET}: `);
      if (confirm.toLowerCase() === 'n') {
        console.log('\n  Migration cancelled. Your plan is saved — edit and re-run anytime.\n');
        rl.close();
        return;
      }
    }

    rl.close();

    await executeMigration(plan, opts.verbose ?? false);
  } catch (err) {
    rl.close();
    throw err;
  }
}

// ─── Refinement loop ────────────────────────────────────────────────────────

async function refinePlan(rl: ReturnType<typeof createRl>, plan: MigrationPlanFile): Promise<void> {
  console.log(`
  ${BOLD}Refinement commands:${RESET}
    ${CYAN}exclude <n>${RESET}           Exclude file #n from migration
    ${CYAN}include <n>${RESET}           Re-include file #n
    ${CYAN}reclassify <n> <cat>${RESET}  Change category (test, page-object, helper, base-class, config, fixture, step-definition, feature-file)
    ${CYAN}retarget <n> <path>${RESET}   Change target path for file #n
    ${CYAN}note <n> <text>${RESET}       Add context note for file #n (e.g., explain custom patterns)
    ${CYAN}context <text>${RESET}        Add global context about the project
    ${CYAN}language <lang>${RESET}       Change target language (typescript, javascript)
    ${CYAN}strategy <strat>${RESET}      Change selector strategy (preserve, modernize, best-practice)
    ${CYAN}list${RESET}                  Show current file list with numbers
    ${CYAN}done${RESET}                  Finish refinement
  `);

  // Show numbered file list
  showNumberedList(plan);

  for (;;) {
    const input = await ask(rl, `\n  ${CYAN}refine>${RESET} `);
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (!cmd || cmd === 'done') break;

    if (cmd === 'list') {
      showNumberedList(plan);
      continue;
    }

    if (cmd === 'context') {
      plan.userContext = parts.slice(1).join(' ');
      console.log(`  ${GREEN}Global context set.${RESET}`);
      continue;
    }

    if (cmd === 'language') {
      const lang = parts[1];
      if (lang === 'typescript' || lang === 'javascript') {
        plan.targetLanguage = lang;
        console.log(`  ${GREEN}Target language: ${lang}${RESET}`);
      } else {
        console.log(`  ${YELLOW}Supported: typescript, javascript${RESET}`);
      }
      continue;
    }

    if (cmd === 'strategy') {
      const strat = parts[1];
      if (['preserve', 'modernize', 'best-practice'].includes(strat)) {
        plan.selectorStrategy = strat;
        console.log(`  ${GREEN}Selector strategy: ${strat}${RESET}`);
      } else {
        console.log(`  ${YELLOW}Supported: preserve, modernize, best-practice${RESET}`);
      }
      continue;
    }

    const idx = parseInt(parts[1], 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= plan.files.length) {
      console.log(`  ${YELLOW}Invalid file number. Use 'list' to see files.${RESET}`);
      continue;
    }

    const file = plan.files[idx];

    switch (cmd) {
      case 'exclude':
        file.include = false;
        console.log(`  ${GREEN}Excluded: ${file.sourcePath}${RESET}`);
        break;

      case 'include':
        file.include = true;
        console.log(`  ${GREEN}Included: ${file.sourcePath}${RESET}`);
        break;

      case 'reclassify': {
        const validCategories: FileCategoryType[] = [
          'test',
          'page-object',
          'helper',
          'base-class',
          'config',
          'fixture',
          'step-definition',
          'feature-file',
          'data-provider',
          'utility',
          'model',
        ];
        const newCat = parts[2] as FileCategoryType;
        if (validCategories.includes(newCat)) {
          file.category = newCat;
          // Update target path based on new category
          file.targetPath = getTargetPathForCategory(file.sourcePath, newCat);
          console.log(
            `  ${GREEN}Reclassified: ${file.sourcePath} → ${newCat} → ${file.targetPath}${RESET}`,
          );
        } else {
          console.log(`  ${YELLOW}Valid categories: ${validCategories.join(', ')}${RESET}`);
        }
        break;
      }

      case 'retarget': {
        const newPath = parts[2];
        if (newPath) {
          file.targetPath = newPath;
          console.log(`  ${GREEN}Retargeted: ${file.sourcePath} → ${newPath}${RESET}`);
        } else {
          console.log(`  ${YELLOW}Usage: retarget <n> <new-path>${RESET}`);
        }
        break;
      }

      case 'note': {
        const noteText = parts.slice(2).join(' ');
        if (noteText) {
          file.userNotes = noteText;
          console.log(`  ${GREEN}Note added to ${file.sourcePath}${RESET}`);
        } else {
          console.log(`  ${YELLOW}Usage: note <n> <text>${RESET}`);
        }
        break;
      }

      default:
        console.log(`  ${YELLOW}Unknown command: ${cmd}. Type 'done' to finish.${RESET}`);
    }
  }
}

function showNumberedList(plan: MigrationPlanFile) {
  console.log('');
  for (let i = 0; i < plan.files.length; i++) {
    const f = plan.files[i];
    const check = f.include ? `${GREEN}✓${RESET}` : `${DIM}✗${RESET}`;
    const num = `${DIM}${String(i + 1).padStart(3)}${RESET}`;
    const cat = `${DIM}[${f.category}]${RESET}`;
    console.log(`  ${num} ${check} ${f.sourcePath} → ${f.targetPath} ${cat}`);
    if (f.userNotes) {
      console.log(`      ${DIM}note: ${f.userNotes}${RESET}`);
    }
  }
}

function getTargetPathForCategory(sourcePath: string, category: FileCategoryType): string {
  const base = sourcePath.replace(/\.[^.]+$/, '');
  const name = base.split('/').pop() ?? base;

  switch (category) {
    case 'test':
      return `tests/${name}.spec.ts`;
    case 'page-object':
      return `tests/pages/${name}.ts`;
    case 'helper':
    case 'base-class':
      return `tests/helpers/${name}.ts`;
    case 'config':
      return 'playwright.config.ts';
    case 'feature-file':
      return `tests/features/${name}.spec.ts`;
    case 'step-definition':
      return `tests/helpers/${name}.ts`;
    case 'fixture':
    case 'data-provider':
      return `tests/fixtures/${name}.ts`;
    default:
      return `tests/${name}.ts`;
  }
}

// ─── Execute migration from plan ────────────────────────────────────────────

async function executeMigration(plan: MigrationPlanFile, verbose: boolean): Promise<void> {
  const includedFiles = plan.files.filter((f) => f.include);

  if (includedFiles.length === 0) {
    console.log('  No files to migrate.\n');
    return;
  }

  console.log(`\n  Migrating ${includedFiles.length} files...\n`);

  const config = await loadConfig({
    sourceDir: plan.sourceDir,
    outputDir: plan.outputDir,
    targetLanguage: plan.targetLanguage as MigrationConfig['targetLanguage'],
    selectorStrategy: plan.selectorStrategy as MigrationConfig['selectorStrategy'],
    waitStrategy: plan.waitStrategy as MigrationConfig['waitStrategy'],
    dryRun: false,
    verbose,
  });

  const engine = new MigrationEngine(config);
  const report = await engine.migrate();

  console.log(formatMigrationReport(report));

  const { filesSuccessful, filesPartial, filesFailed } = report.summary;

  section('Migration Complete');
  console.log(`
    ${GREEN}Successful:${RESET}  ${filesSuccessful}
    ${YELLOW}Partial:${RESET}     ${filesPartial}
    ${filesFailed > 0 ? '\x1b[31m' : DIM}Failed:${RESET}      ${filesFailed}
    Duration:    ${(report.duration / 1000).toFixed(2)}s
    Output:      ${plan.outputDir}
  `);

  if (report.summary.manualInterventions > 0) {
    console.log(
      `  ${YELLOW}${report.summary.manualInterventions} items need manual review.${RESET}`,
    );
    console.log(
      `  ${DIM}Look for // [automigrate] TODO comments in the generated files.${RESET}\n`,
    );
  }

  // Show next steps
  console.log(`  ${BOLD}Next steps:${RESET}`);
  console.log(`    1. cd ${plan.outputDir}`);
  console.log(`    2. npm init playwright@latest`);
  console.log(`    3. npx playwright test`);
  console.log(`    4. Review any TODO comments in generated files\n`);
}
