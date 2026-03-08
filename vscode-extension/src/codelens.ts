import * as vscode from 'vscode';

interface TestBlockPattern {
  regex: RegExp;
  label: string;
}

const TEST_BLOCK_PATTERNS: TestBlockPattern[] = [
  // JavaScript / TypeScript
  { regex: /^\s*(describe|context)\s*\(\s*['"`]/, label: 'test suite' },
  { regex: /^\s*(it|test|specify)\s*\(\s*['"`]/, label: 'test case' },
  { regex: /^\s*(before|after|beforeEach|afterEach|beforeAll|afterAll)\s*\(/, label: 'hook' },

  // Java (JUnit / TestNG)
  { regex: /^\s*@Test\b/, label: 'test method' },
  { regex: /^\s*@(Before|After|BeforeClass|AfterClass|BeforeEach|AfterEach)\b/, label: 'hook' },
  { regex: /^\s*public\s+void\s+test\w+\s*\(/, label: 'test method' },

  // Python (pytest / unittest)
  { regex: /^\s*def\s+test_\w+\s*\(/, label: 'test function' },
  { regex: /^\s*class\s+Test\w+/, label: 'test class' },
  { regex: /^\s*async\s+def\s+test_\w+\s*\(/, label: 'async test function' },

  // C# (NUnit / xUnit / MSTest)
  { regex: /^\s*\[Test\]/, label: 'test method' },
  { regex: /^\s*\[Fact\]/, label: 'test method' },
  { regex: /^\s*\[TestMethod\]/, label: 'test method' },
];

const FRAMEWORK_INDICATORS: RegExp[] = [
  // Selenium
  /require\s*\(\s*['"]selenium-webdriver['"]\s*\)/,
  /from\s+selenium/,
  /import\s+.*selenium/,
  /WebDriver\s/,
  /ChromeDriver|FirefoxDriver|EdgeDriver/,

  // Cypress
  /cy\.(visit|get|find|contains)/,
  /cypress/i,

  // Puppeteer
  /require\s*\(\s*['"]puppeteer['"]\s*\)/,
  /import\s+.*puppeteer/,
  /puppeteer\.launch/,

  // Appium
  /IOSDriver|AndroidDriver|AppiumDriver/,
  /MobileBy\./,
  /import\s+.*appium/,
];

export class AutomigrateCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();

    // Only provide lenses for files that look like they use a supported framework
    if (!this.isTestFile(text)) {
      return lenses;
    }

    // Add a "Preview Migration" lens at the top of the file
    const topRange = new vscode.Range(0, 0, 0, 0);
    lenses.push(
      new vscode.CodeLens(topRange, {
        title: '$(preview) Preview Migration to Playwright',
        command: 'automigrate.previewDiff',
        tooltip: 'Generate a diff showing how this file would be migrated to Playwright',
      }),
    );

    lenses.push(
      new vscode.CodeLens(topRange, {
        title: '$(play) Migrate to Playwright',
        command: 'automigrate.migrateFile',
        tooltip: 'Migrate this test file to Playwright',
      }),
    );

    // Add lenses above test blocks
    const lines = text.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      for (const pattern of TEST_BLOCK_PATTERNS) {
        if (pattern.regex.test(line)) {
          const range = new vscode.Range(lineIndex, 0, lineIndex, 0);

          lenses.push(
            new vscode.CodeLens(range, {
              title: `$(beaker) Migrate ${pattern.label} to Playwright`,
              command: 'automigrate.migrateLine',
              arguments: [document.uri.fsPath, lineIndex],
              tooltip: `Migrate this ${pattern.label} to Playwright`,
            }),
          );

          break; // One lens per line
        }
      }
    }

    return lenses;
  }

  private isTestFile(content: string): boolean {
    return FRAMEWORK_INDICATORS.some((regex) => regex.test(content));
  }
}
