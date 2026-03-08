/**
 * Core type definitions for automigrate
 */

// ─── Source Framework Types ─────────────────────────────────────────────────

export type SourceFramework =
  | 'selenium'
  | 'cypress'
  | 'puppeteer'
  | 'appium'
  | 'webdriverio'
  | 'robot';

export type SourceLanguage = 'java' | 'python' | 'javascript' | 'typescript' | 'csharp' | 'robot';

export type TargetLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'csharp';

// ─── File & AST Types ──────────────────────────────────────────────────────

export interface SourceFile {
  path: string;
  relativePath: string;
  content: string;
  language: SourceLanguage;
  framework: SourceFramework;
  encoding: string;
}

export interface ParsedFile {
  source: SourceFile;
  ast: unknown;
  imports: ImportStatement[];
  classes: ClassDefinition[];
  functions: FunctionDefinition[];
  testCases: TestCase[];
  pageObjects: PageObjectDefinition[];
  selectors: SelectorUsage[];
  waits: WaitUsage[];
  assertions: AssertionUsage[];
  hooks: HookUsage[];
  capabilities: CapabilityUsage[];
}

export interface ImportStatement {
  module: string;
  members: string[];
  isDefault: boolean;
  isNamespace?: boolean;
  alias?: string;
  line: number;
  raw: string;
}

export interface ClassDefinition {
  name: string;
  extends?: string;
  implements?: string[];
  methods: FunctionDefinition[];
  properties: PropertyDefinition[];
  annotations: AnnotationUsage[];
  line: number;
  isPageObject: boolean;
  isTestClass: boolean;
}

export interface FunctionDefinition {
  name: string;
  params: ParameterDefinition[];
  parameters?: ParameterDefinition[];
  returnType?: string;
  body: string;
  annotations: AnnotationUsage[];
  isAsync: boolean;
  isStatic?: boolean;
  isTest: boolean;
  line: number;
  startLine?: number;
  endLine?: number;
}

