/**
 * Migration Engine - the main pipeline orchestrator.
 *
 * Pipeline: scan → parse → analyze → transform → generate → report
 *
 * Safety guarantees:
 * - NEVER writes to source directory
 * - Dry-run is the default mode
 * - Source files are never opened for writing
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import pLimit from 'p-limit';
import type {
  MigrationConfig,
  MigrationReport,
  MigrationReportSummary,
  MigrationFileResult,
  ParsedFile,
  SourceFile,
  AutomigratePlugin,
  GeneratedFile,
  DiffResult,
  AnalysisResult,
  TransformationRule,
} from '../types/index.js';
import { scanProject } from './analyzers/framework-detector.js';
import {
  estimateComplexity,
  analyzeFile,
  generateRecommendations,
} from './analyzers/complexity-estimator.js';
import { Transformer, getRulesForFramework } from './transformers/transformer.js';
import { CodeGenerator } from './generators/code-generator.js';
import { generateDiff } from '../utils/diff-generator.js';
import { JavaParser } from './parsers/java-parser.js';
import { JavaScriptParser } from './parsers/javascript-parser.js';
import { PythonParser } from './parsers/python-parser.js';
import { CSharpParser } from './parsers/csharp-parser.js';
import { GherkinParser } from './parsers/gherkin-parser.js';
import { RobotParser } from './parsers/robot-parser.js';
import { DependencyGraphBuilder } from './analyzers/dependency-graph.js';
import type { DependencyGraph } from './analyzers/dependency-graph.js';
import { StructureAnalyzer } from './analyzers/structure-analyzer.js';
import type { ProjectStructure } from './analyzers/structure-analyzer.js';
import { createLogger, setLogLevel } from '../utils/logger.js';

const log = createLogger('engine');

export class MigrationEngine {
  private config: MigrationConfig;
  private plugins: AutomigratePlugin[];
  private javaParser = new JavaParser();
  private jsParser = new JavaScriptParser();
  private pythonParser = new PythonParser();
  private csharpParser = new CSharpParser();
  private gherkinParser = new GherkinParser();
  private robotParser = new RobotParser();
  private dependencyGraph: DependencyGraph | null = null;

  constructor(config: MigrationConfig, plugins: AutomigratePlugin[] = []) {
    this.config = config;
    this.plugins = plugins;

    if (config.verbose) {
      setLogLevel('debug');
    }

    // Safety: ensure output dir is different from source dir
    const srcAbs = resolve(config.sourceDir);
    const outAbs = resolve(config.outputDir);
    if (srcAbs === outAbs) {
      throw new Error(
        `Safety error: outputDir ("${config.outputDir}") must be different from sourceDir ("${config.sourceDir}"). ` +
          `automigrate never modifies source files.`,
      );
    }
  }

  /**
   * Deep scan the project structure to understand:
   * - What test framework(s) are used
   * - File roles (tests, helpers, page objects, configs, features, etc.)
   * - Class hierarchies and dependencies
   * - Patterns (dynamic locators, inheritance chains, BDD, etc.)
   * - A full migration blueprint with target structure and file plans
   *
   * This is the "heavy lifting" — call this before migrate() to understand
   * what you're working with. The blueprint tells you what goes where.
   */
  async scan(): Promise<ProjectStructure> {
    log.info('Scanning project structure...');
    const analyzer = new StructureAnalyzer();
    const structure = await analyzer.analyze(
      this.config.sourceDir,
      this.config.includePatterns,
      this.config.excludePatterns,
    );

    // Also build the dependency graph for use during migration
    this.dependencyGraph = structure.dependencyGraph;

    return structure;
  }

  /**
   * Analyze the source project without making any changes.
   * Returns framework detection, complexity estimation, and recommendations.
   */
  async analyze(): Promise<AnalysisResult> {
    log.info('Starting analysis...');

    // Call plugin hooks
    for (const plugin of this.plugins) {
      if (plugin.beforeMigration) {
        await plugin.beforeMigration(this.config);
      }
    }

    // Step 1: Scan
    const sourceFiles = await scanProject(this.config);
    if (sourceFiles.length === 0) {
      log.warn('No test files found in source directory');
      return {
        sourceDir: this.config.sourceDir,
        files: [],
        summary: estimateComplexity([], []),
        recommendations: [
          {
            type: 'warning',
            message: 'No test files found. Check your sourceDir and includePatterns.',
          },
        ],
      };
    }

    // Step 2: Parse
    const parsedFiles = await this.parseFiles(sourceFiles);

    // Step 3: Analyze
    const allRules = this.collectRules(sourceFiles);
    const analyzedFiles = parsedFiles.map((pf) => analyzeFile(pf, allRules));
    const summary = estimateComplexity(parsedFiles, allRules);
    const recommendations = generateRecommendations(analyzedFiles);

    const result: AnalysisResult = {
      sourceDir: this.config.sourceDir,
      files: analyzedFiles,
      summary,
      recommendations,
    };

    log.info('Analysis complete');
    return result;
  }

  /**
   * Run the full migration pipeline.
   * Respects config.dryRun — if true, returns the plan without writing files.
   */
  async migrate(): Promise<MigrationReport> {
    const startTime = Date.now();
    log.info('Starting migration...');

    // Call plugin hooks
    for (const plugin of this.plugins) {
      if (plugin.beforeMigration) {
        await plugin.beforeMigration(this.config);
      }
    }

    // Step 0: Deep structure analysis (builds blueprint + dependency graph)
    let projectStructure: ProjectStructure | null = null;
    try {
      projectStructure = await this.scan();
      log.info(
        `Structure analysis complete: ${projectStructure.blueprint.complexity} complexity, ` +
          `${projectStructure.blueprint.filePlans.length} files planned`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Structure analysis skipped (${msg}), falling back to basic scan`);
    }

    // Step 1: Scan files
    const sourceFiles = await scanProject(this.config);
    log.info(`Found ${sourceFiles.length} files to migrate`);

    // Step 2: Parse
    const parsedFiles = await this.parseFiles(sourceFiles);
    log.info(`Parsed ${parsedFiles.length} files`);

    // Build a lookup from source path to blueprint target path
    const blueprintTargets = new Map<string, string>();
    if (projectStructure) {
      for (const plan of projectStructure.blueprint.filePlans) {
        blueprintTargets.set(plan.sourcePath, plan.targetPath);
      }
    }

    // Step 3: Transform + Generate
    const fileResults: MigrationFileResult[] = [];
    const generatedFiles: GeneratedFile[] = [];
    const allPageObjects: ParsedFile['pageObjects'] = [];

    for (const parsed of parsedFiles) {
      try {
        const rules = getRulesForFramework(parsed.source.framework, this.config.customRules);
        const transformer = new Transformer(
          rules,
          this.config,
          parsed.source.framework,
          parsed.source.language,
        );
        const transformResult = transformer.transform(parsed);

        const generator = new CodeGenerator(this.config);
        const generated = generator.generate(transformResult, parsed);
        generatedFiles.push(generated);

        // Collect page objects for fixture generation
        if (parsed.pageObjects.length > 0) {
          allPageObjects.push(...parsed.pageObjects);

          if (this.config.generatePageObjects) {
            for (const po of parsed.pageObjects) {
              generatedFiles.push(generator.generatePageObject(po, this.config.targetLanguage));
            }
          }
        }

        // Build diff
        const diff = generateDiff(
          parsed.source.relativePath,
          transformResult.targetPath,
          parsed.source.content,
          generated.content,
        );

        const manualCount =
          transformResult.manualInterventions.length +
          transformResult.transformedLines.filter((l) => l.needsReview).length;

        fileResults.push({
          sourcePath: parsed.source.relativePath,
          targetPath: transformResult.targetPath,
          status:
            transformResult.confidence > 0.8
              ? 'success'
              : transformResult.confidence > 0.5
                ? 'partial'
                : 'failed',
          transformationsApplied: transformResult.results.length,
          transformationsSkipped: 0,
          manualInterventionsRequired: manualCount,
          errors: [],
          warnings: transformResult.results
            .filter((r) => r.requiresManualReview)
            .map((r) => `Line ${r.line}: ${r.warnings.join(', ') || 'Low confidence transform'}`),
          diff: diff.diff,
          generatedCode: generated.content,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Failed to transform ${parsed.source.relativePath}: ${message}`);
        fileResults.push({
          sourcePath: parsed.source.relativePath,
          targetPath: parsed.source.relativePath,
          status: 'failed',
          transformationsApplied: 0,
          transformationsSkipped: 0,
          manualInterventionsRequired: 0,
          errors: [
            {
              file: parsed.source.relativePath,
              message,
              code: 'TRANSFORM_ERROR',
              severity: 'error',
            },
          ],
          warnings: [],
        });
      }
    }

    // Generate fixtures if requested
    if (this.config.generateFixtures && allPageObjects.length > 0) {
      const generator = new CodeGenerator(this.config);
      const fixtures = generator.generateFixtures(allPageObjects, this.config.targetLanguage);
      if (fixtures) generatedFiles.push(fixtures);
    }

    // Generate playwright config
    const allCapabilities = parsedFiles.flatMap((pf) => pf.capabilities);
    if (allCapabilities.length > 0) {
      const generator = new CodeGenerator(this.config);
      generatedFiles.push(generator.generateConfig(allCapabilities));
    }

    // Step 4: Write files (unless dry-run)
    if (!this.config.dryRun) {
      // Create target folder structure from blueprint
      if (projectStructure) {
        for (const folder of projectStructure.blueprint.targetStructure) {
          await mkdir(join(this.config.outputDir, folder.path), { recursive: true });
        }
      }
      await this.writeFiles(generatedFiles);
      log.info(`Wrote ${generatedFiles.length} files to ${this.config.outputDir}`);
    } else {
      log.info(
        `Dry run — ${generatedFiles.length} files would be written to ${this.config.outputDir}`,
      );
    }

    // Step 5: Build report
    const summary = this.buildReportSummary(fileResults, parsedFiles);

    const report: MigrationReport = {
      plan: {
        config: this.config,
        files: [],
        summary: estimateComplexity(parsedFiles, []),
        createdAt: new Date().toISOString(),
      },
      results: fileResults,
      summary,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    // Call plugin hooks
    for (const plugin of this.plugins) {
      if (plugin.afterMigration) {
        await plugin.afterMigration(report);
      }
    }

    log.info('Migration complete');
    return report;
  }

  /**
   * Generate diffs showing what would change without writing files.
   */
  async diff(): Promise<DiffResult[]> {
    const sourceFiles = await scanProject(this.config);
    const parsedFiles = await this.parseFiles(sourceFiles);
    const diffs: DiffResult[] = [];

    for (const parsed of parsedFiles) {
      const rules = getRulesForFramework(parsed.source.framework, this.config.customRules);
      const transformer = new Transformer(
        rules,
        this.config,
        parsed.source.framework,
        parsed.source.language,
      );
      const transformResult = transformer.transform(parsed);

      const generator = new CodeGenerator(this.config);
      const generated = generator.generate(transformResult, parsed);

      diffs.push(
        generateDiff(
          parsed.source.relativePath,
          transformResult.targetPath,
          parsed.source.content,
          generated.content,
        ),
      );
    }

    return diffs;
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private async parseFiles(sourceFiles: SourceFile[]): Promise<ParsedFile[]> {
    const limit = pLimit(this.config.maxConcurrency);
    const parsedFiles: ParsedFile[] = [];

    const tasks = sourceFiles.map((file) =>
      limit(async () => {
        try {
          // Select parser based on language
          const parser = this.getParser(file);
          if (!parser) {
            log.warn(`No parser available for ${file.language} (${file.relativePath})`);
            return null;
          }

          // Check for plugin custom parser
          for (const plugin of this.plugins) {
            if (plugin.customParser) {
              const result = await plugin.customParser(file);
              if (result) return result;
            }
          }

          return await parser.parse(file);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Provide user-friendly error for syntax errors
          if (
            msg.includes('SyntaxError') ||
            msg.includes('Unexpected token') ||
            msg.includes('Parse error')
          ) {
            log.error(
              `Syntax error in ${file.relativePath}: ${msg}. ` +
                `Fix the syntax error in the source file before migrating.`,
            );
          } else {
            log.error(`Failed to parse ${file.relativePath}: ${msg}`);
          }
          return null;
        }
      }),
    );

    const results = await Promise.all(tasks);
    for (const result of results) {
      if (result) parsedFiles.push(result);
    }

    return parsedFiles;
  }

  private getParser(file: SourceFile) {
    // Route .feature files to Gherkin parser regardless of detected language
    if (file.relativePath.endsWith('.feature')) return this.gherkinParser;
    if (file.language === 'java') return this.javaParser;
    if (file.language === 'javascript' || file.language === 'typescript') {
      return this.jsParser;
    }
    if (file.language === 'python') return this.pythonParser;
    if (file.language === 'csharp') return this.csharpParser;
    if (file.language === 'robot') return this.robotParser;
    return null;
  }

  /**
   * Build cross-file dependency graph for understanding class hierarchies,
   * method resolution, and helper class relationships.
   */
  async buildDependencyGraph(): Promise<DependencyGraph> {
    const builder = new DependencyGraphBuilder();
    this.dependencyGraph = await builder.buildFromDirectory(
      this.config.sourceDir,
      this.config.includePatterns,
      this.config.excludePatterns,
    );
    return this.dependencyGraph;
  }

  /**
   * Get the dependency graph (builds it if not already built).
   */
  async getDependencyGraph(): Promise<DependencyGraph> {
    if (!this.dependencyGraph) {
      return this.buildDependencyGraph();
    }
    return this.dependencyGraph;
  }

  private collectRules(sourceFiles: SourceFile[]): TransformationRule[] {
    const frameworks = new Set(sourceFiles.map((f) => f.framework));
    const rules: TransformationRule[] = [];
    for (const fw of frameworks) {
      rules.push(...getRulesForFramework(fw, this.config.customRules));
    }
    return rules;
  }

  private async writeFiles(files: GeneratedFile[]): Promise<void> {
    for (const file of files) {
      const fullPath = join(this.config.outputDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
    }
  }

  private buildReportSummary(
    results: MigrationFileResult[],
    parsedFiles: ParsedFile[],
  ): MigrationReportSummary {
    const filesSuccessful = results.filter((r) => r.status === 'success').length;
    const filesPartial = results.filter((r) => r.status === 'partial').length;
    const filesFailed = results.filter((r) => r.status === 'failed').length;
    const filesSkipped = results.filter((r) => r.status === 'skipped').length;

    const totalTransformations = results.reduce((sum, r) => sum + r.transformationsApplied, 0);
    const manualInterventions = results.reduce((sum, r) => sum + r.manualInterventionsRequired, 0);

    // Count issues
    const issueCounts = new Map<string, number>();
    for (const r of results) {
      for (const w of r.warnings) {
        const type = w.split(':')[0] ?? 'Unknown';
        issueCounts.set(type, (issueCounts.get(type) ?? 0) + 1);
      }
      for (const e of r.errors) {
        issueCounts.set(e.code, (issueCounts.get(e.code) ?? 0) + 1);
      }
    }

    const topIssues = Array.from(issueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, description: type }));

    const baseSummary = estimateComplexity(parsedFiles, []);

    return {
      ...baseSummary,
      totalTransformations,
      manualInterventions,
      successRate: results.length > 0 ? filesSuccessful / results.length : 0,
      filesSuccessful,
      filesPartial,
      filesFailed,
      filesSkipped,
      topIssues,
    };
  }
}
