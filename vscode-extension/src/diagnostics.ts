import * as vscode from 'vscode';

interface MigrationPattern {
  regex: RegExp;
  framework: string;
  message: string;
  playwrightEquivalent: string;
}

const MIGRATION_PATTERNS: MigrationPattern[] = [
  // Selenium (Java / JS / Python / C#)
  {
    regex: /driver\.(findElement|FindElement)\s*\(/,
    framework: 'Selenium',
    message: 'Selenium findElement can be migrated to Playwright locator.',
    playwrightEquivalent: 'page.locator()',
  },
  {
    regex: /driver\.get\s*\(/,
    framework: 'Selenium',
    message: 'Selenium driver.get() can be migrated to Playwright page.goto().',
    playwrightEquivalent: 'page.goto()',
  },
  {
    regex: /new\s+WebDriverWait\s*\(/,
    framework: 'Selenium',
    message: 'Selenium WebDriverWait can be replaced — Playwright auto-waits for elements.',
    playwrightEquivalent: 'Playwright auto-wait (built-in)',
  },
  {
    regex: /WebDriverWait\s*\(.*?\)\.until\s*\(/,
    framework: 'Selenium',
    message: 'Selenium explicit wait can be simplified — Playwright auto-waits for actionability.',
    playwrightEquivalent: 'await page.locator().waitFor()',
  },
  {
    regex: /driver\.(findElements|FindElements)\s*\(/,
    framework: 'Selenium',
    message: 'Selenium findElements can be migrated to Playwright locator.all().',
    playwrightEquivalent: 'page.locator().all()',
  },
  {
    regex: /By\.(id|className|cssSelector|xpath|name|tagName|linkText)\s*\(/,
    framework: 'Selenium',
    message: 'Selenium By selector can be migrated to a Playwright locator.',
    playwrightEquivalent: 'page.locator() / page.getByRole() / page.getByTestId()',
  },
  {
    regex: /Thread\.sleep\s*\(/,
    framework: 'Selenium',
    message: 'Thread.sleep() is a hard wait — Playwright auto-waits, making this unnecessary.',
    playwrightEquivalent: 'Remove (Playwright auto-waits)',
  },
  {
    regex: /driver\.(click|sendKeys|getText|getAttribute)\s*\(/,
    framework: 'Selenium',
    message: 'Selenium element action can be migrated to Playwright locator action.',
    playwrightEquivalent: 'locator.click() / locator.fill() / locator.textContent()',
  },

  // Cypress
  {
    regex: /cy\.(visit|get|find|contains|click|type)\s*\(/,
    framework: 'Cypress',
    message: 'Cypress command can be migrated to Playwright equivalent.',
    playwrightEquivalent: 'page.goto() / page.locator() / locator.click() / locator.fill()',
  },
  {
    regex: /cy\.intercept\s*\(/,
    framework: 'Cypress',
    message: 'Cypress cy.intercept() can be migrated to Playwright page.route().',
    playwrightEquivalent: 'page.route()',
  },
  {
    regex: /cy\.wait\s*\(\s*['"]@/,
    framework: 'Cypress',
    message: 'Cypress alias wait can be migrated to Playwright waitForResponse().',
    playwrightEquivalent: 'page.waitForResponse()',
  },
  {
    regex: /cy\.fixture\s*\(/,
    framework: 'Cypress',
    message: 'Cypress fixture can be loaded via fs in Playwright test fixtures.',
    playwrightEquivalent: 'JSON.parse(fs.readFileSync()) or test fixture',
  },
  {
    regex: /\.should\s*\(\s*['"]/,
    framework: 'Cypress',
    message: 'Cypress .should() assertion can be migrated to Playwright expect().',
    playwrightEquivalent: 'expect(locator).toBeVisible() / toHaveText() / etc.',
  },

  // Puppeteer
  {
    regex: /puppeteer\.launch\s*\(/,
    framework: 'Puppeteer',
    message: 'Puppeteer launch can be replaced with Playwright test fixtures.',
    playwrightEquivalent: 'test({ page }) => { ... }',
  },
  {
    regex: /page\.\$\s*\(/,
    framework: 'Puppeteer',
    message: 'Puppeteer page.$() can be migrated to Playwright page.locator().',
    playwrightEquivalent: 'page.locator()',
  },
  {
    regex: /page\.\$eval\s*\(/,
    framework: 'Puppeteer',
    message: 'Puppeteer page.$eval() can be migrated to Playwright locator.evaluate().',
    playwrightEquivalent: 'page.locator().evaluate()',
  },
  {
    regex: /page\.waitForSelector\s*\(/,
    framework: 'Puppeteer',
    message: 'Puppeteer waitForSelector is unnecessary — Playwright auto-waits.',
    playwrightEquivalent: 'page.locator().waitFor() or remove (auto-wait)',
  },
  {
    regex: /page\.waitForNavigation\s*\(/,
    framework: 'Puppeteer',
    message: 'Puppeteer waitForNavigation can be migrated to Playwright waitForURL().',
    playwrightEquivalent: 'page.waitForURL()',
  },

  // Appium
  {
    regex: /new\s+(IOSDriver|AndroidDriver|AppiumDriver)\s*[<(]/,
    framework: 'Appium',
    message: 'Appium driver creation can be migrated to Playwright Android/iOS API.',
    playwrightEquivalent: 'playwright.android.connect() / playwright._android',
  },
  {
    regex: /MobileBy\.(accessibilityId|id|xpath|className)\s*\(/,
    framework: 'Appium',
    message: 'Appium MobileBy selector can be migrated to Playwright locator.',
    playwrightEquivalent: 'page.locator() / page.getByRole()',
  },

  // WebdriverIO
  {
    regex: /browser\.url\s*\(/,
    framework: 'WebdriverIO',
    message: 'WDIO browser.url() can be migrated to Playwright page.goto().',
    playwrightEquivalent: 'page.goto()',
  },
  {
    regex: /\$\s*\(\s*['"`]/,
    framework: 'WebdriverIO',
    message: 'WDIO $() selector can be migrated to Playwright page.locator().',
    playwrightEquivalent: 'page.locator()',
  },
  {
    regex: /\$\$\s*\(\s*['"`]/,
    framework: 'WebdriverIO',
    message: 'WDIO $$() selector can be migrated to Playwright page.locator().all().',
    playwrightEquivalent: 'page.locator().all()',
  },
  {
    regex: /\.setValue\s*\(/,
    framework: 'WebdriverIO',
    message: 'WDIO setValue() can be migrated to Playwright locator.fill().',
    playwrightEquivalent: 'locator.fill()',
  },
  {
    regex: /\.waitForDisplayed\s*\(/,
    framework: 'WebdriverIO',
    message: 'WDIO waitForDisplayed() is unnecessary — Playwright auto-waits.',
    playwrightEquivalent: 'await expect(locator).toBeVisible()',
  },
  {
    regex: /expect\s*\(.*?\)\.(toBeDisplayed|toHaveText|toHaveValue|toBeClickable|toExist)\s*\(/,
    framework: 'WebdriverIO',
    message: 'WDIO assertion can be migrated to Playwright expect().',
    playwrightEquivalent: 'expect(locator).toBeVisible() / toHaveText() / etc.',
  },
];

export class AutomigrateDiagnostics implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('automigrate');

    // Scan on file open
    const openDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
      this.scanDocument(doc);
    });

    // Scan on file save
    const saveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
      this.scanDocument(doc);
    });

    // Scan on active editor change
    const editorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.scanDocument(editor.document);
      }
    });

    // Clear diagnostics when document is closed
    const closeDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
      this.diagnosticCollection.delete(doc.uri);
    });

    this.disposables.push(
      this.diagnosticCollection,
      openDisposable,
      saveDisposable,
      editorDisposable,
      closeDisposable,
    );

    context.subscriptions.push(this);

    // Register code action provider
    const codeActionProvider = new AutomigrateCodeActionProvider();
    const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
      [
        { language: 'javascript' },
        { language: 'typescript' },
        { language: 'java' },
        { language: 'python' },
        { language: 'csharp' },
      ],
      codeActionProvider,
      {
        providedCodeActionKinds: AutomigrateCodeActionProvider.providedCodeActionKinds,
      },
    );
    this.disposables.push(codeActionRegistration);

    // Scan all currently open documents
    vscode.workspace.textDocuments.forEach((doc) => this.scanDocument(doc));
  }

  private scanDocument(document: vscode.TextDocument): void {
    const supportedLanguages = ['javascript', 'typescript', 'java', 'python', 'csharp'];
    if (!supportedLanguages.includes(document.languageId)) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      for (const pattern of MIGRATION_PATTERNS) {
        const match = pattern.regex.exec(line);
        if (match) {
          const startChar = match.index;
          const endChar = startChar + match[0].length;

          const range = new vscode.Range(
            new vscode.Position(lineIndex, startChar),
            new vscode.Position(lineIndex, endChar),
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            `[${pattern.framework}] ${pattern.message}\nPlaywright equivalent: ${pattern.playwrightEquivalent}`,
            vscode.DiagnosticSeverity.Warning,
          );

          diagnostic.source = 'automigrate';
          diagnostic.code = pattern.framework.toLowerCase();

          diagnostics.push(diagnostic);
          break; // One diagnostic per line to avoid noise
        }
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

class AutomigrateCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    const automigrateDiagnostics = context.diagnostics.filter((d) => d.source === 'automigrate');

    for (const diagnostic of automigrateDiagnostics) {
      // "Migrate this line" action
      const migrateLineAction = new vscode.CodeAction(
        `Migrate this ${diagnostic.code} pattern to Playwright`,
        vscode.CodeActionKind.QuickFix,
      );
      migrateLineAction.command = {
        command: 'automigrate.migrateLine',
        title: 'Migrate Line',
        arguments: [document.uri.fsPath, diagnostic.range.start.line],
      };
      migrateLineAction.diagnostics = [diagnostic];
      migrateLineAction.isPreferred = true;
      actions.push(migrateLineAction);

      // "Migrate this file" action
      const migrateFileAction = new vscode.CodeAction(
        'Migrate entire file to Playwright',
        vscode.CodeActionKind.QuickFix,
      );
      migrateFileAction.command = {
        command: 'automigrate.migrateFile',
        title: 'Migrate File',
      };
      migrateFileAction.diagnostics = [diagnostic];
      actions.push(migrateFileAction);
    }

    return actions;
  }
}
