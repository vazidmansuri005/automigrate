/**
 * C# parser using regex for Selenium C# sources.
 * Handles NUnit, xUnit, and MSTest test patterns.
 */

import type {
  SourceFile,
  SourceFramework,
  ImportStatement,
  ClassDefinition,
  FunctionDefinition,
  TestCase,
  PageObjectDefinition,
  SelectorUsage,
  SelectorType,
  SelectorStrategy,
  WaitUsage,
  AssertionUsage,
  AssertionType,
  HookUsage,
  HookType,
  ActionType,
  CapabilityUsage,
  PropertyDefinition,
  ParameterDefinition,
} from '../../types/index.js';
import { BaseParser } from './base-parser.js';

// ─── C# Selenium Patterns ─────────────────────────────────────────────────

const SELENIUM_BY_METHODS: Record<string, SelectorType> = {
  Id: 'id',
  CssSelector: 'css',
  XPath: 'xpath',
  Name: 'name',
  ClassName: 'className',
  TagName: 'tagName',
  LinkText: 'linkText',
  PartialLinkText: 'partialLinkText',
};

const CSHARP_HOOK_ANNOTATIONS: Record<string, HookType> = {
  // NUnit
  SetUp: 'beforeEach',
  TearDown: 'afterEach',
  OneTimeSetUp: 'beforeAll',
  OneTimeTearDown: 'afterAll',
  // MSTest
  TestInitialize: 'beforeEach',
  TestCleanup: 'afterEach',
  ClassInitialize: 'beforeAll',
  ClassCleanup: 'afterAll',
};

// ─── AST Interfaces ──────────────────────────────────────────────────────

interface CSharpAST {
  content: string;
  lines: string[];
  imports: CSharpImport[];
  classes: CSharpClass[];
  topLevelMethods: CSharpMethod[];
}

interface CSharpImport {
  namespace: string;
  line: number;
  raw: string;
}

interface CSharpClass {
  name: string;
  bases: string[];
  annotations: string[];
  fields: CSharpField[];
  methods: CSharpMethod[];
  line: number;
  endLine: number;
  body: string;
}

interface CSharpField {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  value?: string;
  line: number;
}

interface CSharpMethod {
  name: string;
  params: string;
  returnType: string;
  annotations: string[];
  body: string;
  line: number;
  endLine: number;
  isAsync: boolean;
  visibility: 'public' | 'private' | 'protected';
}

// ─── Regex-based C# Parser ──────────────────────────────────────────────

export class CSharpParser extends BaseParser {
  language = 'csharp' as const;
  supportedFrameworks: SourceFramework[] = ['selenium'];

  protected async buildAST(file: SourceFile): Promise<CSharpAST> {
    return parseCSharpSource(file.content);
  }

  protected extractImports(ast: CSharpAST, _file: SourceFile): ImportStatement[] {
    return ast.imports.map((imp) => ({
      module: imp.namespace,
      members: [imp.namespace.split('.').pop() ?? imp.namespace],
      isDefault: false,
      line: imp.line,
      raw: imp.raw,
    }));
  }

  protected extractClasses(ast: CSharpAST, _file: SourceFile): ClassDefinition[] {
    return ast.classes.map((cls) => {
      const methods = cls.methods.map((m) => this.convertMethod(m));
      const properties = this.extractClassProperties(cls);

      const isPageObject =
        cls.name.includes('Page') ||
        cls.name.includes('Component') ||
        cls.bases.some((b) => b.includes('Page'));

      const isTestClass =
        cls.annotations.some((a) => a === 'TestFixture' || a === 'TestClass') ||
        cls.name.endsWith('Tests') ||
        cls.name.endsWith('Test') ||
        methods.some((m) => m.isTest);

      return {
        name: cls.name,
        extends: cls.bases[0],
        implements: cls.bases.slice(1),
        methods,
        properties,
        annotations: cls.annotations.map((a, idx) => ({
          name: a,
          line: cls.line - cls.annotations.length + idx,
        })),
        line: cls.line,
        isPageObject,
        isTestClass,
      };
    });
  }

  protected extractFunctions(ast: CSharpAST, _file: SourceFile): FunctionDefinition[] {
    return ast.topLevelMethods.map((m) => this.convertMethod(m));
  }

