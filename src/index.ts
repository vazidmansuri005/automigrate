/**
 * automigrate - Enterprise-grade migration tool for converting
 * Selenium, Cypress, Puppeteer, and Appium test suites to Playwright.
 *
 * @packageDocumentation
 */

// Core engine
export { MigrationEngine } from './core/migration-engine.js';

// Parsers
export { BaseParser } from './core/parsers/base-parser.js';
export type { Parser } from './core/parsers/base-parser.js';
export { JavaParser } from './core/parsers/java-parser.js';
export { JavaScriptParser } from './core/parsers/javascript-parser.js';
export { PythonParser } from './core/parsers/python-parser.js';
export { CSharpParser } from './core/parsers/csharp-parser.js';
export { GherkinParser } from './core/parsers/gherkin-parser.js';
export { RobotParser } from './core/parsers/robot-parser.js';

// Analyzers
export { detectFramework, scanProject } from './core/analyzers/framework-detector.js';
export {
  estimateComplexity,
  analyzeFile,
  generateRecommendations,
} from './core/analyzers/complexity-estimator.js';
export { DependencyGraphBuilder } from './core/analyzers/dependency-graph.js';
export type {
  ClassNode,
  MethodNode,
  FieldNode,
  DependencyGraph,
  ResolvedMethod,
} from './core/analyzers/dependency-graph.js';
export { StructureAnalyzer } from './core/analyzers/structure-analyzer.js';
export type {
  ProjectStructure,
  TestFrameworkInfo,
  FileCategory,
  FileCategoryType,
  DetectedPattern,
  MigrationBlueprint,
  FileMigrationPlan,
  SharedResource,
} from './core/analyzers/structure-analyzer.js';

// Post-processing
export { applyPlaywrightIdioms } from './core/generators/playwright-idioms.js';

// Transformers
export {
  Transformer,
  buildSmartPattern,
  getRulesForFramework,
} from './core/transformers/transformer.js';

// Generators
export { CodeGenerator } from './core/generators/code-generator.js';
export {
  parseSourceConfig,
  generatePlaywrightConfig,
  renderPlaywrightConfigTS,
} from './core/generators/config-generator.js';
export type { SourceConfig, PlaywrightConfig } from './core/generators/config-generator.js';
export {
  generatePackageJson,
  generateRequirementsTxt,
  generateGitignore,
} from './core/generators/dependency-generator.js';
export { detectCIProvider, generateCIPipeline } from './core/generators/ci-generator.js';
export type {
  CIProvider,
  CIDetectionResult,
  CIGeneratorOptions,
} from './core/generators/ci-generator.js';
export { generateMigrationGuide } from './core/generators/guide-generator.js';
export type { GuideOptions } from './core/generators/guide-generator.js';

// Mappings
export { generateSeleniumRules } from './mappings/selenium-to-playwright.js';
export { generateCypressRules } from './mappings/cypress-to-playwright.js';
export { generatePuppeteerRules } from './mappings/puppeteer-to-playwright.js';
export { generateAppiumRules } from './mappings/appium-to-playwright.js';
export { generateWebdriverioRules } from './mappings/webdriverio-to-playwright.js';
export { generateRobotRules } from './mappings/robot-to-playwright.js';

// Config
export { loadConfig, generateConfigTemplate } from './config/loader.js';
export { DEFAULT_CONFIG } from './config/defaults.js';

// Reporters
export {
  formatAnalysisReport,
  formatMigrationReport,
  formatScanReport,
} from './core/reporters/migration-reporter.js';

// CLI / Watch mode
export { MigrationWatcher } from './cli/watcher.js';
export type { WatcherOptions, WatchEvent, WatcherState } from './cli/watcher.js';

// Utilities
export { generateDiff, formatDiffForTerminal } from './utils/diff-generator.js';

// Types — re-export everything
export type {
  // Source types
  SourceFramework,
  SourceLanguage,
  TargetLanguage,
  SourceFile,
  ParsedFile,
  // Transformation types
  TransformationRule,
  TransformConfidence,
  TransformCategory,
  TransformResult,
  TransformFileResult,
  TransformedLine,
  SmartPattern,
  // Migration types
  MigrationConfig,
  MigrationPlan,
  MigrationReport,
  MigrationFileResult,
  MigrationReportSummary,
  MigrationFilePlan,
  MigrationSummary,
  MigrationError,
  ManualIntervention,
  ManualInterventionType,
  // Generator types
  GeneratedFile,
  DiffResult,
  // Analysis types
  AnalysisResult,
  AnalyzedFile,
  Recommendation,
  // Plugin types
  AutomigratePlugin,
  // AST types
  ImportStatement,
  ClassDefinition,
  FunctionDefinition,
  TestCase,
  PageObjectDefinition,
  SelectorUsage,
  WaitUsage,
  AssertionUsage,
  HookUsage,
  CapabilityUsage,
} from './types/index.js';
