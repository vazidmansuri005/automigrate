/**
 * Playwright code generator.
 * Takes TransformFileResult and produces final output files.
 * Handles test wrapping, page object generation, fixture generation, and config.
 */

import type {
  TransformFileResult,
  GeneratedFile,
  MigrationConfig,
  PageObjectDefinition,
  CapabilityUsage,
  TargetLanguage,
  ParsedFile,
} from '../../types/index.js';
import { applyPlaywrightIdioms } from './playwright-idioms.js';
import { createLogger } from '../../utils/logger.js';

const _log = createLogger('generator');

export class CodeGenerator {
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  generate(result: TransformFileResult, parsed: ParsedFile): GeneratedFile {
    const lang = this.config.targetLanguage;

    let content: string;
    if (lang === 'typescript' || lang === 'javascript') {
      content = this.generateTypeScript(result, parsed);
    } else if (lang === 'python') {
      content = this.generatePython(result, parsed);
    } else if (lang === 'java') {
      content = this.generateJava(result, parsed);
    } else if (lang === 'csharp') {
      content = this.generateCSharp(result, parsed);
    } else {
      content = this.generateTypeScript(result, parsed);
    }

    // Apply Playwright idiom post-processing for TS/JS output
    if (lang === 'typescript' || lang === 'javascript') {
      content = applyPlaywrightIdioms(content);
    }

    return {
      path: result.targetPath,
      content,
      type: 'test',
      sourceFile: result.sourcePath,
    };
  }

  generatePageObject(po: PageObjectDefinition, targetLang: TargetLanguage): GeneratedFile {
    const className = po.name.endsWith('Page') ? po.name : `${po.name}Page`;
    const fileName =
      targetLang === 'python' ? `${toSnakeCase(className)}.py` : `${toKebabCase(className)}.ts`;

    let content: string;
    if (targetLang === 'python') {
      content = this.generatePythonPageObject(po, className);
    } else {
      content = this.generateTSPageObject(po, className);
    }

    return {
      path: `page-objects/${fileName}`,
      content,
      type: 'page-object',
    };
  }

  generateFixtures(
    pageObjects: PageObjectDefinition[],
    targetLang: TargetLanguage,
  ): GeneratedFile | null {
    if (pageObjects.length === 0) return null;

    if (targetLang === 'python') {
      return this.generatePythonFixtures(pageObjects);
    }
    return this.generateTSFixtures(pageObjects);
  }

  generateConfig(capabilities: CapabilityUsage[]): GeneratedFile {
    const config = this.buildPlaywrightConfig(capabilities);
    return {
      path: 'playwright.config.ts',
      content: config,
      type: 'config',
    };
  }

  // ─── TypeScript/JavaScript Generation ───────────────────────────────────

