/**
 * Structure Analyzer
 *
 * The "heavy lifting" component — analyzes any test automation repo to understand:
 * 1. Project layout (where are tests, helpers, page objects, configs, fixtures?)
 * 2. Test framework patterns (TestNG, JUnit, pytest, Mocha, Cucumber, etc.)
 * 3. Class hierarchies and helper relationships
 * 4. Shared utilities and base classes
 * 5. Config/capabilities patterns
 * 6. Locator strategy patterns
 *
 * Then generates a migration blueprint: what Playwright project structure to create,
 * what goes where, and what the migration strategy should be for each file category.
 */

import fg from 'fast-glob';
import { readFile } from 'node:fs/promises';
import { extname, dirname, basename } from 'node:path';
import { DependencyGraphBuilder } from './dependency-graph.js';
import type { DependencyGraph, ClassNode } from './dependency-graph.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('structure-analyzer');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectStructure {
  /** Root source directory */
  sourceDir: string;
  /** Detected primary language */
  primaryLanguage: string;
  /** Detected test framework(s) */
  testFrameworks: TestFrameworkInfo[];
  /** File categories by role */
  fileCategories: FileCategory[];
  /** Class dependency graph */
  dependencyGraph: DependencyGraph;
  /** Detected patterns that inform migration strategy */
  patterns: DetectedPattern[];
  /** Generated migration blueprint */
  blueprint: MigrationBlueprint;
}

export interface TestFrameworkInfo {
  name: string;
  language: string;
  fileCount: number;
  confidence: number;
  features: string[];
}

export interface FileCategory {
  category: FileCategoryType;
  files: string[];
  description: string;
}

export type FileCategoryType =
  | 'test'
  | 'page-object'
  | 'helper'
  | 'base-class'
  | 'config'
  | 'fixture'
  | 'step-definition'
  | 'feature-file'
  | 'data-provider'
  | 'utility'
  | 'model'
  | 'unknown';

export interface DetectedPattern {
  name: string;
  description: string;
  fileCount: number;
  examples: string[];
  migrationStrategy: string;
}

export interface MigrationBlueprint {
  /** Target folder structure */
  targetStructure: TargetFolder[];
  /** Per-file migration plan */
  filePlans: FileMigrationPlan[];
  /** Shared resources to generate */
  sharedResources: SharedResource[];
  /** Estimated migration complexity */
  complexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  /** Migration order (files should be migrated in this order) */
  migrationOrder: string[];
}

export interface TargetFolder {
  path: string;
  purpose: string;
}

export interface FileMigrationPlan {
  sourcePath: string;
  targetPath: string;
  category: FileCategoryType;
  strategy: 'transform' | 'rewrite' | 'skip' | 'manual' | 'generate-new';
  dependencies: string[];
  priority: number;
}

export interface SharedResource {
  path: string;
  type: 'fixture' | 'helper' | 'config' | 'page-object' | 'base-class';
  description: string;
  generatedFrom: string[];
}

// ─── Framework Signatures ──────────────────────────────────────────────────

interface FrameworkSignature {
  name: string;
  language: string;
  patterns: RegExp[];
  features: Array<{ pattern: RegExp; feature: string }>;
}

