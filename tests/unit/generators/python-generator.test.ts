import { describe, it, expect } from 'vitest';
import { CodeGenerator } from '../../../src/core/generators/code-generator.js';
import type {
  MigrationConfig,
  TransformFileResult,
  ParsedFile,
  TransformConfidence,
} from '../../../src/types/index.js';

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: '/tmp/src',
    outputDir: '/tmp/out',
    targetLanguage: 'python',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java'],
    excludePatterns: [],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: false,
    maxConcurrency: 1,
    verbose: false,
    ...overrides,
  };
}

function makeParsed(testCases: { name: string; line: number; endLine: number }[] = []): ParsedFile {
  return {
    source: {
      content: 'test content',
      relativePath: 'LoginTest.java',
      absolutePath: '/tmp/LoginTest.java',
      language: 'java',
      filePath: '/tmp/LoginTest.java',
    },
    ast: null,
    imports: [],
    classes: [
      {
        name: 'LoginTest',
        isTestClass: true,
        methods: [],
        fields: [],
        superClass: null,
        line: 1,
        endLine: 50,
      },
    ],
    functions: [],
    testCases: testCases.map((tc) => ({
      ...tc,
      body: '',
      selectors: [],
      actions: [],
      assertions: [],
      waits: [],
      hooks: [],
      description: '',
    })),
    pageObjects: [],
    selectors: [],
    waits: [],
    assertions: [],
    hooks: [],
    capabilities: [],
  };
}

function makeResult(
  transformedLines: { lineNumber: number; transformed: string }[] = [],
): TransformFileResult {
  return {
    sourcePath: 'LoginTest.java',
    targetPath: 'test_login.py',
    importBlock: '',
    transformedLines: transformedLines.map((tl) => ({
      ...tl,
      original: '',
      confidence: 'high' as TransformConfidence,
      needsReview: false,
    })),
    testStructure: 'class',
    manualInterventions: [],
    stats: {
      totalLines: 10,
      transformedLines: transformedLines.length,
      skippedLines: 0,
      manualInterventionLines: 0,
      highConfidence: transformedLines.length,
      mediumConfidence: 0,
      lowConfidence: 0,
    },
  };
}

