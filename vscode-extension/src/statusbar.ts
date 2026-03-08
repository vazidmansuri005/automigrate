import * as vscode from 'vscode';

interface FrameworkDetection {
  framework: string;
  confidence: number;
  fileCount: number;
}

const FRAMEWORK_PATTERNS: Array<{
  regex: RegExp;
  framework: string;
}> = [
  // Selenium
  { regex: /import\s+org\.openqa\.selenium/, framework: 'Selenium' },
  { regex: /from\s+selenium/, framework: 'Selenium' },
  { regex: /require\s*\(\s*['"]selenium-webdriver/, framework: 'Selenium' },
  { regex: /from\s+['"]selenium-webdriver/, framework: 'Selenium' },
  { regex: /using\s+OpenQA\.Selenium/, framework: 'Selenium' },

  // Cypress
  { regex: /cy\.(visit|get|find|contains|intercept)/, framework: 'Cypress' },
  { regex: /Cypress\.(Commands|env|config)/, framework: 'Cypress' },

  // Puppeteer
  { regex: /require\s*\(\s*['"]puppeteer/, framework: 'Puppeteer' },
  { regex: /from\s+['"]puppeteer/, framework: 'Puppeteer' },

  // Appium
  { regex: /import\s+io\.appium/, framework: 'Appium' },
  { regex: /from\s+appium/, framework: 'Appium' },
  { regex: /\b(IOSDriver|AndroidDriver|AppiumDriver)\b/, framework: 'Appium' },

  // WebdriverIO
  { regex: /from\s+['"]@wdio\//, framework: 'WebdriverIO' },
  { regex: /require\s*\(\s*['"]@wdio\//, framework: 'WebdriverIO' },
  { regex: /from\s+['"]webdriverio['"]/, framework: 'WebdriverIO' },
  { regex: /browser\.url\s*\(/, framework: 'WebdriverIO' },
];

export class AutomigrateStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private detectedFramework: string | null = null;
  private readinessScore: number = 0;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusBarItem.command = 'automigrate.migrateFile';
    this.disposables.push(this.statusBarItem);

    // Update on editor change
    const editorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.updateForDocument(editor.document);
      } else {
        this.statusBarItem.hide();
      }
    });
    this.disposables.push(editorDisposable);

    // Update on document save
    const saveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document === doc) {
        this.updateForDocument(doc);
      }
    });
    this.disposables.push(saveDisposable);

    // Initial update
    if (vscode.window.activeTextEditor) {
      this.updateForDocument(vscode.window.activeTextEditor.document);
    }
  }

  getDetectedFramework(): string | null {
    return this.detectedFramework;
  }

  getReadinessScore(): number {
    return this.readinessScore;
  }

  private updateForDocument(document: vscode.TextDocument): void {
    const supportedLanguages = ['javascript', 'typescript', 'java', 'python', 'csharp'];
    if (!supportedLanguages.includes(document.languageId)) {
      this.statusBarItem.hide();
      this.detectedFramework = null;
      return;
    }

    const text = document.getText();
    const detection = this.detectFramework(text);

    if (!detection) {
      this.statusBarItem.hide();
      this.detectedFramework = null;
      return;
    }

    this.detectedFramework = detection.framework;
    this.readinessScore = this.calculateReadiness(text, detection.framework);

    const icon =
      this.readinessScore >= 80 ? '$(check)' : this.readinessScore >= 50 ? '$(warning)' : '$(info)';

    this.statusBarItem.text = `${icon} automigrate: ${detection.framework} (${this.readinessScore}% ready)`;
    this.statusBarItem.tooltip =
      `Detected: ${detection.framework}\n` +
      `Migration readiness: ${this.readinessScore}%\n` +
      `Click to migrate this file`;
    this.statusBarItem.show();
  }

  private detectFramework(text: string): FrameworkDetection | null {
    const frameworkHits = new Map<string, number>();

    for (const pattern of FRAMEWORK_PATTERNS) {
      const matches = text.match(new RegExp(pattern.regex, 'g'));
      if (matches) {
        const current = frameworkHits.get(pattern.framework) ?? 0;
        frameworkHits.set(pattern.framework, current + matches.length);
      }
    }

    if (frameworkHits.size === 0) return null;

    // Return the framework with the most hits
    let bestFramework = '';
    let bestCount = 0;
    for (const [fw, count] of frameworkHits) {
      if (count > bestCount) {
        bestFramework = fw;
        bestCount = count;
      }
    }

    return {
      framework: bestFramework,
      confidence: Math.min(bestCount * 20, 100),
      fileCount: 1,
    };
  }

  private calculateReadiness(text: string, framework: string): number {
    let score = 70; // Base readiness — most straightforward APIs

    const lines = text.split('\n');
    const totalLines = lines.length;

    // Penalty for very large files
    if (totalLines > 500) score -= 10;
    if (totalLines > 1000) score -= 10;

    // Penalty for complex patterns
    if (/Thread\.sleep|time\.sleep|cy\.wait\(\d/.test(text)) score -= 5;
    if (/iframe|switchTo\(\)\.frame/i.test(text)) score -= 5;
    if (/shadow-?dom|shadowRoot/i.test(text)) score -= 10;
    if (/Actions\s*\(|new\s+Actions/i.test(text)) score -= 5;
    if (/file.*upload|input.*type.*file/i.test(text)) score -= 5;

    // Bonus for clean patterns
    if (/describe\s*\(|@Test|def\s+test_/.test(text)) score += 5;
    if (/Page\s*Object|PageObject|page_object/.test(text)) score += 5;

    return Math.max(10, Math.min(100, score));
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