const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  {
    name: 'TestNG',
    language: 'java',
    patterns: [/import\s+org\.testng/, /@Test\b/, /@BeforeClass\b/, /@AfterClass\b/],
    features: [
      { pattern: /@DataProvider/, feature: 'data-providers' },
      { pattern: /@Factory/, feature: 'factory-pattern' },
      { pattern: /dependsOnMethods/, feature: 'test-dependencies' },
      { pattern: /priority\s*=/, feature: 'test-ordering' },
      { pattern: /groups\s*=/, feature: 'test-groups' },
    ],
  },
  {
    name: 'JUnit5',
    language: 'java',
    patterns: [/import\s+org\.junit\.jupiter/, /@Test\b/, /@BeforeEach\b/, /@DisplayName\b/],
    features: [
      { pattern: /@ParameterizedTest/, feature: 'parameterized-tests' },
      { pattern: /@RepeatedTest/, feature: 'repeated-tests' },
      { pattern: /@Nested/, feature: 'nested-tests' },
      { pattern: /@Tag/, feature: 'test-tags' },
    ],
  },
  {
    name: 'Cucumber-Java',
    language: 'java',
    patterns: [/import\s+io\.cucumber/, /@Given\b/, /@When\b/, /@Then\b/],
    features: [
      { pattern: /Scenario\s+Outline/, feature: 'scenario-outlines' },
      { pattern: /Background:/, feature: 'backgrounds' },
      { pattern: /@CucumberOptions/, feature: 'cucumber-options' },
    ],
  },
  {
    name: 'pytest',
    language: 'python',
    patterns: [/import\s+pytest/, /def\s+test_/, /@pytest\.\w+/],
    features: [
      { pattern: /@pytest\.fixture/, feature: 'fixtures' },
      { pattern: /@pytest\.mark\.parametrize/, feature: 'parametrized-tests' },
      { pattern: /conftest\.py/, feature: 'conftest' },
    ],
  },
  {
    name: 'Mocha',
    language: 'javascript',
    patterns: [/\bdescribe\s*\(/, /\bit\s*\(/, /\bbefore\s*\(/, /require\s*\(\s*['"]mocha['"]\)/],
    features: [
      { pattern: /\bcontext\s*\(/, feature: 'contexts' },
      { pattern: /\.timeout\s*\(/, feature: 'custom-timeouts' },
    ],
  },
  {
    name: 'Jest',
    language: 'javascript',
    patterns: [/\bdescribe\s*\(/, /\btest\s*\(/, /\bexpect\s*\(/, /jest\.fn\(\)/],
    features: [
      { pattern: /jest\.mock\(/, feature: 'mocking' },
      { pattern: /\.each\s*\(/, feature: 'parameterized-tests' },
    ],
  },
  {
    name: 'Cypress',
    language: 'javascript',
    patterns: [/\bcy\./, /\bCypress\./, /cypress\.config/],
    features: [
      { pattern: /cy\.intercept/, feature: 'network-interception' },
      { pattern: /cy\.fixture/, feature: 'fixtures' },
      { pattern: /Cypress\.Commands\.add/, feature: 'custom-commands' },
    ],
  },
  {
    name: 'WebdriverIO',
    language: 'javascript',
    patterns: [
      /(?:require|from)\s*\(?\s*['"]@wdio\//,
      /(?:await\s+)?\$\s*\(\s*['"]/,
      /browser\.url\s*\(/,
    ],
    features: [
      { pattern: /browser\.mock\s*\(/, feature: 'network-mocking' },
      { pattern: /browser\.switchToFrame/, feature: 'frames' },
      { pattern: /browser\.switchWindow/, feature: 'multi-window' },
      { pattern: /wdio\.conf/, feature: 'wdio-config' },
    ],
  },
  {
    name: 'Robot Framework',
    language: 'robot',
    patterns: [
      /^\*{3}\s+Settings\s+\*{3}/m,
      /^\*{3}\s+Test Cases\s+\*{3}/m,
      /Library\s+SeleniumLibrary/,
    ],
    features: [
      { pattern: /Library\s+AppiumLibrary/, feature: 'appium' },
      { pattern: /Library\s+RequestsLibrary/, feature: 'http-requests' },
      { pattern: /Library\s+DatabaseLibrary/, feature: 'database' },
      { pattern: /^\*{3}\s+Keywords\s+\*{3}/m, feature: 'custom-keywords' },
      { pattern: /Resource\s+/, feature: 'resource-files' },
    ],
  },
  {
    name: 'NUnit',
    language: 'csharp',
    patterns: [/using\s+NUnit\.Framework/, /\[TestFixture\]/, /\[Test\]/],
    features: [
      { pattern: /\[TestCase\(/, feature: 'parameterized-tests' },
      { pattern: /\[Category\(/, feature: 'test-categories' },
    ],
  },
  {
    name: 'main-method',
    language: 'java',
    patterns: [/public\s+static\s+void\s+main\s*\(/],
    features: [
      { pattern: /driver\.quit\(\)/, feature: 'manual-lifecycle' },
      { pattern: /Thread\.sleep/, feature: 'manual-waits' },
    ],
  },
];

// ─── File Role Patterns ─────────────────────────────────────────────────────

interface FileRolePattern {
  category: FileCategoryType;
  namePatterns: RegExp[];
  contentPatterns: RegExp[];
}

const FILE_ROLE_PATTERNS: FileRolePattern[] = [
  // Order matters for content-first matching: more specific patterns first
  {
    category: 'feature-file',
    namePatterns: [/\.feature$/],
    contentPatterns: [/^Feature:/m],
  },
  {
    category: 'step-definition',
    namePatterns: [/steps?\.(?:java|py|js|ts)$/, /step[_-]?def/i],
    contentPatterns: [/@(?:Given|When|Then|And|But)\b/, /cucumber\.\w+/],
  },
  {
    category: 'test',
    namePatterns: [/test/i, /spec/i, /\.cy\./],
    contentPatterns: [
      /@Test\b/,
      /def\s+test_/,
      /\bit\s*\(/,
      /\btest\s*\(/,
      /public\s+static\s+void\s+main\s*\(/,
    ],
  },
  {
    category: 'page-object',
    namePatterns: [/Page\.(?:java|py|js|ts|cs)$/, /page[_-]?object/i, /pages?\//i],
    contentPatterns: [/@FindBy\b/, /PageFactory\.initElements/, /get\w+Element/],
  },
  {
    category: 'fixture',
    namePatterns: [/fixture/i, /conftest\.py$/, /testdata/i],
    contentPatterns: [/@pytest\.fixture/, /@DataProvider/],
  },
  {
    category: 'config',
    namePatterns: [/config\.(?:java|py|js|ts|json|yaml|xml)$/i, /properties$/],
    contentPatterns: [/capabilities/i, /browserName/i, /hub.*url/i],
  },
  {
    category: 'base-class',
    namePatterns: [/^Base\w+\./, /^Abstract\w+\./],
    contentPatterns: [],
  },
  {
    category: 'helper',
    namePatterns: [/helper/i, /util/i, /common/i, /shared/i],
    contentPatterns: [],
  },
  {
    category: 'data-provider',
    namePatterns: [/data/i, /provider/i, /testdata/i],
    contentPatterns: [/test.*data/i],
  },
];

// ─── Analyzer ───────────────────────────────────────────────────────────────

export class StructureAnalyzer {
  /**
   * Analyze a repo and produce a complete ProjectStructure.
   */
  async analyze(
    sourceDir: string,
    includePatterns: string[] = [
      '**/*.java',
      '**/*.py',
      '**/*.js',
      '**/*.ts',
      '**/*.cs',
      '**/*.feature',
    ],
    excludePatterns: string[] = [
      '**/node_modules/**',
      '**/target/**',
      '**/dist/**',
      '**/.git/**',
      '**/build/**',
    ],
  ): Promise<ProjectStructure> {
    log.info(`Analyzing project structure in ${sourceDir}...`);

    // 1. Scan all files
    const files = await fg(includePatterns, {
      cwd: sourceDir,
      ignore: excludePatterns,
      absolute: false,
    });

    log.info(`Found ${files.length} files to analyze`);

    // 2. Read file contents (in parallel, batched)
    const fileContents = new Map<string, string>();
    const BATCH_SIZE = 50;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (f) => {
          try {
            const content = await readFile(`${sourceDir}/${f}`, 'utf-8');
            return [f, content] as const;
          } catch {
            return null;
          }
        }),
      );
      for (const result of results) {
        if (result) fileContents.set(result[0], result[1]);
      }
    }

    // 3. Detect primary language
    const primaryLanguage = this.detectPrimaryLanguage(files);

    // 4. Detect test frameworks
    const testFrameworks = this.detectTestFrameworks(fileContents);

    // 5. Categorize files
    const fileCategories = this.categorizeFiles(files, fileContents);

    // 6. Build dependency graph
    const graphBuilder = new DependencyGraphBuilder();
    const dependencyGraph = graphBuilder.buildFromFiles(
      Array.from(fileContents.entries()).map(([path, content]) => ({
        path,
        content,
      })),
    );

    // 7. Detect patterns
    const patterns = this.detectPatterns(fileContents, fileCategories, dependencyGraph);

    // 8. Generate blueprint
    const blueprint = this.generateBlueprint(
      fileCategories,
      testFrameworks,
      dependencyGraph,
      patterns,
    );

    log.info(
      `Analysis complete: ${testFrameworks.length} framework(s), ` +
        `${fileCategories.reduce((n, c) => n + c.files.length, 0)} categorized files, ` +
        `complexity: ${blueprint.complexity}`,
    );

    return {
      sourceDir,
      primaryLanguage,
      testFrameworks,
      fileCategories,
      dependencyGraph,
      patterns,
      blueprint,
    };
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private detectPrimaryLanguage(files: string[]): string {
    const counts: Record<string, number> = {};
    for (const f of files) {
      const ext = extname(f).toLowerCase();
      const lang =
        ext === '.java'
          ? 'java'
          : ext === '.py'
            ? 'python'
            : ext === '.js' || ext === '.ts'
              ? 'javascript'
              : ext === '.cs'
                ? 'csharp'
                : ext === '.feature'
                  ? 'gherkin'
                  : 'other';
      counts[lang] = (counts[lang] ?? 0) + 1;
    }

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
  }

  private detectTestFrameworks(fileContents: Map<string, string>): TestFrameworkInfo[] {
    const results: TestFrameworkInfo[] = [];

    for (const sig of FRAMEWORK_SIGNATURES) {
      let matchCount = 0;
      const matchedFeatures: string[] = [];

      for (const [_path, content] of fileContents) {
        const matches = sig.patterns.filter((p) => p.test(content)).length;
        if (matches >= 2) {
          matchCount++;
        }

        for (const feature of sig.features) {
          if (feature.pattern.test(content) && !matchedFeatures.includes(feature.feature)) {
            matchedFeatures.push(feature.feature);
          }
        }
      }

      if (matchCount > 0) {
        results.push({
          name: sig.name,
          language: sig.language,
          fileCount: matchCount,
          confidence: Math.min(matchCount / fileContents.size, 1),
          features: matchedFeatures,
        });
      }
    }

    return results.sort((a, b) => b.fileCount - a.fileCount);
  }

  private categorizeFiles(files: string[], fileContents: Map<string, string>): FileCategory[] {
    const categories = new Map<FileCategoryType, string[]>();

    for (const filePath of files) {
      const content = fileContents.get(filePath) ?? '';
      const category = this.categorizeFile(filePath, content);

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(filePath);
    }

    return Array.from(categories.entries()).map(([category, fileList]) => ({
      category,
      files: fileList,
      description: this.getCategoryDescription(category),
    }));
  }

  private categorizeFile(filePath: string, content: string): FileCategoryType {
    const fileName = basename(filePath);

    // First pass: check content patterns (more reliable than filename)
    // Test detection takes priority — a file with @Test is a test even if it extends BaseHelper
    for (const role of FILE_ROLE_PATTERNS) {
      if (role.contentPatterns.length > 0 && role.contentPatterns.some((p) => p.test(content))) {
        return role.category;
      }
    }

    // Second pass: check filename patterns
    for (const role of FILE_ROLE_PATTERNS) {
      if (role.namePatterns.some((p) => p.test(fileName) || p.test(filePath))) {
        return role.category;
      }
    }

    return 'unknown';
  }

  private getCategoryDescription(category: FileCategoryType): string {
    const descriptions: Record<FileCategoryType, string> = {
      test: 'Test files containing test cases',
      'page-object': 'Page Object Model classes',
      helper: 'Helper/utility classes used by tests',
      'base-class': 'Base classes that tests or page objects extend',
      config: 'Configuration files (capabilities, environments, etc.)',
      fixture: 'Test fixtures and data providers',
      'step-definition': 'Cucumber/BDD step definition files',
      'feature-file': 'Gherkin feature files',
      'data-provider': 'Test data providers',
      utility: 'General utility classes',
      model: 'Data model classes',
      unknown: "Files that couldn't be categorized",
    };
    return descriptions[category];
  }

  private detectPatterns(
    fileContents: Map<string, string>,
    categories: FileCategory[],
    graph: DependencyGraph,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Pattern: Dynamic locator arrays (String[] locator = {"strategy", "value"})
    const dynamicLocatorFiles: string[] = [];
    for (const [path, content] of fileContents) {
      if (/String\[\]\s+\w+\s*=\s*\{/.test(content)) {
        dynamicLocatorFiles.push(path);
      }
    }
    if (dynamicLocatorFiles.length > 0) {
      patterns.push({
        name: 'dynamic-locator-arrays',
        description:
          'Uses String[] locator = {"strategy", "value"} pattern for dynamic element lookup',
        fileCount: dynamicLocatorFiles.length,
        examples: dynamicLocatorFiles.slice(0, 3),
        migrationStrategy:
          'Resolve locator arrays to Playwright locator() calls using dependency graph',
      });
    }

    // Pattern: Inheritance chains
    const deepChains: string[] = [];
    for (const [className] of graph.classes) {
      const chain = graph.inheritanceChains.get(className) ?? [];
      if (chain.length >= 3) {
        deepChains.push(`${className}: ${chain.join(' → ')}`);
      }
    }
    if (deepChains.length > 0) {
      patterns.push({
        name: 'deep-inheritance',
        description: 'Deep class inheritance chains (3+ levels)',
        fileCount: deepChains.length,
        examples: deepChains.slice(0, 5),
        migrationStrategy:
          'Flatten helper methods into Playwright page object methods or test utilities',
      });
    }

    // Pattern: Page Object Model
    const poCategory = categories.find((c) => c.category === 'page-object');
    if (poCategory && poCategory.files.length > 0) {
      patterns.push({
        name: 'page-object-model',
        description: 'Uses Page Object Model pattern',
        fileCount: poCategory.files.length,
        examples: poCategory.files.slice(0, 3),
        migrationStrategy: 'Convert to Playwright Page Object Model with Locator-based selectors',
      });
    }

    // Pattern: Cucumber BDD
    const featureCategory = categories.find((c) => c.category === 'feature-file');
    const stepDefCategory = categories.find((c) => c.category === 'step-definition');
    if (featureCategory && featureCategory.files.length > 0) {
      patterns.push({
        name: 'cucumber-bdd',
        description: 'Uses Cucumber BDD with feature files and step definitions',
        fileCount: featureCategory.files.length + (stepDefCategory?.files.length ?? 0),
        examples: [
          ...featureCategory.files.slice(0, 2),
          ...(stepDefCategory?.files.slice(0, 2) ?? []),
        ],
        migrationStrategy:
          'Convert feature files to Playwright test.describe/test, inline step definitions',
      });
    }

    // Pattern: Thread.sleep / explicit waits
    let sleepCount = 0;
    for (const [_path, content] of fileContents) {
      sleepCount += (content.match(/Thread\.sleep|time\.sleep|cy\.wait\(\d|driver\.sleep/g) ?? [])
        .length;
    }
    if (sleepCount > 0) {
      patterns.push({
        name: 'explicit-sleeps',
        description: `Uses explicit sleep/wait calls (${sleepCount} occurrences)`,
        fileCount: sleepCount,
        examples: [],
        migrationStrategy: 'Remove explicit sleeps — Playwright auto-waits for actionability',
      });
    }

    // Pattern: Custom capabilities
    let capsCount = 0;
    for (const [_path, content] of fileContents) {
      capsCount += (content.match(/setCapability|DesiredCapabilities|capabilities\./g) ?? [])
        .length;
    }
    if (capsCount > 0) {
      patterns.push({
        name: 'custom-capabilities',
        description: 'Uses custom browser/device capabilities',
        fileCount: capsCount,
        examples: [],
        migrationStrategy: 'Move capabilities to playwright.config.ts projects[] configuration',
      });
    }

    return patterns;
  }

  private generateBlueprint(
    categories: FileCategory[],
    frameworks: TestFrameworkInfo[],
    graph: DependencyGraph,
    patterns: DetectedPattern[],
  ): MigrationBlueprint {
    const filePlans: FileMigrationPlan[] = [];
    const sharedResources: SharedResource[] = [];
    const migrationOrder: string[] = [];

    // Target folder structure
    const targetStructure: TargetFolder[] = [
      { path: 'tests/', purpose: 'All Playwright test files' },
      { path: 'tests/pages/', purpose: 'Page Object Model classes' },
      { path: 'tests/fixtures/', purpose: 'Test fixtures and shared setup' },
      { path: 'tests/helpers/', purpose: 'Utility functions and helpers' },
    ];

    const hasCucumber = patterns.some((p) => p.name === 'cucumber-bdd');
    if (hasCucumber) {
      targetStructure.push({
        path: 'tests/features/',
        purpose: 'Converted feature file tests',
      });
    }

    // Plan each file
    for (const category of categories) {
      for (const filePath of category.files) {
        const plan = this.planFile(filePath, category.category, graph);
        filePlans.push(plan);
      }
    }

    // Determine migration order (base classes first, then helpers, then tests)
    const priorityOrder: FileCategoryType[] = [
      'config',
      'base-class',
      'helper',
      'page-object',
      'fixture',
      'data-provider',
      'step-definition',
      'feature-file',
      'test',
      'utility',
      'model',
      'unknown',
    ];

    filePlans.sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.category);
      const bIdx = priorityOrder.indexOf(b.category);
      return aIdx - bIdx;
    });

    for (const plan of filePlans) {
      migrationOrder.push(plan.sourcePath);
    }

    // Generate shared resources
    sharedResources.push({
      path: 'playwright.config.ts',
      type: 'config',
      description: 'Playwright configuration with projects, viewport, timeouts',
      generatedFrom: categories.filter((c) => c.category === 'config').flatMap((c) => c.files),
    });

    const hasPageObjects = categories.some(
      (c) => c.category === 'page-object' && c.files.length > 0,
    );
    if (hasPageObjects) {
      sharedResources.push({
        path: 'tests/fixtures/index.ts',
        type: 'fixture',
        description: 'Shared Playwright fixtures with page objects',
        generatedFrom: categories
          .filter((c) => c.category === 'page-object')
          .flatMap((c) => c.files),
      });
    }

    // Estimate complexity
    const totalFiles = filePlans.length;
    const deepInheritance = patterns.some((p) => p.name === 'deep-inheritance');
    const hasDynamicLocators = patterns.some((p) => p.name === 'dynamic-locator-arrays');

    let complexity: MigrationBlueprint['complexity'];
    if (totalFiles <= 10 && !deepInheritance && !hasDynamicLocators) {
      complexity = 'simple';
    } else if (totalFiles <= 50 && !hasDynamicLocators) {
      complexity = 'moderate';
    } else if (totalFiles <= 150 || hasDynamicLocators) {
      complexity = 'complex';
    } else {
      complexity = 'very-complex';
    }

    return {
      targetStructure,
      filePlans,
      sharedResources,
      complexity,
      migrationOrder,
    };
  }

  private planFile(
    filePath: string,
    category: FileCategoryType,
    graph: DependencyGraph,
  ): FileMigrationPlan {
    const ext = extname(filePath);
    const base = basename(filePath, ext);

    // Determine target path
    let targetPath: string;
    let strategy: FileMigrationPlan['strategy'];
    let priority: number;

    switch (category) {
      case 'test':
        targetPath = `tests/${base}.spec.ts`;
        strategy = 'transform';
        priority = 50;
        break;
      case 'page-object':
        targetPath = `tests/pages/${base}.ts`;
        strategy = 'transform';
        priority = 20;
        break;
      case 'helper':
      case 'base-class':
        targetPath = `tests/helpers/${base}.ts`;
        strategy = 'transform';
        priority = 10;
        break;
      case 'config':
        targetPath = 'playwright.config.ts';
        strategy = 'generate-new';
        priority = 1;
        break;
      case 'feature-file':
        targetPath = `tests/features/${base}.spec.ts`;
        strategy = 'transform';
        priority = 40;
        break;
      case 'step-definition':
        targetPath = `tests/helpers/${base}.ts`;
        strategy = 'transform';
        priority = 30;
        break;
      case 'fixture':
      case 'data-provider':
        targetPath = `tests/fixtures/${base}.ts`;
        strategy = 'transform';
        priority = 15;
        break;
      default:
        targetPath = `tests/${base}.ts`;
        strategy = 'manual';
        priority = 100;
        break;
    }

    // Find dependencies from the graph
    const dependencies: string[] = [];
    const classesInFile = graph.fileToClasses.get(filePath) ?? [];
    for (const className of classesInFile) {
      const classNode = graph.classes.get(className);
      if (classNode?.extends) {
        const parentClass = graph.classes.get(classNode.extends);
        if (parentClass) {
          dependencies.push(parentClass.filePath);
        }
      }
    }

    return {
      sourcePath: filePath,
      targetPath,
      category,
      strategy,
      dependencies,
      priority,
    };
  }
}