describe('Python Code Generator — pytest (US-009)', () => {
  it('should generate pytest-style test functions', () => {
    const gen = new CodeGenerator(makeConfig());
    const parsed = makeParsed([{ name: 'login with valid credentials', line: 5, endLine: 10 }]);
    const result = makeResult([
      { lineNumber: 6, transformed: "await page.goto('/login')" },
      { lineNumber: 7, transformed: "await page.fill('#username', 'test')" },
    ]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('import pytest');
    expect(output.content).toContain('from playwright.sync_api import Page, expect');
    expect(output.content).toContain('def test_login_with_valid_credentials(page: Page) -> None:');
  });

  it('should include transformed lines in test body', () => {
    const gen = new CodeGenerator(makeConfig());
    const parsed = makeParsed([{ name: 'navigate to page', line: 5, endLine: 7 }]);
    const result = makeResult([{ lineNumber: 6, transformed: "await page.goto('/login')" }]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain("page.goto('/login')");
  });

  it('should generate pass for empty test body', () => {
    const gen = new CodeGenerator(makeConfig());
    const parsed = makeParsed([{ name: 'empty test', line: 5, endLine: 5 }]);
    const result = makeResult([]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('pass  # TODO:');
  });

  it('should use snake_case for function names', () => {
    const gen = new CodeGenerator(makeConfig());
    const parsed = makeParsed([{ name: 'UserCanLoginSuccessfully', line: 5, endLine: 10 }]);
    const result = makeResult([]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('def test_user_can_login_successfully(page: Page)');
  });

  it('should generate fallback test when no test cases found', () => {
    const gen = new CodeGenerator(makeConfig());
    const parsed = makeParsed([]);
    const result = makeResult([{ lineNumber: 1, transformed: "page.goto('/home')" }]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('def test_migrated(page: Page)');
    expect(output.content).toContain("page.goto('/home')");
  });
});

describe('Python Code Generator — unittest (US-009)', () => {
  it('should generate unittest.TestCase class', () => {
    const gen = new CodeGenerator(makeConfig({ pythonTestRunner: 'unittest' }));
    const parsed = makeParsed([{ name: 'login test', line: 5, endLine: 10 }]);
    const result = makeResult([{ lineNumber: 6, transformed: "await page.goto('/login')" }]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('import unittest');
    expect(output.content).toContain('from playwright.sync_api import sync_playwright');
    expect(output.content).toContain('class LoginTest(unittest.TestCase):');
  });

  it('should include setUpClass and tearDownClass', () => {
    const gen = new CodeGenerator(makeConfig({ pythonTestRunner: 'unittest' }));
    const parsed = makeParsed([]);
    const result = makeResult([]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('def setUpClass(cls)');
    expect(output.content).toContain('cls.playwright = sync_playwright().start()');
    expect(output.content).toContain('cls.browser = cls.playwright.chromium.launch()');
    expect(output.content).toContain('def tearDownClass(cls)');
    expect(output.content).toContain('cls.browser.close()');
    expect(output.content).toContain('cls.playwright.stop()');
  });

  it('should include setUp and tearDown', () => {
    const gen = new CodeGenerator(makeConfig({ pythonTestRunner: 'unittest' }));
    const parsed = makeParsed([]);
    const result = makeResult([]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('def setUp(self)');
    expect(output.content).toContain('self.page: Page = self.browser.new_page()');
    expect(output.content).toContain('def tearDown(self)');
    expect(output.content).toContain('self.page.close()');
  });

  it('should replace page. with self.page. in unittest mode', () => {
    const gen = new CodeGenerator(makeConfig({ pythonTestRunner: 'unittest' }));
    const parsed = makeParsed([{ name: 'navigate', line: 5, endLine: 7 }]);
    const result = makeResult([{ lineNumber: 6, transformed: "page.goto('/login')" }]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain("self.page.goto('/login')");
    // Should NOT have bare page. (without self.)
    expect(output.content).not.toMatch(/[^.]page\.goto/);
  });

  it('should include if __name__ == __main__ block', () => {
    const gen = new CodeGenerator(makeConfig({ pythonTestRunner: 'unittest' }));
    const parsed = makeParsed([]);
    const result = makeResult([]);

    const output = gen.generate(result, parsed);
    expect(output.content).toContain('if __name__ == "__main__":');
    expect(output.content).toContain('unittest.main()');
  });
});

describe('Python Page Object Generation (US-009)', () => {
  it('should generate Python page object with @property-style locators', () => {
    const gen = new CodeGenerator(makeConfig());
    const po = {
      name: 'Login',
      filePath: 'login-page.ts',
      selectors: [
        { name: 'usernameInput', selector: { value: 'username', type: 'id' } },
        { name: 'passwordInput', selector: { value: 'password', type: 'id' } },
      ],
      methods: [
        { name: 'loginAs', params: [{ name: 'username' }, { name: 'password' }], body: '' },
      ],
    };

    const output = gen.generatePageObject(po as any, 'python');
    expect(output.content).toContain('from playwright.sync_api import Page, Locator');
    expect(output.content).toContain('class LoginPage:');
    expect(output.content).toContain('def __init__(self, page: Page) -> None:');
    expect(output.content).toContain('self.username_input = page.locator("#username")');
    expect(output.content).toContain('def login_as(self, username, password) -> None:');
  });

  it('should generate conftest.py for pytest fixtures', () => {
    const gen = new CodeGenerator(makeConfig());
    const pos = [
      { name: 'Login', filePath: 'login.ts', selectors: [], methods: [] },
      { name: 'Dashboard', filePath: 'dash.ts', selectors: [], methods: [] },
    ];

    const output = gen.generateFixtures(pos as any, 'python');
    expect(output).not.toBeNull();
    expect(output!.path).toBe('conftest.py');
    expect(output!.content).toContain('import pytest');
    expect(output!.content).toContain('@pytest.fixture');
    expect(output!.content).toContain('def login_page(page: Page) -> LoginPage:');
    expect(output!.content).toContain('def dashboard_page(page: Page) -> DashboardPage:');
  });
});