  protected extractTestCases(ast: CSharpAST, _file: SourceFile): TestCase[] {
    const tests: TestCase[] = [];

    for (const cls of ast.classes) {
      for (const method of cls.methods) {
        if (!this.isTestMethod(method)) continue;

        const selectors = this.extractSelectorsFromBody(method.body, method.line);
        const waits = this.extractWaitsFromBody(method.body, method.line);
        const assertions = this.extractAssertionsFromBody(method.body, method.line);
        const actions = this.extractActionsFromBody(method.body, method.line);

        tests.push({
          name: method.name,
          description: undefined,
          body: method.body,
          selectors,
          actions,
          assertions,
          waits,
          hooks: [],
          line: method.line,
          endLine: method.endLine,
        });
      }
    }

    return tests;
  }

  protected extractPageObjects(
    _ast: CSharpAST,
    _file: SourceFile,
    classes: ClassDefinition[],
  ): PageObjectDefinition[] {
    return classes
      .filter((c) => c.isPageObject)
      .map((c) => ({
        name: c.name,
        url: undefined,
        selectors: c.properties
          .filter((p) => p.value?.includes('By.') || p.type?.includes('IWebElement'))
          .map((p) => ({
            name: p.name,
            selector: this.parseSelectorFromValue(p.value ?? '', p.line),
            line: p.line,
          })),
        methods: c.methods.map((m) => ({
          name: m.name,
          params: m.params,
          actions: [],
          returnType: m.returnType,
          line: m.line,
        })),
        line: c.line,
      }));
  }