  private generateTypeScript(result: TransformFileResult, parsed: ParsedFile): string {
    const lines: string[] = [];

    // Imports
    lines.push(result.importBlock);

    // Determine wrapping
    if (result.testStructure === 'describe-it') {
      // Convert describe/it to test.describe/test
      const convertedLines = result.transformedLines
        .filter((l) => l.transformed !== '')
        .map((l) => {
          let t = l.transformed;
          // Convert Cypress/Mocha describe → test.describe (skip if already test.describe)
          t = t.replace(/(?<!\.)(?<!\w)describe\s*\(/, 'test.describe(');
          // Convert context → test.describe
          t = t.replace(/(?<!\.)(?<!\w)context\s*\(/, 'test.describe(');
          // Convert it('name', async function() { → test('name', async ({ page }) => {
          t = t.replace(
            /\bit\s*\(\s*(['"].*?['"])\s*,\s*(?:async\s+)?function\s*\(\)\s*\{/,
            'test($1, async ({ page }) => {',
          );
          // Fallback: Convert bare it( → test(
          t = t.replace(/\bit\s*\(/, 'test(');
          // Convert beforeAll/beforeEach/afterAll/afterEach with all function styles
          t = t.replace(
            /\bbeforeAll\s*\(\s*(?:async\s+)?(?:\(\)\s*=>\s*\{?|function\s*\(\)\s*\{?).*$/,
            'test.beforeAll(async ({ page }) => {',
          );
          t = t.replace(
            /\bbeforeEach\s*\(\s*(?:async\s+)?(?:\(\)\s*=>\s*\{?|function\s*\(\)\s*\{?).*$/,
            'test.beforeEach(async ({ page }) => {',
          );
          t = t.replace(
            /\bafterAll\s*\(\s*(?:async\s+)?(?:\(\)\s*=>\s*\{?|function\s*\(\)\s*\{?).*$/,
            'test.afterAll(async () => {',
          );
          t = t.replace(
            /\bafterEach\s*\(\s*(?:async\s+)?(?:\(\)\s*=>\s*\{?|function\s*\(\)\s*\{?).*$/,
            'test.afterEach(async () => {',
          );
          // Convert bare before/after (Mocha style) — must be after beforeAll/afterAll
          t = t.replace(
            /\bbefore\s*\(\s*(?:async\s+)?(?:\(\)\s*=>\s*\{?|function\s*\(\)\s*\{?).*$/,
            'test.beforeAll(async ({ page }) => {',
          );
          t = t.replace(
            /\bafter\s*\(\s*(?:async\s+)?(?:\(\)\s*=>\s*\{?|function\s*\(\)\s*\{?).*$/,
            'test.afterAll(async () => {',
          );
          // Add async ({ page }) to test callbacks — handle various function signatures
          t = t.replace(
            /\btest\s*\(\s*(['"].*?['"])\s*,\s*(?:async\s+)?(?:\(\)\s*=>|function\s*\(\))/,
            'test($1, async ({ page }) =>',
          );
          return t;
        });
      lines.push(...convertedLines);
    } else if (result.testStructure === 'class' || result.testStructure === 'function') {
      // Wrap in test.describe + test blocks
      const testName = this.extractTestName(parsed);
      lines.push(`test.describe('${escapeQuotes(testName)}', () => {`);

      // Generate beforeAll/afterAll from hooks
      for (const hook of parsed.hooks) {
        const hookName =
          hook.type === 'beforeAll' || hook.type === 'setup'
            ? 'test.beforeAll'
            : hook.type === 'afterAll' || hook.type === 'teardown'
              ? 'test.afterAll'
              : hook.type === 'beforeEach'
                ? 'test.beforeEach'
                : 'test.afterEach';
        lines.push(`  ${hookName}(async ({ page }) => {`);
        lines.push(`    // TODO: [automigrate] Migrate hook body`);
        lines.push(`  });`);
        lines.push(``);
      }

      // Generate test blocks
      for (const tc of parsed.testCases) {
        lines.push(`  test('${escapeQuotes(tc.name)}', async ({ page }) => {`);

        // Output transformed body lines within the test case range
        for (const tl of result.transformedLines) {
          if (
            tl.lineNumber >= tc.line &&
            tl.lineNumber <= tc.endLine &&
            tl.transformed.trim() !== ''
          ) {
            // Add extra indent for test body
            const content = tl.transformed.replace(/^\s*/, '    ');
            lines.push(content);
            if (tl.needsReview) {
              lines.push(
                `    // ^ TODO: [automigrate] Low confidence — review this transformation`,
              );
            }
          }
        }

        lines.push(`  });`);
        lines.push(``);
      }

      // If no test cases were found, output all transformed lines
      if (parsed.testCases.length === 0) {
        lines.push(`  test('migrated test', async ({ page }) => {`);
        for (const tl of result.transformedLines) {
          if (tl.transformed.trim()) {
            lines.push(`    ${tl.transformed.trim()}`);
          }
        }
        lines.push(`  });`);
      }

      lines.push(`});`);
    }

    return lines.join('\n') + '\n';
  }

  // ─── Python Generation ────────────────────────────────────────────────

  private generatePython(result: TransformFileResult, parsed: ParsedFile): string {
    const runner = this.config.pythonTestRunner ?? 'pytest';
    if (runner === 'unittest') {
      return this.generatePythonUnittest(result, parsed);
    }
    return this.generatePythonPytest(result, parsed);
  }

  private generatePythonPytest(result: TransformFileResult, parsed: ParsedFile): string {
    const lines: string[] = [];

    // Imports
    lines.push(`import pytest`);
    lines.push(`from playwright.sync_api import Page, expect`);
    lines.push(``);
    lines.push(``);

    // Hooks
    for (const hook of parsed.hooks) {
      if (hook.type === 'beforeEach' || hook.type === 'setup') {
        lines.push(`@pytest.fixture(autouse=True)`);
        lines.push(`def before_each(page: Page) -> None:`);
        lines.push(`    # TODO: [automigrate] Migrate setup logic`);
        lines.push(`    pass`);
        lines.push(``);
        lines.push(``);
      }
    }

    // Test functions
    for (const tc of parsed.testCases) {
      const funcName = `test_${toSnakeCase(tc.name)}`;
      lines.push(`def ${funcName}(page: Page) -> None:`);

      let hasBody = false;
      for (const tl of result.transformedLines) {
        if (
          tl.lineNumber >= tc.line &&
          tl.lineNumber <= tc.endLine &&
          tl.transformed.trim() !== ''
        ) {
          lines.push(`    ${tl.transformed.trim()}`);
          hasBody = true;
        }
      }

      if (!hasBody) {
        lines.push(`    pass  # TODO: [automigrate] Migrate test body`);
      }
      lines.push(``);
      lines.push(``);
    }

    if (parsed.testCases.length === 0) {
      lines.push(`def test_migrated(page: Page) -> None:`);
      for (const tl of result.transformedLines) {
        if (tl.transformed.trim()) {
          lines.push(`    ${tl.transformed.trim()}`);
        }
      }
      lines.push(``);
    }

    return lines.join('\n');
  }

  private generatePythonUnittest(result: TransformFileResult, parsed: ParsedFile): string {
    const lines: string[] = [];
    const rawName = this.extractClassName(parsed).replace(/Playwright$/, '');
    const className = rawName.endsWith('Test') ? rawName : `${rawName}Test`;

    // Imports
    lines.push(`import unittest`);
    lines.push(`from playwright.sync_api import sync_playwright, Page, expect`);
    lines.push(``);
    lines.push(``);
    lines.push(`class ${className}(unittest.TestCase):`);
    lines.push(``);

    // Setup / teardown
    lines.push(`    @classmethod`);
    lines.push(`    def setUpClass(cls) -> None:`);
    lines.push(`        cls.playwright = sync_playwright().start()`);
    lines.push(`        cls.browser = cls.playwright.chromium.launch()`);
    lines.push(``);
    lines.push(`    @classmethod`);
    lines.push(`    def tearDownClass(cls) -> None:`);
    lines.push(`        cls.browser.close()`);
    lines.push(`        cls.playwright.stop()`);
    lines.push(``);
    lines.push(`    def setUp(self) -> None:`);
    lines.push(`        self.page: Page = self.browser.new_page()`);
    lines.push(``);
    lines.push(`    def tearDown(self) -> None:`);
    lines.push(`        self.page.close()`);
    lines.push(``);

    // Test methods
    for (const tc of parsed.testCases) {
      const methodName = `test_${toSnakeCase(tc.name)}`;
      lines.push(`    def ${methodName}(self) -> None:`);

      let hasBody = false;
      for (const tl of result.transformedLines) {
        if (
          tl.lineNumber >= tc.line &&
          tl.lineNumber <= tc.endLine &&
          tl.transformed.trim() !== ''
        ) {
          // Replace 'page.' with 'self.page.' for unittest
          let pyLine = tl.transformed.trim();
          pyLine = pyLine.replace(/\bpage\./g, 'self.page.');
          lines.push(`        ${pyLine}`);
          hasBody = true;
        }
      }

      if (!hasBody) {
        lines.push(`        pass  # TODO: [automigrate] Migrate test body`);
      }
      lines.push(``);
    }

    if (parsed.testCases.length === 0) {
      lines.push(`    def test_migrated(self) -> None:`);
      for (const tl of result.transformedLines) {
        if (tl.transformed.trim()) {
          let pyLine = tl.transformed.trim();
          pyLine = pyLine.replace(/\bpage\./g, 'self.page.');
          lines.push(`        ${pyLine}`);
        }
      }
      lines.push(``);
    }

    lines.push(``);
    lines.push(`if __name__ == "__main__":`);
    lines.push(`    unittest.main()`);

    return lines.join('\n');
  }

  // ─── Java Generation ──────────────────────────────────────────────────

  private generateJava(result: TransformFileResult, parsed: ParsedFile): string {
    const className = this.extractClassName(parsed);
    const lines: string[] = [];

    lines.push(result.importBlock);
    lines.push(``);
    lines.push(`public class ${className} {`);
    lines.push(`    private Playwright playwright;`);
    lines.push(`    private Browser browser;`);
    lines.push(`    private Page page;`);
    lines.push(``);
    lines.push(`    @BeforeAll`);
    lines.push(`    void setup() {`);
    lines.push(`        playwright = Playwright.create();`);
    lines.push(`        browser = playwright.chromium().launch();`);
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    @BeforeEach`);
    lines.push(`    void createContext() {`);
    lines.push(`        page = browser.newPage();`);
    lines.push(`    }`);
    lines.push(``);

    for (const tc of parsed.testCases) {
      const methodName = toCamelCase(tc.name);
      lines.push(`    @Test`);
      lines.push(`    void ${methodName}() {`);

      for (const tl of result.transformedLines) {
        if (
          tl.lineNumber >= tc.line &&
          tl.lineNumber <= tc.endLine &&
          tl.transformed.trim() !== ''
        ) {
          lines.push(`        ${tl.transformed.trim()}`);
        }
      }

      lines.push(`    }`);
      lines.push(``);
    }

    lines.push(`    @AfterAll`);
    lines.push(`    void teardown() {`);
    lines.push(`        playwright.close();`);
    lines.push(`    }`);
    lines.push(`}`);

    return lines.join('\n') + '\n';
  }

  // ─── C# Generation ───────────────────────────────────────────────────

  private generateCSharp(result: TransformFileResult, parsed: ParsedFile): string {
    const className = this.extractClassName(parsed);
    const lines: string[] = [];

    lines.push(result.importBlock);
    lines.push(``);
    lines.push(`[TestFixture]`);
    lines.push(`public class ${className} : PageTest`);
    lines.push(`{`);
    lines.push(``);

    for (const tc of parsed.testCases) {
      const methodName = toPascalCase(tc.name);
      lines.push(`    [Test]`);
      lines.push(`    public async Task ${methodName}()`);
      lines.push(`    {`);

      for (const tl of result.transformedLines) {
        if (
          tl.lineNumber >= tc.line &&
          tl.lineNumber <= tc.endLine &&
          tl.transformed.trim() !== ''
        ) {
          lines.push(`        ${tl.transformed.trim()}`);
        }
      }

      lines.push(`    }`);
      lines.push(``);
    }

    if (parsed.testCases.length === 0) {
      lines.push(`    [Test]`);
      lines.push(`    public async Task MigratedTest()`);
      lines.push(`    {`);
      for (const tl of result.transformedLines) {
        if (tl.transformed.trim()) {
          lines.push(`        ${tl.transformed.trim()}`);
        }
      }
      lines.push(`    }`);
    }

    lines.push(`}`);

    return lines.join('\n') + '\n';
  }

  // ─── Page Object Generation ───────────────────────────────────────────

  private generateTSPageObject(po: PageObjectDefinition, className: string): string {
    const lines: string[] = [];

    lines.push(`import type { Page, Locator } from '@playwright/test';`);
    lines.push(``);
    lines.push(`export class ${className} {`);
    lines.push(`  readonly page: Page;`);
    lines.push(``);

    // Selector properties
    for (const sel of po.selectors) {
      lines.push(`  readonly ${sel.name}: Locator;`);
    }
    lines.push(``);

    // Constructor
    lines.push(`  constructor(page: Page) {`);
    lines.push(`    this.page = page;`);
    for (const sel of po.selectors) {
      const locator = selectorToPlaywright(sel.selector.value, sel.selector.type);
      lines.push(`    this.${sel.name} = page.locator('${escapeQuotes(locator)}');`);
    }
    lines.push(`  }`);
    lines.push(``);

    // Methods
    for (const method of po.methods) {
      const params = method.params
        .map((p) => `${p.name}${p.type ? `: ${p.type}` : ': string'}`)
        .join(', ');
      lines.push(`  async ${method.name}(${params}) {`);
      lines.push(`    // TODO: [automigrate] Migrate method body`);
      lines.push(`  }`);
      lines.push(``);
    }

    lines.push(`}`);
    return lines.join('\n') + '\n';
  }

  private generatePythonPageObject(po: PageObjectDefinition, className: string): string {
    const lines: string[] = [];

    lines.push(`from playwright.sync_api import Page, Locator`);
    lines.push(``);
    lines.push(``);
    lines.push(`class ${className}:`);
    lines.push(`    def __init__(self, page: Page) -> None:`);
    lines.push(`        self.page = page`);

    for (const sel of po.selectors) {
      const locator = selectorToPlaywright(sel.selector.value, sel.selector.type);
      lines.push(
        `        self.${toSnakeCase(sel.name)} = page.locator("${escapeQuotes(locator)}")`,
      );
    }
    lines.push(``);

    for (const method of po.methods) {
      const params = method.params.map((p) => p.name).join(', ');
      const pyParams = params ? `self, ${params}` : 'self';
      lines.push(`    def ${toSnakeCase(method.name)}(${pyParams}) -> None:`);
      lines.push(`        # TODO: [automigrate] Migrate method body`);
      lines.push(`        pass`);
      lines.push(``);
    }

    return lines.join('\n');
  }

  // ─── Fixtures Generation ──────────────────────────────────────────────

  private generateTSFixtures(pageObjects: PageObjectDefinition[]): GeneratedFile {
    const lines: string[] = [];

    lines.push(`import { test as base } from '@playwright/test';`);

    for (const po of pageObjects) {
      const className = po.name.endsWith('Page') ? po.name : `${po.name}Page`;
      const fileName = toKebabCase(className);
      lines.push(`import { ${className} } from './page-objects/${fileName}.js';`);
    }
    lines.push(``);

    // Build fixture type
    lines.push(`type Fixtures = {`);
    for (const po of pageObjects) {
      const className = po.name.endsWith('Page') ? po.name : `${po.name}Page`;
      const propName = toCamelCase(className);
      lines.push(`  ${propName}: ${className};`);
    }
    lines.push(`};`);
    lines.push(``);

    lines.push(`export const test = base.extend<Fixtures>({`);
    for (const po of pageObjects) {
      const className = po.name.endsWith('Page') ? po.name : `${po.name}Page`;
      const propName = toCamelCase(className);
      lines.push(`  ${propName}: async ({ page }, use) => {`);
      lines.push(`    await use(new ${className}(page));`);
      lines.push(`  },`);
    }
    lines.push(`});`);
    lines.push(``);
    lines.push(`export { expect } from '@playwright/test';`);

    return {
      path: 'fixtures.ts',
      content: lines.join('\n') + '\n',
      type: 'fixture',
    };
  }

  private generatePythonFixtures(pageObjects: PageObjectDefinition[]): GeneratedFile {
    const lines: string[] = [];

    lines.push(`import pytest`);
    lines.push(`from playwright.sync_api import Page`);

    for (const po of pageObjects) {
      const className = po.name.endsWith('Page') ? po.name : `${po.name}Page`;
      const fileName = toSnakeCase(className);
      lines.push(`from page_objects.${fileName} import ${className}`);
    }
    lines.push(``);

    for (const po of pageObjects) {
      const className = po.name.endsWith('Page') ? po.name : `${po.name}Page`;
      const fixtureName = toSnakeCase(className);
      lines.push(`@pytest.fixture`);
      lines.push(`def ${fixtureName}(page: Page) -> ${className}:`);
      lines.push(`    return ${className}(page)`);
      lines.push(``);
    }

    return {
      path: 'conftest.py',
      content: lines.join('\n'),
      type: 'fixture',
    };
  }

  // ─── Config Generation ────────────────────────────────────────────────

  private buildPlaywrightConfig(capabilities: CapabilityUsage[]): string {
    const capMap = new Map(capabilities.map((c) => [c.key, c.value]));

    const baseURL = capMap.get('baseUrl') ?? capMap.get('baseURL') ?? '';
    const viewport = {
      width: Number(capMap.get('viewportWidth')) || 1280,
      height: Number(capMap.get('viewportHeight')) || 720,
    };
    const timeout = Number(capMap.get('defaultCommandTimeout')) || 30000;

    return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    ${baseURL ? `baseURL: '${baseURL}',` : "// baseURL: 'http://localhost:3000',"}
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: ${timeout},
    viewport: { width: ${viewport.width}, height: ${viewport.height} },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
`;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private extractTestName(parsed: ParsedFile): string {
    if (parsed.classes.length > 0) {
      const testClass = parsed.classes.find((c) => c.isTestClass);
      if (testClass) return testClass.name;
    }
    // Use file name
    const fileName = parsed.source.relativePath.split('/').pop() ?? 'Tests';
    return fileName.replace(/\.(java|py|js|ts|cs|spec\.\w+|test\.\w+|cy\.\w+)$/, '');
  }

  private extractClassName(parsed: ParsedFile): string {
    const testClass = parsed.classes.find((c) => c.isTestClass);
    if (testClass) return testClass.name + 'Playwright';
    return 'MigratedTest';
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────

function escapeQuotes(str: string): string {
  return str.replace(/'/g, "\\'");
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/__+/g, '_');
}

function toCamelCase(str: string): string {
  const result = str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
  return result;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

function selectorToPlaywright(value: string, type: string): string {
  switch (type) {
    case 'id':
      return `#${value}`;
    case 'css':
      return value;
    case 'xpath':
      return `xpath=${value}`;
    case 'name':
      return `[name="${value}"]`;
    case 'className':
      return `.${value}`;
    case 'tagName':
      return value;
    case 'linkText':
      return `role=link[name="${value}"]`;
    case 'dataTestId':
      return `[data-testid="${value}"]`;
    default:
      return value;
  }
}
