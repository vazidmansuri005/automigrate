# Architecture Guide

## Overview

automigrate converts test suites written in Selenium, Cypress, Puppeteer, Appium, WebdriverIO, and Robot Framework into Playwright tests. The tool operates as a deterministic pipeline that preserves test intent while adapting API calls, selectors, assertions, and test structure to Playwright idioms.

## Pipeline

The migration pipeline executes six stages in order:

```
 Source Files
      |
      v
 +----------+     +---------+     +-----------+     +-------------+     +------------+     +----------+
 |  Detect  | --> |  Parse  | --> |  Analyze  | --> |  Transform  | --> |  Generate  | --> |  Report  |
 +----------+     +---------+     +-----------+     +-------------+     +------------+     +----------+
      |                |               |                   |                  |                  |
  framework        AST per         complexity          rule-based         Playwright          summary,
  + language        file           estimates,          line + struct      code output          diffs,
  detection                        dep graph           transforms                            confidence
```

### Stage 1: Detect

**Module:** `src/core/analyzers/framework-detector.ts`

Scans the source directory using fast-glob, reads each file, and applies pattern-based detection to determine which framework (Selenium, Cypress, Puppeteer, Appium, WebdriverIO, Robot) and language (Java, Python, JavaScript, TypeScript, C#, Robot) each file uses. Binary files are skipped automatically by checking for null bytes in the first 8KB.

**Exports:** `detectFramework(filePath, content)`, `scanProject(config)`

### Stage 2: Parse

**Modules:** `src/core/parsers/`

Each source language has a dedicated parser that produces a `ParsedFile` containing imports, classes, functions, test cases, page objects, selectors, waits, assertions, hooks, and capabilities. The parsers use Babel (JavaScript/TypeScript), tree-sitter (Java, Python, C#), and custom parsers (Gherkin, Robot Framework).

| Parser             | File                   | Languages                   |
| ------------------ | ---------------------- | --------------------------- |
| `JavaScriptParser` | `javascript-parser.ts` | JavaScript, TypeScript      |
| `JavaParser`       | `java-parser.ts`       | Java                        |
| `PythonParser`     | `python-parser.ts`     | Python                      |
| `CSharpParser`     | `csharp-parser.ts`     | C#                          |
| `GherkinParser`    | `gherkin-parser.ts`    | `.feature` files            |
| `RobotParser`      | `robot-parser.ts`      | `.robot`, `.resource` files |

All parsers extend `BaseParser` and implement the `Parser` interface.

### Stage 3: Analyze

**Modules:** `src/core/analyzers/`

- **`complexity-estimator.ts`** -- Scores each file's migration difficulty based on selector types, wait patterns, custom assertions, and code volume. Files exceeding 500 lines receive lower readiness scores.
- **`dependency-graph.ts`** (`DependencyGraphBuilder`) -- Builds a cross-file graph of class hierarchies, method resolution order, and helper relationships. Used to understand inheritance chains (e.g., `BaseTest` -> `LoginTest`) so the generated code preserves structure.
- **`structure-analyzer.ts`** (`StructureAnalyzer`) -- Categorizes files by role (test, page object, helper, config, feature), detects patterns (BDD, data-driven, parallel execution), and produces a `MigrationBlueprint` mapping source paths to target paths.

### Stage 4: Transform

**Module:** `src/core/transformers/transformer.ts`

The `Transformer` class applies a hybrid approach:

1. **Structural transforms** -- Rewrites imports, test wrappers (`describe`/`it`, `@Test`, `def test_`), hooks (`beforeAll`, `afterEach`), and class structure based on the parsed AST.
2. **Line-level API transforms** -- Uses smart regex patterns with capture groups to convert framework-specific API calls. For example, `driver.findElement(By.id(x))` becomes `page.locator('#' + x)`.
3. **Fallback markers** -- Unrecognized patterns receive `// TODO: automigrate` comments for manual review.

Transformation rules are defined per framework in `src/mappings/`:

| Mapping file                   | Source framework |
| ------------------------------ | ---------------- |
| `selenium-to-playwright.ts`    | Selenium         |
| `cypress-to-playwright.ts`     | Cypress          |
| `puppeteer-to-playwright.ts`   | Puppeteer        |
| `appium-to-playwright.ts`      | Appium           |
| `webdriverio-to-playwright.ts` | WebdriverIO      |
| `robot-to-playwright.ts`       | Robot Framework  |

Each mapping file exports a `generateXxxRules()` function that returns `TransformationRule[]`.

### Stage 5: Generate

**Modules:** `src/core/generators/`

- **`code-generator.ts`** (`CodeGenerator`) -- Assembles the final Playwright test file from transform results, adding proper imports, test structure, and page object references.
- **`config-generator.ts`** -- Generates `playwright.config.ts` from detected capabilities (browsers, viewports, base URLs).
- **`dependency-generator.ts`** -- Generates `package.json` (or `requirements.txt` for Python) with Playwright dependencies.
- **`ci-generator.ts`** -- Detects CI provider (GitHub Actions, GitLab CI, Jenkins, etc.) and generates a pipeline config.
- **`guide-generator.ts`** -- Produces a human-readable migration guide with per-file instructions.
- **`playwright-idioms.ts`** -- Post-processes generated code to apply Playwright best practices (auto-waiting, web-first assertions, locator chaining).

### Stage 6: Report

**Module:** `src/core/reporters/migration-reporter.ts`

Produces a `MigrationReport` containing per-file results (status, confidence, transformations applied, manual interventions needed), diffs, and an overall summary with success rate, top issues, and framework/language breakdowns.

**Exports:** `formatAnalysisReport()`, `formatMigrationReport()`, `formatScanReport()`

## Data Flow Diagram

```
                          .automigrate.config.ts
                                  |
                                  v
                         +------------------+
    Source Directory ---->| MigrationEngine  |----> Output Directory
                         +------------------+       (Playwright tests)
                          |    |    |    |
                          v    v    v    v
                        scan parse xform generate
                          |    |    |    |
                          v    v    v    v
                     SourceFile[]  |  TransformFileResult[]
                                  v         |
                             ParsedFile[]   v
                                       GeneratedFile[]
                                            |
                                            v
                                     MigrationReport
                                     (JSON + terminal)
```

## Plugin System

Plugins implement the `AutomigratePlugin` interface and are passed to `MigrationEngine` at construction time.

```typescript
interface AutomigratePlugin {
  name: string;
  version: string;
  sourceFramework?: SourceFramework;
  transformationRules?: TransformationRule[];
  beforeMigration?: (config: MigrationConfig) => Promise<void>;
  afterMigration?: (report: MigrationReport) => Promise<void>;
  customParser?: (file: SourceFile) => Promise<ParsedFile>;
  customGenerator?: (parsed: ParsedFile, targetLang: TargetLanguage) => Promise<string>;
}
```

### Writing a Custom Transformer Plugin

To add support for a custom framework or override default behavior:

```typescript
import type { AutomigratePlugin, TransformationRule } from 'automigrate';

const myPlugin: AutomigratePlugin = {
  name: 'my-custom-transforms',
  version: '1.0.0',
  sourceFramework: 'selenium',

  // Add custom transformation rules
  transformationRules: [
    {
      sourcePattern: /myCustomApi\.doSomething\((.+?)\)/,
      targetPattern: 'await page.evaluate($1)',
      confidence: 'high',
      category: 'custom',
    },
  ],

  // Hook: runs before migration starts
  async beforeMigration(config) {
    console.log(`Migrating from ${config.sourceDir}`);
  },

  // Hook: runs after migration completes
  async afterMigration(report) {
    console.log(`Migrated ${report.summary.filesSuccessful} files`);
  },
};

// Usage
import { MigrationEngine } from 'automigrate';
const engine = new MigrationEngine(config, [myPlugin]);
const report = await engine.migrate();
```

Plugins can also provide a `customParser` to handle file formats that the built-in parsers do not support, or a `customGenerator` to produce output in a non-standard format.

## Key Types

| Type                  | Purpose                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `SourceFramework`     | `"selenium" \| "cypress" \| "puppeteer" \| "appium" \| "webdriverio" \| "robot"`                                                              |
| `SourceLanguage`      | `"java" \| "python" \| "javascript" \| "typescript" \| "csharp" \| "robot"`                                                                   |
| `ParsedFile`          | AST representation of a source file: imports, classes, functions, test cases, page objects, selectors, waits, assertions, hooks, capabilities |
| `TransformResult`     | A single transformation applied: original text, transformed text, line number, confidence, warnings                                           |
| `TransformFileResult` | All transformations for one file: transformed lines, manual interventions, import block, confidence score                                     |
| `MigrationReport`     | Final output: per-file results, summary statistics, duration, timestamp                                                                       |
| `MigrationConfig`     | All configuration options: directories, framework, language, strategies, concurrency                                                          |
| `AutomigratePlugin`   | Plugin interface: custom rules, parsers, generators, lifecycle hooks                                                                          |
| `TransformationRule`  | A single rule: source pattern, target template, confidence, category                                                                          |

## Directory Structure

```
src/
  cli/                    # CLI entry point, interactive mode, watcher
    index.ts              # Commander-based CLI
    interactive.ts        # Inquirer-based guided mode
    watcher.ts            # File watcher for continuous migration
    guided.ts             # Step-by-step guided migration
  config/                 # Configuration loading and defaults
    loader.ts             # cosmiconfig-based config loader
    defaults.ts           # Default MigrationConfig values
  core/
    migration-engine.ts   # Main pipeline orchestrator
    analyzers/            # Detection, complexity, dependency graph, structure
    generators/           # Code, config, dependency, CI, guide generators
    parsers/              # Language-specific AST parsers
    reporters/            # Terminal and JSON report formatters
    transformers/         # Rule-based transformation engine
  frameworks/             # (reserved for framework-specific utilities)
  mappings/               # Per-framework transformation rule sets
  types/                  # TypeScript type definitions
    index.ts              # All shared types
  utils/                  # Logger, diff generator
  index.ts                # Public API exports
```