  protected extractSelectors(ast: CSharpAST, _file: SourceFile): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];

    // By.Xxx("value") pattern
    const byRegex =
      /By\.(Id|CssSelector|XPath|Name|ClassName|TagName|LinkText|PartialLinkText)\s*\(\s*["']([^"']+)["']\s*\)/g;

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];
      let match;
      byRegex.lastIndex = 0;

      while ((match = byRegex.exec(line)) !== null) {
        const byMethod = match[1];
        const value = match[2];
        selectors.push({
          type: SELENIUM_BY_METHODS[byMethod] ?? 'custom',
          value,
          strategy: `By.${byMethod}` as SelectorStrategy,
          line: i + 1,
          raw: line.trim(),
          confidence: 0.95,
        });
      }
    }

    return selectors;
  }

  protected extractWaits(ast: CSharpAST, _file: SourceFile): WaitUsage[] {
    const waits: WaitUsage[] = [];

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];

      // Thread.Sleep(ms)
      const sleepMatch = line.match(/Thread\.Sleep\s*\(\s*(\d+)\s*\)/);
      if (sleepMatch) {
        waits.push({
          type: 'sleep',
          timeout: parseInt(sleepMatch[1], 10),
          line: i + 1,
          raw: line.trim(),
        });
      }

      // new WebDriverWait(driver, TimeSpan.FromSeconds(n))
      const wdwMatch = line.match(
        /new\s+WebDriverWait\s*\([^,]+,\s*TimeSpan\.FromSeconds\s*\(\s*(\d+)\s*\)\s*\)/,
      );
      if (wdwMatch) {
        waits.push({
          type: 'explicit',
          timeout: parseInt(wdwMatch[1], 10),
          line: i + 1,
          raw: line.trim(),
        });
      }

      // ImplicitWait = TimeSpan.FromSeconds(n)
      const implicitMatch = line.match(
        /\.ImplicitWait\s*=\s*TimeSpan\.FromSeconds\s*\(\s*(\d+)\s*\)/,
      );
      if (implicitMatch) {
        waits.push({
          type: 'implicit',
          timeout: parseInt(implicitMatch[1], 10),
          line: i + 1,
          raw: line.trim(),
        });
      }
    }

    return waits;
  }

  protected extractAssertions(ast: CSharpAST, _file: SourceFile): AssertionUsage[] {
    const assertions: AssertionUsage[] = [];
    const assertionPatterns: Array<{
      pattern: RegExp;
      type: AssertionType;
    }> = [
      // NUnit
      { pattern: /Assert\.That\s*\(.+?,\s*Is\.EqualTo\s*\(/, type: 'text' },
      { pattern: /Assert\.That\s*\(.+?,\s*Is\.True\b/, type: 'visible' },
      { pattern: /Assert\.That\s*\(.+?,\s*Is\.False\b/, type: 'hidden' },
      { pattern: /Assert\.That\s*\(.+?,\s*Is\.Not\.Null\b/, type: 'exists' },
      { pattern: /Assert\.That\s*\(.+?,\s*Does\.Contain\b/, type: 'text' },
      { pattern: /Assert\.IsTrue\s*\(/, type: 'visible' },
      { pattern: /Assert\.IsFalse\s*\(/, type: 'hidden' },
      { pattern: /Assert\.AreEqual\s*\(/, type: 'text' },
      { pattern: /Assert\.AreNotEqual\s*\(/, type: 'text' },
      { pattern: /Assert\.IsNotNull\s*\(/, type: 'exists' },
      { pattern: /Assert\.IsNull\s*\(/, type: 'hidden' },
      // xUnit
      { pattern: /Assert\.Equal\s*\(/, type: 'text' },
      { pattern: /Assert\.NotEqual\s*\(/, type: 'text' },
      { pattern: /Assert\.True\s*\(/, type: 'visible' },
      { pattern: /Assert\.False\s*\(/, type: 'hidden' },
      { pattern: /Assert\.Contains\s*\(/, type: 'text' },
      { pattern: /Assert\.NotNull\s*\(/, type: 'exists' },
      { pattern: /Assert\.Null\s*\(/, type: 'hidden' },
      // MSTest
      { pattern: /StringAssert\.Contains\s*\(/, type: 'text' },
      // URL / title
      { pattern: /\.Url\s*(?:==|\.Equals)/, type: 'url' },
      { pattern: /\.Title\s*(?:==|\.Equals)/, type: 'title' },
    ];

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];
      for (const { pattern, type } of assertionPatterns) {
        if (pattern.test(line)) {
          assertions.push({
            type,
            line: i + 1,
            raw: line.trim(),
          });
          break;
        }
      }
    }

    return assertions;
  }

  protected extractHooks(ast: CSharpAST, _file: SourceFile): HookUsage[] {
    const hooks: HookUsage[] = [];

    for (const cls of ast.classes) {
      for (const method of cls.methods) {
        // Annotation-based hooks (NUnit/MSTest)
        for (const ann of method.annotations) {
          const hookType = CSHARP_HOOK_ANNOTATIONS[ann];
          if (hookType) {
            hooks.push({
              type: hookType,
              body: method.body,
              line: method.line,
            });
          }
        }

        // xUnit: constructor acts as beforeEach
        if (method.name === cls.name) {
          hooks.push({
            type: 'beforeEach',
            body: method.body,
            line: method.line,
          });
        }

        // xUnit: Dispose() acts as afterEach
        if (method.name === 'Dispose') {
          hooks.push({
            type: 'afterEach',
            body: method.body,
            line: method.line,
          });
        }
      }
    }

    return hooks;
  }

  protected extractCapabilities(ast: CSharpAST, _file: SourceFile): CapabilityUsage[] {
    const capabilities: CapabilityUsage[] = [];

    // options.AddArgument("--headless")
    const addArgRegex = /\.AddArgument\s*\(\s*["']([^"']+)["']\s*\)/g;

    // ChromeOptions / FirefoxOptions
    const optionsRegex =
      /(?:options|capabilities)\s*\[\s*["']([^"']+)["']\s*\]\s*=\s*["']?([^"';\n]+)["']?/g;

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];
      let match;

      addArgRegex.lastIndex = 0;
      while ((match = addArgRegex.exec(line)) !== null) {
        capabilities.push({
          key: 'argument',
          value: match[1],
          line: i + 1,
        });
      }

      optionsRegex.lastIndex = 0;
      while ((match = optionsRegex.exec(line)) !== null) {
        capabilities.push({
          key: match[1],
          value: match[2].trim(),
          line: i + 1,
        });
      }
    }

    return capabilities;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private convertMethod(method: CSharpMethod): FunctionDefinition {
    const params = this.parseCSharpParams(method.params);
    const annotations = method.annotations.map((a, idx) => ({
      name: a,
      line: method.line - method.annotations.length + idx,
    }));

    return {
      name: method.name,
      params,
      returnType: method.returnType,
      body: method.body,
      annotations,
      isAsync: method.isAsync,
      isTest: this.isTestMethod(method),
      line: method.line,
    };
  }

  private isTestMethod(method: CSharpMethod): boolean {
    const testAnnotations = ['Test', 'TestCase', 'Fact', 'Theory', 'InlineData', 'TestMethod'];
    if (method.annotations.some((a) => testAnnotations.includes(a))) return true;

    // Exclude hooks
    if (method.annotations.some((a) => CSHARP_HOOK_ANNOTATIONS[a])) return false;
    // Exclude constructors and Dispose
    if (method.name === 'Dispose') return false;

    return false;
  }

  private parseCSharpParams(paramsStr: string): ParameterDefinition[] {
    if (!paramsStr.trim()) return [];

    return paramsStr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        // Handle: type name = default
        const match = p.match(
          /^(?:(?:ref|out|in|params)\s+)?(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)(?:\s*=\s*(.+))?$/,
        );
        if (match) {
          return {
            name: match[2],
            type: match[1],
            defaultValue: match[3]?.trim(),
          };
        }
        return { name: p };
      });
  }

  private extractClassProperties(cls: CSharpClass): PropertyDefinition[] {
    return cls.fields.map((f) => ({
      name: f.name,
      type: f.type,
      value: f.value,
      isStatic: f.isStatic,
      visibility: f.visibility,
      line: f.line,
    }));
  }

  private extractSelectorsFromBody(body: string, startLine: number): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];
    const byRegex =
      /By\.(Id|CssSelector|XPath|Name|ClassName|TagName|LinkText|PartialLinkText)\s*\(\s*["']([^"']+)["']\s*\)/g;

    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      byRegex.lastIndex = 0;
      while ((match = byRegex.exec(lines[i])) !== null) {
        selectors.push({
          type: SELENIUM_BY_METHODS[match[1]] ?? 'custom',
          value: match[2],
          strategy: `By.${match[1]}` as SelectorStrategy,
          line: startLine + i,
          raw: lines[i].trim(),
          confidence: 0.95,
        });
      }
    }

    return selectors;
  }

  private extractWaitsFromBody(body: string, startLine: number): WaitUsage[] {
    const waits: WaitUsage[] = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('Thread.Sleep')) {
        const match = line.match(/Thread\.Sleep\s*\(\s*(\d+)\s*\)/);
        waits.push({
          type: 'sleep',
          timeout: match ? parseInt(match[1], 10) : undefined,
          line: startLine + i,
          raw: line.trim(),
        });
      }
      if (line.includes('WebDriverWait')) {
        const match = line.match(
          /WebDriverWait\s*\([^,]+,\s*TimeSpan\.FromSeconds\s*\(\s*(\d+)\s*\)\s*\)/,
        );
        waits.push({
          type: 'explicit',
          timeout: match ? parseInt(match[1], 10) : undefined,
          line: startLine + i,
          raw: line.trim(),
        });
      }
    }

    return waits;
  }

  private extractAssertionsFromBody(body: string, startLine: number): AssertionUsage[] {
    const assertions: AssertionUsage[] = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bAssert\b/.test(line)) {
        let type: AssertionType = 'custom';
        if (/\.IsTrue\b|\.True\b/.test(line)) type = 'visible';
        else if (/\.IsFalse\b|\.False\b/.test(line)) type = 'hidden';
        else if (/\.AreEqual\b|\.Equal\b|\.EqualTo\b/.test(line)) type = 'text';
        else if (/\.IsNotNull\b|\.NotNull\b/.test(line)) type = 'exists';
        else if (/\.Contains\b/.test(line)) type = 'text';

        assertions.push({
          type,
          line: startLine + i,
          raw: line.trim(),
        });
      }
    }

    return assertions;
  }

  private extractActionsFromBody(
    body: string,
    startLine: number,
  ): Array<{
    type: ActionType;
    line: number;
    raw: string;
    target?: SelectorUsage;
    value?: string;
  }> {
    const actions: Array<{
      type: ActionType;
      line: number;
      raw: string;
      target?: SelectorUsage;
      value?: string;
    }> = [];
    const lines = body.split('\n');
    const actionPatterns: Array<{ pattern: RegExp; type: ActionType }> = [
      { pattern: /\.Click\s*\(/, type: 'click' },
      { pattern: /\.SendKeys\s*\(/, type: 'type' },
      { pattern: /\.Clear\s*\(/, type: 'clear' },
      { pattern: /\.Submit\s*\(/, type: 'click' },
      { pattern: /\.Navigate\(\)\.GoToUrl\s*\(/, type: 'navigate' },
      { pattern: /\.Navigate\(\)\.Back\s*\(/, type: 'back' },
      { pattern: /\.Navigate\(\)\.Forward\s*\(/, type: 'forward' },
      { pattern: /\.Navigate\(\)\.Refresh\s*\(/, type: 'refresh' },
      { pattern: /\.SwitchTo\(\)\.Frame\s*\(/, type: 'switchFrame' },
      { pattern: /\.SwitchTo\(\)\.Window\s*\(/, type: 'switchWindow' },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, type } of actionPatterns) {
        if (pattern.test(lines[i])) {
          actions.push({
            type,
            line: startLine + i,
            raw: lines[i].trim(),
          });
        }
      }
    }

    return actions;
  }

  private parseSelectorFromValue(value: string, line: number): SelectorUsage {
    const byMatch = value.match(
      /By\.(Id|CssSelector|XPath|Name|ClassName)\s*\(\s*["']([^"']+)["']\s*\)/,
    );

    if (byMatch) {
      return {
        type: SELENIUM_BY_METHODS[byMatch[1]] ?? 'custom',
        value: byMatch[2],
        strategy: `By.${byMatch[1]}` as SelectorStrategy,
        line,
        raw: value,
        confidence: 0.95,
      };
    }

    return {
      type: 'custom',
      value,
      strategy: 'custom',
      line,
      raw: value,
      confidence: 0.5,
    };
  }
}

// ─── C# Source Parser (Regex-based) ──────────────────────────────────────

function parseCSharpSource(content: string): CSharpAST {
  const lines = content.split('\n');

  const imports = parseCSharpImports(lines);
  const classes = parseCSharpClasses(content, lines);

  return { content, lines, imports, classes, topLevelMethods: [] };
}

function parseCSharpImports(lines: string[]): CSharpImport[] {
  const imports: CSharpImport[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // using Namespace;
    const usingMatch = line.match(/^using\s+([\w.]+)\s*;/);
    if (usingMatch) {
      imports.push({
        namespace: usingMatch[1],
        line: i + 1,
        raw: line,
      });
    }
  }

  return imports;
}

function parseCSharpClasses(content: string, lines: string[]): CSharpClass[] {
  const classes: CSharpClass[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match class declaration
    const classMatch = line.match(
      /^\s*(?:public|internal|private|protected)?\s*(?:static\s+)?(?:partial\s+)?class\s+(\w+)(?:\s*:\s*([^{]+))?\s*\{?\s*$/,
    );
    if (!classMatch) continue;

    const className = classMatch[1];
    const basesStr = classMatch[2]?.trim();
    const bases = basesStr
      ? basesStr
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean)
      : [];

    // Collect annotations above the class
    const annotations: string[] = [];
    let j = i - 1;
    while (j >= 0 && lines[j].trim().startsWith('[')) {
      const annMatch = lines[j].trim().match(/\[\s*(\w+)/);
      if (annMatch) annotations.unshift(annMatch[1]);
      j--;
    }

    // Find class body using brace counting
    const classLine = i + 1;
    const braceStart = findOpenBrace(lines, i);
    if (braceStart < 0) continue;

    const endLine = findMatchingBrace(lines, braceStart);
    const bodyLines = lines.slice(braceStart + 1, endLine);
    const body = bodyLines.join('\n');

    // Parse fields and methods inside the class
    const fields = parseCSharpFields(bodyLines, braceStart + 1);
    const methods = parseCSharpMethods(bodyLines, braceStart + 1, className);

    classes.push({
      name: className,
      bases,
      annotations,
      fields,
      methods,
      line: classLine,
      endLine: endLine + 1,
      body,
    });

    // Skip to end of class
    i = endLine;
  }

  return classes;
}

function parseCSharpFields(bodyLines: string[], lineOffset: number): CSharpField[] {
  const fields: CSharpField[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i].trim();

    // Match field declaration: visibility [static] type name [= value];
    const fieldMatch = line.match(
      /^(public|private|protected)\s+(static\s+)?(?:readonly\s+)?(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*(?:=\s*(.+?))?\s*;/,
    );
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[4],
        type: fieldMatch[3],
        visibility: fieldMatch[1] as 'public' | 'private' | 'protected',
        isStatic: !!fieldMatch[2],
        value: fieldMatch[5]?.trim(),
        line: lineOffset + i + 1,
      });
    }
  }

  return fields;
}

function parseCSharpMethods(
  bodyLines: string[],
  lineOffset: number,
  className: string,
): CSharpMethod[] {
  const methods: CSharpMethod[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const trimmed = line.trim();

    // Collect annotations above the method
    const annotations: string[] = [];
    if (trimmed.startsWith('[')) {
      let k = i;
      while (k < bodyLines.length && bodyLines[k].trim().startsWith('[')) {
        const annMatch = bodyLines[k].trim().match(/\[\s*(\w+)/);
        if (annMatch) annotations.push(annMatch[1]);
        k++;
      }
      // Now check if the line after annotations is a method
      if (k < bodyLines.length) {
        const methodLine = bodyLines[k].trim();
        const methodMatch = methodLine.match(
          /^(public|private|protected)?\s*(?:static\s+)?(?:async\s+)?([\w<>?[\]]+(?:\s+\w+)*?)\s+(\w+)\s*\(([^)]*)\)/,
        );
        if (methodMatch) {
          const visibility = (methodMatch[1] ?? 'private') as 'public' | 'private' | 'protected';
          const returnType = methodMatch[2];
          const methodName = methodMatch[3];
          const params = methodMatch[4];
          const isAsync = methodLine.includes('async ');

          // Find method body
          const braceStart = findOpenBraceInSlice(bodyLines, k);
          if (braceStart < 0) {
            i = k;
            continue;
          }

          const endIdx = findMatchingBraceInSlice(bodyLines, braceStart);
          const methodBody = bodyLines.slice(braceStart + 1, endIdx).join('\n');

          methods.push({
            name: methodName,
            params,
            returnType,
            annotations,
            body: methodBody,
            line: lineOffset + k + 1,
            endLine: lineOffset + endIdx + 1,
            isAsync,
            visibility,
          });

          i = endIdx;
          continue;
        }
      }
    }

    // Match method without annotations
    const methodMatch = trimmed.match(
      /^(public|private|protected)?\s*(?:static\s+)?(?:async\s+)?([\w<>?[\]]+(?:\s+\w+)*?)\s+(\w+)\s*\(([^)]*)\)/,
    );
    if (methodMatch) {
      const visibility = (methodMatch[1] ?? 'private') as 'public' | 'private' | 'protected';
      const returnType = methodMatch[2];
      const methodName = methodMatch[3];
      const params = methodMatch[4];
      const isAsync = trimmed.includes('async ');

      // Skip field declarations that look like methods (no braces follow)
      const braceStart = findOpenBraceInSlice(bodyLines, i);
      if (braceStart < 0 || braceStart > i + 2) {
        continue;
      }

      const endIdx = findMatchingBraceInSlice(bodyLines, braceStart);
      const methodBody = bodyLines.slice(braceStart + 1, endIdx).join('\n');

      // Detect constructor
      const isConstructor = methodName === className;

      methods.push({
        name: methodName,
        params,
        returnType: isConstructor ? 'constructor' : returnType,
        annotations: [],
        body: methodBody,
        line: lineOffset + i + 1,
        endLine: lineOffset + endIdx + 1,
        isAsync,
        visibility,
      });

      i = endIdx;
    }
  }

  return methods;
}

// ─── Brace Matching Helpers ──────────────────────────────────────────────

function findOpenBrace(lines: string[], startIdx: number): number {
  for (let i = startIdx; i < Math.min(startIdx + 5, lines.length); i++) {
    if (lines[i].includes('{')) return i;
  }
  return -1;
}

function findMatchingBrace(lines: string[], braceLineIdx: number): number {
  let depth = 0;
  for (let i = braceLineIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

function findOpenBraceInSlice(lines: string[], startIdx: number): number {
  for (let i = startIdx; i < Math.min(startIdx + 3, lines.length); i++) {
    if (lines[i].includes('{')) return i;
  }
  return -1;
}

function findMatchingBraceInSlice(lines: string[], braceLineIdx: number): number {
  let depth = 0;
  for (let i = braceLineIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}
