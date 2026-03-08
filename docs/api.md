# API Reference

automigrate can be used as a CLI tool or as a programmatic library. This document covers the library API.

## Quick Start

```typescript
import { MigrationEngine } from 'automigrate';

const engine = new MigrationEngine({
  sourceDir: './tests',
  outputDir: './pw-tests',
  targetLanguage: 'typescript',
  dryRun: false,
  preserveOriginal: true,
  generatePageObjects: true,
  generateFixtures: true,
  includePatterns: ['**/*.java', '**/*.js', '**/*.ts', '**/*.py'],
  excludePatterns: ['**/node_modules/**'],
  selectorStrategy: 'modernize',
  waitStrategy: 'auto-wait',
  assertionStyle: 'expect',
  parallel: true,
  maxConcurrency: 4,
  verbose: false,
});

const report = await engine.migrate();
console.log(`Migrated ${report.summary.filesSuccessful} files`);
```

---

## MigrationEngine

The main orchestrator. Provides methods for analysis, migration, diffing, and structure scanning.

### Constructor

```typescript
new MigrationEngine(config: MigrationConfig, plugins?: AutomigratePlugin[])
```

**Parameters:**

- `config` -- Full migration configuration (see [MigrationConfig](#migrationconfig) below).
- `plugins` -- Optional array of plugins that extend or override default behavior.

**Throws:** If `outputDir` is the same as `sourceDir` (safety check -- automigrate never modifies source files).

### Methods

#### `engine.analyze(): Promise<AnalysisResult>`

Scans and parses the source project without making any changes. Returns framework detection results, complexity estimates, and migration recommendations.

```typescript
const analysis = await engine.analyze();
console.log(`Found ${analysis.files.length} test files`);
for (const rec of analysis.recommendations) {
  console.log(`[${rec.type}] ${rec.message}`);
}
```

#### `engine.migrate(): Promise<MigrationReport>`

Runs the full migration pipeline: scan, parse, analyze, transform, generate, and (unless `dryRun` is true) write output files. Returns a detailed report.

```typescript
const report = await engine.migrate();

for (const result of report.results) {
  console.log(`${result.sourcePath} -> ${result.targetPath} [${result.status}]`);
}

console.log(`Success rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
console.log(`Duration: ${report.duration}ms`);
```

#### `engine.scan(): Promise<ProjectStructure>`

Deep scans the project to understand test framework usage, file roles, class hierarchies, dependency graphs, and detected patterns. Produces a `MigrationBlueprint` that maps each source file to its target location and role.

```typescript
const structure = await engine.scan();
console.log(`Complexity: ${structure.blueprint.complexity}`);
for (const plan of structure.blueprint.filePlans) {
  console.log(`${plan.sourcePath} -> ${plan.targetPath}`);
}
```

#### `engine.diff(): Promise<DiffResult[]>`

Generates diffs showing what would change for each file without writing anything. Useful for previewing a migration.

```typescript
const diffs = await engine.diff();
for (const d of diffs) {
  if (d.hasChanges) {
    console.log(`--- ${d.sourcePath}`);
    console.log(`+++ ${d.targetPath}`);
    console.log(d.diff);
  }
}
```

#### `engine.buildDependencyGraph(): Promise<DependencyGraph>`

Builds the cross-file dependency graph explicitly. Called automatically during `scan()` and `migrate()`, but can be invoked directly for analysis.

#### `engine.getDependencyGraph(): Promise<DependencyGraph>`

Returns the cached dependency graph, building it if necessary.

---

## Framework Detection

### `detectFramework(filePath: string, content: string): DetectionResult`

Detects the source framework and language from a file's path and content.

```typescript
import { detectFramework } from 'automigrate';

const result = detectFramework('LoginTest.java', fileContent);
console.log(result.framework); // "selenium"
console.log(result.language); // "java"
console.log(result.confidence); // 0.95
```

### `scanProject(config: MigrationConfig): Promise<SourceFile[]>`

Scans a directory and returns all detected test source files with framework and language metadata. Skips binary files automatically.

```typescript
import { scanProject, DEFAULT_CONFIG } from 'automigrate';

const files = await scanProject({
  ...DEFAULT_CONFIG,
  sourceDir: './my-tests',
});

for (const file of files) {
  console.log(`${file.relativePath}: ${file.framework} (${file.language})`);
}
```

---

## Parsers

All parsers implement the `Parser` interface and extend `BaseParser`.

```typescript
interface Parser {
  parse(file: SourceFile): Promise<ParsedFile>;
}
```

### Available Parsers

| Class              | Languages              | Import                                           |
| ------------------ | ---------------------- | ------------------------------------------------ |
| `JavaScriptParser` | JavaScript, TypeScript | `import { JavaScriptParser } from 'automigrate'` |
| `JavaParser`       | Java                   | `import { JavaParser } from 'automigrate'`       |
| `PythonParser`     | Python                 | `import { PythonParser } from 'automigrate'`     |
| `CSharpParser`     | C#                     | `import { CSharpParser } from 'automigrate'`     |
| `GherkinParser`    | `.feature` files       | `import { GherkinParser } from 'automigrate'`    |
| `RobotParser`      | `.robot`, `.resource`  | `import { RobotParser } from 'automigrate'`      |

### Using a Parser Directly

```typescript
import { JavaParser } from 'automigrate';
import type { SourceFile } from 'automigrate';

const parser = new JavaParser();

const sourceFile: SourceFile = {
  path: '/absolute/path/LoginTest.java',
  relativePath: 'LoginTest.java',
  content: '...file content...',
  language: 'java',
  framework: 'selenium',
  encoding: 'utf-8',
};

const parsed = await parser.parse(sourceFile);
console.log(`Test cases: ${parsed.testCases.length}`);
console.log(`Page objects: ${parsed.pageObjects.length}`);
console.log(`Selectors: ${parsed.selectors.length}`);
```

---

## Transformers

### `Transformer`

Applies transformation rules to a parsed file.

```typescript
import { Transformer, getRulesForFramework } from 'automigrate';

const rules = getRulesForFramework('selenium');
const transformer = new Transformer(rules, config, 'selenium', 'java');
const result = transformer.transform(parsedFile);

console.log(`Confidence: ${result.confidence}`);
console.log(`Transforms applied: ${result.results.length}`);
console.log(`Manual interventions: ${result.manualInterventions.length}`);
```

### `getRulesForFramework(framework: SourceFramework, customRules?: TransformationRule[]): TransformationRule[]`

Returns the combined set of built-in and custom transformation rules for a given source framework.

### `buildSmartPattern(sourceDesc: string, targetDesc: string): SmartPattern`

Converts descriptive API signatures into regex patterns with capture groups. Used internally by the mapping files but available for custom rule authoring.

```typescript
import { buildSmartPattern } from 'automigrate';

const pattern = buildSmartPattern('driver.findElement(By.id(locator))', 'page.locator(locator)');
// pattern.regex matches: driver.findElement(By.id("username"))
// pattern.template produces: page.locator("username")
```

---

## Analyzers

### `estimateComplexity(files: ParsedFile[], rules: TransformationRule[]): MigrationSummary`

Produces a summary of migration complexity across all parsed files.

### `analyzeFile(parsed: ParsedFile, rules: TransformationRule[]): AnalyzedFile`

Analyzes a single parsed file and returns complexity, test count, selector count, and migration confidence.

### `generateRecommendations(files: AnalyzedFile[]): Recommendation[]`

Generates actionable recommendations based on analysis results.

### `DependencyGraphBuilder`

Builds a cross-file dependency graph from a directory of source files.

```typescript
import { DependencyGraphBuilder } from 'automigrate';

const builder = new DependencyGraphBuilder();
const graph = await builder.buildFromDirectory('./tests', ['**/*.java'], ['**/node_modules/**']);
```

### `StructureAnalyzer`

Performs deep structural analysis including file categorization, pattern detection, and migration blueprint generation.

```typescript
import { StructureAnalyzer } from 'automigrate';

const analyzer = new StructureAnalyzer();
const structure = await analyzer.analyze('./tests', ['**/*.java'], []);
```

---

## Generators

### `CodeGenerator`

Produces Playwright test files, page objects, fixtures, and config from transformation results.

```typescript
import { CodeGenerator } from 'automigrate';

const generator = new CodeGenerator(config);
const generated = generator.generate(transformResult, parsedFile);
console.log(generated.content); // Full Playwright test file
```

### `generatePlaywrightConfig(sourceConfig: SourceConfig): PlaywrightConfig`

Converts detected source project configuration into Playwright config values.

### `generatePackageJson(targetLanguage, dependencies): GeneratedFile`

Generates a `package.json` with Playwright dependencies.

### `generateRequirementsTxt(): GeneratedFile`

Generates a Python `requirements.txt` with Playwright dependencies.

### `detectCIProvider(sourceDir): CIDetectionResult`

Detects which CI provider is in use (GitHub Actions, GitLab CI, Jenkins, CircleCI, Azure Pipelines, Travis CI).

### `generateCIPipeline(options): GeneratedFile`

Generates a CI pipeline config for Playwright.

### `generateMigrationGuide(options): GeneratedFile`

Produces a markdown migration guide with per-file instructions and recommendations.

---

## Reporters

### `formatAnalysisReport(analysis: AnalysisResult): string`

Formats an analysis result for terminal output.

### `formatMigrationReport(report: MigrationReport): string`

Formats a migration report for terminal output.

### `formatScanReport(structure: ProjectStructure): string`

Formats a project structure scan for terminal output.

---

## Utilities

### `generateDiff(sourcePath, targetPath, sourceContent, targetContent): DiffResult`

Produces a unified diff between source and generated content.

### `formatDiffForTerminal(diff: DiffResult): string`

Colorizes a diff for terminal display.

### `loadConfig(configPath?): Promise<MigrationConfig>`

Loads configuration using cosmiconfig, merging with defaults.

### `generateConfigTemplate(): string`

Returns a starter `.automigrate.config.ts` template.

### `DEFAULT_CONFIG: MigrationConfig`

The default configuration object. All fields have sensible defaults:

```typescript
{
  sourceDir: '.',
  outputDir: './playwright-tests',
  targetLanguage: 'typescript',
  dryRun: true,            // Safe by default
  preserveOriginal: true,
  generatePageObjects: false,
  generateFixtures: false,
  includePatterns: ['**/*.java', '**/*.js', '**/*.ts', /* ... */],
  excludePatterns: ['**/node_modules/**', '**/dist/**', /* ... */],
  selectorStrategy: 'preserve',
  waitStrategy: 'auto-wait',
  assertionStyle: 'expect',
  parallel: true,
  maxConcurrency: 4,
  verbose: false,
}
```

---

## Configuration Types

### `MigrationConfig`

| Field                 | Type                    | Default                | Description                                       |
| --------------------- | ----------------------- | ---------------------- | ------------------------------------------------- |
| `sourceDir`           | `string`                | `"."`                  | Root directory of source test files               |
| `outputDir`           | `string`                | `"./playwright-tests"` | Where to write generated Playwright tests         |
| `sourceFramework`     | `SourceFramework?`      | auto-detect            | Override framework detection                      |
| `sourceLanguage`      | `SourceLanguage?`       | auto-detect            | Override language detection                       |
| `targetLanguage`      | `TargetLanguage`        | `"typescript"`         | Output language                                   |
| `dryRun`              | `boolean`               | `true`                 | If true, do not write files                       |
| `preserveOriginal`    | `boolean`               | `true`                 | Keep source files untouched                       |
| `generatePageObjects` | `boolean`               | `false`                | Generate Playwright page object classes           |
| `generateFixtures`    | `boolean`               | `false`                | Generate Playwright fixture files                 |
| `includePatterns`     | `string[]`              | (see defaults)         | Glob patterns for files to include                |
| `excludePatterns`     | `string[]`              | (see defaults)         | Glob patterns for files to exclude                |
| `selectorStrategy`    | `string`                | `"preserve"`           | `"preserve"`, `"modernize"`, or `"best-practice"` |
| `waitStrategy`        | `string`                | `"auto-wait"`          | `"preserve"`, `"auto-wait"`, or `"explicit"`      |
| `assertionStyle`      | `string`                | `"expect"`             | `"expect"` or `"test.expect"`                     |
| `customRules`         | `TransformationRule[]?` | none                   | Additional transformation rules                   |
| `parallel`            | `boolean`               | `true`                 | Enable parallel file processing                   |
| `maxConcurrency`      | `number`                | `4`                    | Max parallel file processing workers              |
| `verbose`             | `boolean`               | `false`                | Enable debug logging                              |

### `SourceFramework`

```typescript
type SourceFramework = 'selenium' | 'cypress' | 'puppeteer' | 'appium' | 'webdriverio' | 'robot';
```

### `TargetLanguage`

```typescript
type TargetLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'csharp';
```

### `AutomigratePlugin`

See [Architecture Guide -- Plugin System](./architecture.md#plugin-system) for details and examples.