export interface ParameterDefinition {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface PropertyDefinition {
  name: string;
  type?: string;
  value?: string;
  isStatic: boolean;
  visibility: 'public' | 'private' | 'protected';
  line: number;
}

export interface AnnotationUsage {
  name: string;
  args?: Record<string, unknown>;
  line: number;
}

// ─── Test Pattern Types ────────────────────────────────────────────────────

export interface TestCase {
  name: string;
  description?: string;
  body: string;
  selectors: SelectorUsage[];
  actions: ActionUsage[];
  assertions: AssertionUsage[];
  waits: WaitUsage[];
  hooks: HookUsage[];
  line: number;
  endLine: number;
}

export interface SelectorUsage {
  type: SelectorType;
  value: string;
  strategy: SelectorStrategy;
  line: number;
  raw: string;
  confidence: number;
}

export type SelectorType =
  | 'css'
  | 'xpath'
  | 'id'
  | 'name'
  | 'className'
  | 'tagName'
  | 'linkText'
  | 'partialLinkText'
  | 'dataTestId'
  | 'role'
  | 'text'
  | 'custom';

export type SelectorStrategy =
  | 'By.id'
  | 'By.css'
  | 'By.xpath'
  | 'By.name'
  | 'By.className'
  | 'By.tagName'
  | 'By.linkText'
  | 'By.partialLinkText'
  | 'cy.get'
  | 'cy.contains'
  | 'cy.find'
  | 'page.$'
  | 'page.$$'
  | 'page.waitForSelector'
  | 'findElement'
  | 'findElements'
  | 'custom';

export interface ActionUsage {
  type: ActionType;
  target?: SelectorUsage;
  value?: string;
  line: number;
  raw: string;
}

export type ActionType =
  | 'click'
  | 'type'
  | 'clear'
  | 'select'
  | 'hover'
  | 'doubleClick'
  | 'rightClick'
  | 'dragDrop'
  | 'scroll'
  | 'navigate'
  | 'back'
  | 'forward'
  | 'refresh'
  | 'switchFrame'
  | 'switchWindow'
  | 'switchTab'
  | 'upload'
  | 'download'
  | 'screenshot'
  | 'evaluate'
  | 'custom';

export interface AssertionUsage {
  type: AssertionType;
  target?: SelectorUsage;
  expected?: string;
  line: number;
  raw: string;
}

export type AssertionType =
  | 'visible'
  | 'hidden'
  | 'text'
  | 'value'
  | 'attribute'
  | 'count'
  | 'url'
  | 'title'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'selected'
  | 'exists'
  | 'custom';

export interface WaitUsage {
  type: WaitType;
  timeout?: number;
  condition?: string;
  line: number;
  raw: string;
}

export type WaitType =
  | 'explicit'
  | 'implicit'
  | 'sleep'
  | 'pageLoad'
  | 'networkIdle'
  | 'element'
  | 'custom';

export interface HookUsage {
  type: HookType;
  name?: string;
  body: string;
  line: number;
}

export type HookType = 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach' | 'setup' | 'teardown';

export interface CapabilityUsage {
  key: string;
  value: unknown;
  line: number;
}

// ─── Page Object Types ─────────────────────────────────────────────────────

export interface PageObjectDefinition {
  name: string;
  url?: string;
  selectors: PageObjectSelector[];
  methods: PageObjectMethod[];
  line: number;
}

export interface PageObjectSelector {
  name: string;
  selector: SelectorUsage;
  line: number;
}

export interface PageObjectMethod {
  name: string;
  params: ParameterDefinition[];
  actions: ActionUsage[];
  returnType?: string;
  line: number;
}

// ─── Transformation Types ──────────────────────────────────────────────────

export interface TransformationRule {
  id?: string;
  name?: string;
  description?: string;
  sourceFramework?: SourceFramework;
  sourcePattern: string | RegExp;
  targetTemplate?: string;
  targetPattern?: string;
  confidence: TransformConfidence;
  category: TransformCategory;
  requiresManualReview?: boolean;
  examples?: TransformExample[];
}

export type TransformConfidence = 'high' | 'medium' | 'low' | number;

export type TransformCategory =
  | 'import'
  | 'selector'
  | 'action'
  | 'assertion'
  | 'wait'
  | 'hook'
  | 'navigation'
  | 'capability'
  | 'pageObject'
  | 'config'
  | 'cookie'
  | 'window'
  | 'frame'
  | 'network'
  | 'custom';

export interface TransformExample {
  input: string;
  output: string;
  language: SourceLanguage;
}

export interface TransformResult {
  rule: TransformationRule;
  original: string;
  transformed: string;
  line: number;
  confidence: TransformConfidence;
  requiresManualReview: boolean;
  warnings: string[];
}

// ─── Migration Types ───────────────────────────────────────────────────────

export interface MigrationConfig {
  sourceDir: string;
  outputDir: string;
  sourceFramework?: SourceFramework;
  sourceLanguage?: SourceLanguage;
  targetLanguage: TargetLanguage;
  dryRun: boolean;
  preserveOriginal: boolean;
  generatePageObjects: boolean;
  generateFixtures: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  selectorStrategy: 'preserve' | 'modernize' | 'best-practice';
  waitStrategy: 'preserve' | 'auto-wait' | 'explicit';
  assertionStyle: 'expect' | 'test.expect';
  customRules?: TransformationRule[];
  bddStyle?: 'inline' | 'preserve';
  pythonTestRunner?: 'pytest' | 'unittest';
  parallel: boolean;
  maxConcurrency: number;
  verbose: boolean;
}

export interface MigrationPlan {
  config: MigrationConfig;
  files: MigrationFilePlan[];
  summary: MigrationSummary;
  createdAt: string;
}

export interface MigrationFilePlan {
  source: SourceFile;
  targetPath: string;
  detectedFramework: SourceFramework;
  detectedLanguage: SourceLanguage;
  transformations: TransformResult[];
  dependencies: string[];
  estimatedConfidence: number;
  manualInterventions: ManualIntervention[];
}

export interface ManualIntervention {
  line: number;
  type: ManualInterventionType;
  description: string;
  message?: string;
  original?: string;
  suggestion: string;
  severity: 'info' | 'warning' | 'error';
}

export type ManualInterventionType =
  | 'unsupported-api'
  | 'complex-selector'
  | 'custom-wait'
  | 'framework-specific'
  | 'ambiguous-assertion'
  | 'dynamic-content'
  | 'authentication'
  | 'file-upload'
  | 'iframe'
  | 'shadow-dom'
  | 'mobile-specific'
  | 'custom';

export interface MigrationSummary {
  totalFiles: number;
  totalTransformations: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  manualInterventions: number;
  estimatedCompletionPercentage: number;
  frameworkBreakdown: Record<SourceFramework, number>;
  languageBreakdown: Record<SourceLanguage, number>;
  categoryBreakdown: Record<TransformCategory, number>;
}

// ─── Report Types ──────────────────────────────────────────────────────────

export interface MigrationReport {
  plan: MigrationPlan;
  results: MigrationFileResult[];
  summary: MigrationReportSummary;
  duration: number;
  timestamp: string;
}

export interface MigrationFileResult {
  sourcePath: string;
  targetPath: string;
  /** @deprecated Use sourcePath */
  sourceFile?: string;
  /** @deprecated Use targetPath */
  targetFile?: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  confidence?: TransformConfidence;
  transformationsApplied: number;
  transformationsSkipped: number;
  manualInterventionsRequired: number;
  manualInterventions?: ManualIntervention[];
  errors: MigrationError[];
  warnings: string[];
  diff?: string;
  generatedCode?: string;
}

export interface MigrationReportSummary extends MigrationSummary {
  overallConfidence?: TransformConfidence;
  overallComplexity?: string;
  successRate: number;
  filesSuccessful: number;
  filesPartial: number;
  filesFailed: number;
  filesSkipped: number;
  topIssues: Array<{ type: string; count: number; description: string }>;
}

export interface MigrationError {
  file: string;
  line?: number;
  message: string;
  code: string;
  severity: 'error' | 'fatal';
}

// ─── Plugin Types ──────────────────────────────────────────────────────────

export interface AutomigratePlugin {
  name: string;
  version: string;
  sourceFramework?: SourceFramework;
  transformationRules?: TransformationRule[];
  beforeMigration?: (config: MigrationConfig) => Promise<void>;
  afterMigration?: (report: MigrationReport) => Promise<void>;
  customParser?: (file: SourceFile) => Promise<ParsedFile>;
  customGenerator?: (parsed: ParsedFile, targetLang: TargetLanguage) => Promise<string>;
}

// ─── Transformer Output Types ───────────────────────────────────────────────

export interface TransformedLine {
  lineNumber: number;
  original: string;
  transformed: string;
  ruleApplied?: TransformationRule;
  confidence: TransformConfidence;
  needsReview: boolean;
}

export interface TransformFileResult {
  sourcePath: string;
  targetPath: string;
  transformedLines: TransformedLine[];
  results: TransformResult[];
  manualInterventions: ManualIntervention[];
  importBlock: string;
  testStructure: 'function' | 'class' | 'describe-it';
  confidence: number;
}

// ─── Generator Output Types ─────────────────────────────────────────────────

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'test' | 'page-object' | 'fixture' | 'config' | 'helper';
  sourceFile?: string;
}

// ─── Diff Types ─────────────────────────────────────────────────────────────

export interface DiffResult {
  sourcePath: string;
  targetPath: string;
  diff: string;
  additions: number;
  deletions: number;
  unchanged: number;
  hasChanges?: boolean;
}

// ─── Analysis Types ─────────────────────────────────────────────────────────

export interface AnalysisResult {
  sourceDir: string;
  files: AnalyzedFile[];
  summary: MigrationSummary;
  recommendations: Recommendation[];
}

export interface AnalyzedFile {
  path: string;
  framework: SourceFramework;
  language: SourceLanguage;
  detectionConfidence: number;
  testCount: number;
  pageObjectCount: number;
  selectorCount: number;
  waitCount: number;
  assertionCount: number;
  hookCount: number;
  complexity: 'low' | 'medium' | 'high';
  estimatedMigrationConfidence: number;
  manualInterventions: ManualIntervention[];
}

export interface Recommendation {
  type: 'info' | 'warning' | 'suggestion';
  message: string;
  affectedFiles?: string[];
}

// ─── Smart Pattern Types ────────────────────────────────────────────────────

export interface SmartPattern {
  regex: RegExp;
  template: string;
  captureNames: string[];
}
