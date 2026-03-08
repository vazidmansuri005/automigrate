/**
 * Java parser using tree-sitter for Selenium Java and Appium Java sources.
 * Handles JUnit, TestNG, main() pattern test files.
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

// ─── Java Selenium Patterns ────────────────────────────────────────────────

const _SELENIUM_JAVA_IMPORTS = [
  'org.openqa.selenium',
  'org.openqa.selenium.remote',
  'org.openqa.selenium.chrome',
  'org.openqa.selenium.firefox',
  'org.openqa.selenium.edge',
  'org.openqa.selenium.support',
];

const _APPIUM_JAVA_IMPORTS = [
  'io.appium.java_client',
  'io.appium.java_client.android',
  'io.appium.java_client.ios',
  'io.appium.java_client.remote',
];

const SELENIUM_BY_METHODS: Record<string, SelectorType> = {
  id: 'id',
  cssSelector: 'css',
  xpath: 'xpath',
  name: 'name',
  className: 'className',
  tagName: 'tagName',
  linkText: 'linkText',
  partialLinkText: 'partialLinkText',
};

const JAVA_ANNOTATION_HOOKS: Record<string, HookType> = {
  BeforeAll: 'beforeAll',
  AfterAll: 'afterAll',
  BeforeEach: 'beforeEach',
  AfterEach: 'afterEach',
  Before: 'beforeAll',
  After: 'afterAll',
  BeforeClass: 'beforeAll',
  AfterClass: 'afterAll',
  BeforeMethod: 'beforeEach',
  AfterMethod: 'afterEach',
  BeforeSuite: 'beforeAll',
  AfterSuite: 'afterAll',
};

// ─── Regex-based Java Parser ───────────────────────────────────────────────
// Uses regex patterns for reliable Java parsing without native tree-sitter bindings.
// This approach is more portable and avoids native compilation issues.

interface JavaAST {
  content: string;
  lines: string[];
  packageName: string | null;
  imports: JavaImport[];
  classes: JavaClass[];
}

interface JavaImport {
  path: string;
  isStatic: boolean;
  line: number;
}

interface JavaClass {
  name: string;
  extends?: string;
  implements: string[];
  annotations: JavaAnnotation[];
  fields: JavaField[];
  methods: JavaMethod[];
  line: number;
  endLine: number;
}

interface JavaAnnotation {
  name: string;
  args?: string;
  line: number;
}

interface JavaMethod {
  name: string;
  returnType: string;
  params: string;
  annotations: JavaAnnotation[];
  modifiers: string[];
  body: string;
  line: number;
  endLine: number;
}

interface JavaField {
  name: string;
  type: string;
  modifiers: string[];
  value?: string;
  annotations: JavaAnnotation[];
  line: number;
}

export class JavaParser extends BaseParser {
  language = 'java' as const;
  supportedFrameworks: SourceFramework[] = ['selenium', 'appium'];

  protected async buildAST(file: SourceFile): Promise<JavaAST> {
    return parseJavaSource(file.content);
  }

  protected extractImports(ast: JavaAST, file: SourceFile): ImportStatement[] {
    return ast.imports.map((imp) => {
      const parts = imp.path.split('.');
      const member = parts[parts.length - 1];
      return {
        module: imp.path,
        members: member === '*' ? ['*'] : [member],
        isDefault: false,
        line: imp.line,
        raw: file.content.split('\n')[imp.line - 1]?.trim() ?? '',
      };
    });
  }

  protected extractClasses(ast: JavaAST, file: SourceFile): ClassDefinition[] {
    return ast.classes.map((cls) => {
      const methods = cls.methods.map((m) => this.convertMethod(m, file));
      const properties = cls.fields.map((f) => this.convertField(f));
      const annotations = cls.annotations.map((a) => ({
        name: a.name,
        line: a.line,
      }));

      const isPageObject =
        cls.name.includes('Page') ||
        cls.name.includes('Component') ||
        cls.extends?.includes('Page') ||
        false;

      const isTestClass =
        cls.name.includes('Test') ||
        cls.annotations.some((a) => ['RunWith', 'ExtendWith', 'TestInstance'].includes(a.name)) ||
        methods.some((m) => m.isTest);

      return {
        name: cls.name,
        extends: cls.extends,
        implements: cls.implements,
        methods,
        properties,
        annotations,
        line: cls.line,
        isPageObject,
        isTestClass,
      };
    });
  }

  protected extractFunctions(ast: JavaAST, file: SourceFile): FunctionDefinition[] {
    const functions: FunctionDefinition[] = [];

    for (const cls of ast.classes) {
      // Find main() method — common in LambdaTest/Appium tests
      const mainMethod = cls.methods.find(
        (m) =>
          m.name === 'main' && m.modifiers.includes('static') && m.modifiers.includes('public'),
      );

      if (mainMethod) {
        functions.push(this.convertMethod(mainMethod, file));
      }
    }

    return functions;
  }

  protected extractTestCases(ast: JavaAST, _file: SourceFile): TestCase[] {
    const tests: TestCase[] = [];

    for (const cls of ast.classes) {
      for (const method of cls.methods) {
        const isTest =
          method.annotations.some((a) => a.name === 'Test') ||
          method.name.startsWith('test') ||
          (method.name === 'main' && method.modifiers.includes('static'));

        if (!isTest) continue;

        const selectors = this.extractSelectorsFromBody(method.body, method.line);
        const waits = this.extractWaitsFromBody(method.body, method.line);
        const assertions = this.extractAssertionsFromBody(method.body, method.line);

        tests.push({
          name: method.name,
          description: method.annotations
            .find((a) => a.name === 'DisplayName' || a.name === 'Description')
            ?.args?.replace(/['"]/g, ''),
          body: method.body,
          selectors,
          actions: this.extractActionsFromBody(method.body, method.line),
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
    _ast: JavaAST,
    _file: SourceFile,
    classes: ClassDefinition[],
  ): PageObjectDefinition[] {
    return classes
      .filter((c) => c.isPageObject)
      .map((c) => ({
        name: c.name,
        url: undefined,
        selectors: c.properties
          .filter(
            (p) =>
              p.type?.includes('By') || p.type?.includes('WebElement') || p.value?.includes('By.'),
          )
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

  protected extractSelectors(ast: JavaAST, _file: SourceFile): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];
    const byRegex =
      /By\.(id|cssSelector|xpath|name|className|tagName|linkText|partialLinkText)\s*\(\s*["']([^"']+)["']\s*\)/g;

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

      // Appium-specific: MobileBy, AppiumBy
      const appiumByRegex =
        /(?:MobileBy|AppiumBy)\.(accessibilityId|AndroidUIAutomator|iOSClassChain|iOSNsPredicateString|id|xpath|cssSelector)\s*\(\s*["']([^"']+)["']\s*\)/g;
      appiumByRegex.lastIndex = 0;

      while ((match = appiumByRegex.exec(line)) !== null) {
        selectors.push({
          type: 'custom',
          value: match[2],
          strategy: 'custom',
          line: i + 1,
          raw: line.trim(),
          confidence: 0.7,
        });
      }
    }

    return selectors;
  }

  protected extractWaits(ast: JavaAST, _file: SourceFile): WaitUsage[] {
    const waits: WaitUsage[] = [];

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];

      // Thread.sleep(ms)
      const sleepMatch = line.match(/Thread\.sleep\s*\(\s*(\d+)\s*\)/);
      if (sleepMatch) {
        waits.push({
          type: 'sleep',
          timeout: parseInt(sleepMatch[1], 10),
          line: i + 1,
          raw: line.trim(),
        });
      }

      // new WebDriverWait(driver, Duration.ofSeconds(n))
      const wdwMatch = line.match(
        /new\s+WebDriverWait\s*\([^,]+,\s*(?:Duration\.ofSeconds\s*\(\s*(\d+)\s*\)|(\d+))\s*\)/,
      );
      if (wdwMatch) {
        waits.push({
          type: 'explicit',
          timeout: parseInt(wdwMatch[1] ?? wdwMatch[2], 10),
          line: i + 1,
          raw: line.trim(),
        });
      }

      // driver.manage().timeouts().implicitlyWait(...)
      if (line.includes('implicitlyWait')) {
        const timeMatch = line.match(/(?:Duration\.ofSeconds\s*\(\s*(\d+)|(\d+)\s*,\s*TimeUnit)/);
        waits.push({
          type: 'implicit',
          timeout: timeMatch ? parseInt(timeMatch[1] ?? timeMatch[2], 10) : undefined,
          line: i + 1,
          raw: line.trim(),
        });
      }
    }

    return waits;
  }

  protected extractAssertions(ast: JavaAST, _file: SourceFile): AssertionUsage[] {
    const assertions: AssertionUsage[] = [];
    const assertionPatterns: Array<{
      pattern: RegExp;
      type: AssertionType;
    }> = [
      { pattern: /assertEquals\s*\(/, type: 'text' },
      { pattern: /assertTrue\s*\(/, type: 'visible' },
      { pattern: /assertFalse\s*\(/, type: 'hidden' },
      { pattern: /assertNotNull\s*\(/, type: 'exists' },
      { pattern: /assertNull\s*\(/, type: 'exists' },
      {
        pattern: /assertThat\s*\([^)]*\)\.isEqualTo/,
        type: 'text',
      },
      {
        pattern: /assertThat\s*\([^)]*\)\.contains/,
        type: 'text',
      },
      {
        pattern: /assertThat\s*\([^)]*\)\.isDisplayed/,
        type: 'visible',
      },
      { pattern: /\.isDisplayed\s*\(\s*\)/, type: 'visible' },
      { pattern: /\.isEnabled\s*\(\s*\)/, type: 'enabled' },
      { pattern: /\.isSelected\s*\(\s*\)/, type: 'selected' },
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
        }
      }
    }

    return assertions;
  }

  protected extractHooks(ast: JavaAST, _file: SourceFile): HookUsage[] {
    const hooks: HookUsage[] = [];

    for (const cls of ast.classes) {
      for (const method of cls.methods) {
        for (const annotation of method.annotations) {
          const hookType = JAVA_ANNOTATION_HOOKS[annotation.name];
          if (hookType) {
            hooks.push({
              type: hookType,
              body: method.body,
              line: method.line,
            });
          }
        }
      }
    }

    return hooks;
  }

  protected extractCapabilities(ast: JavaAST, _file: SourceFile): CapabilityUsage[] {
    const capabilities: CapabilityUsage[] = [];
    const capRegex =
      /\.(?:setCapability|put)\s*\(\s*["']([^"']+)["']\s*,\s*["']?([^"')]+)["']?\s*\)/g;

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];
      let match;
      capRegex.lastIndex = 0;

      while ((match = capRegex.exec(line)) !== null) {
        capabilities.push({
          key: match[1],
          value: match[2].trim(),
          line: i + 1,
        });
      }
    }

    return capabilities;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private convertMethod(method: JavaMethod, _file: SourceFile): FunctionDefinition {
    return {
      name: method.name,
      params: this.parseJavaParams(method.params),
      returnType: method.returnType,
      body: method.body,
      annotations: method.annotations.map((a) => ({
        name: a.name,
        args: a.args ? { value: a.args } : undefined,
        line: a.line,
      })),
      isAsync: false,
      isTest:
        method.annotations.some((a) => a.name === 'Test') ||
        method.name.startsWith('test') ||
        method.name === 'main',
      line: method.line,
    };
  }

  private convertField(field: JavaField): PropertyDefinition {
    return {
      name: field.name,
      type: field.type,
      value: field.value,
      isStatic: field.modifiers.includes('static'),
      visibility: field.modifiers.includes('private')
        ? 'private'
        : field.modifiers.includes('protected')
          ? 'protected'
          : 'public',
      line: field.line,
    };
  }

  private parseJavaParams(paramsStr: string): ParameterDefinition[] {
    if (!paramsStr.trim()) return [];

    return paramsStr.split(',').map((p) => {
      const parts = p.trim().split(/\s+/);
      const name = parts[parts.length - 1];
      const type = parts.slice(0, -1).join(' ');
      return { name, type: type || undefined };
    });
  }

  private extractSelectorsFromBody(body: string, startLine: number): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];
    const byRegex =
      /By\.(id|cssSelector|xpath|name|className|tagName|linkText|partialLinkText)\s*\(\s*["']([^"']+)["']\s*\)/g;

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
      if (line.includes('Thread.sleep')) {
        const match = line.match(/Thread\.sleep\s*\(\s*(\d+)\s*\)/);
        waits.push({
          type: 'sleep',
          timeout: match ? parseInt(match[1], 10) : undefined,
          line: startLine + i,
          raw: line.trim(),
        });
      }
      if (line.includes('WebDriverWait')) {
        waits.push({
          type: 'explicit',
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
      if (/assert\w+\s*\(/.test(line)) {
        assertions.push({
          type: 'custom',
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
      { pattern: /\.click\s*\(/, type: 'click' },
      { pattern: /\.sendKeys\s*\(/, type: 'type' },
      { pattern: /\.clear\s*\(/, type: 'clear' },
      { pattern: /\.submit\s*\(/, type: 'click' },
      { pattern: /\.get\s*\(\s*["']http/, type: 'navigate' },
      { pattern: /\.navigate\(\)\.to\s*\(/, type: 'navigate' },
      { pattern: /\.navigate\(\)\.back\s*\(/, type: 'back' },
      { pattern: /\.navigate\(\)\.forward\s*\(/, type: 'forward' },
      { pattern: /\.navigate\(\)\.refresh\s*\(/, type: 'refresh' },
      { pattern: /Actions\s*\(/, type: 'custom' },
      { pattern: /\.switchTo\(\)\.frame\s*\(/, type: 'switchFrame' },
      { pattern: /\.switchTo\(\)\.window\s*\(/, type: 'switchWindow' },
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
      /By\.(id|cssSelector|xpath|name|className)\s*\(\s*["']([^"']+)["']\s*\)/,
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

// ─── Java Source Parser (Regex-based) ──────────────────────────────────────

function parseJavaSource(content: string): JavaAST {
  const lines = content.split('\n');

  // Package
  const packageMatch = content.match(/package\s+([\w.]+)\s*;/);
  const packageName = packageMatch?.[1] ?? null;

  // Imports
  const imports: JavaImport[] = [];
  for (let i = 0; i < lines.length; i++) {
    const importMatch = lines[i].match(/import\s+(static\s+)?([\w.*]+)\s*;/);
    if (importMatch) {
      imports.push({
        path: importMatch[2],
        isStatic: !!importMatch[1],
        line: i + 1,
      });
    }
  }

  // Classes
  const classes = parseJavaClasses(content, lines);

  return { content, lines, packageName, imports, classes };
}

function parseJavaClasses(content: string, lines: string[]): JavaClass[] {
  const classes: JavaClass[] = [];
  const classRegex =
    /(?:(@\w+(?:\([^)]*\))?)\s+)*(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const classLine = content.substring(0, match.index).split('\n').length;
    const className = match[2];
    const extendsClass = match[3];
    const implementsList = match[4] ? match[4].split(',').map((s) => s.trim()) : [];

    // Find class annotations
    const annotations: JavaAnnotation[] = [];
    for (let i = classLine - 3; i < classLine; i++) {
      if (i < 0 || i >= lines.length) continue;
      const annoMatch = lines[i].match(/@(\w+)(?:\(([^)]*)\))?/);
      if (annoMatch) {
        annotations.push({
          name: annoMatch[1],
          args: annoMatch[2],
          line: i + 1,
        });
      }
    }

    // Find matching closing brace
    const classStart = match.index + match[0].length;
    const classEnd = findMatchingBrace(content, classStart - 1);
    const classBody = content.substring(classStart, classEnd);

    // Parse fields and methods
    const fields = parseJavaFields(classBody, classLine);
    const methods = parseJavaMethods(classBody, classLine, lines);

    classes.push({
      name: className,
      extends: extendsClass,
      implements: implementsList,
      annotations,
      fields,
      methods,
      line: classLine,
      endLine: content.substring(0, classEnd).split('\n').length,
    });
  }

  return classes;
}

function parseJavaFields(classBody: string, classStartLine: number): JavaField[] {
  const fields: JavaField[] = [];
  const fieldRegex =
    /(?:(public|private|protected)\s+)?(?:(static|final)\s+)*(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:=\s*([^;]+))?\s*;/g;

  const bodyLines = classBody.split('\n');
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i].trim();
    // Skip method declarations
    if (line.includes('(') && line.includes(')')) continue;
    if (line.startsWith('//') || line.startsWith('/*')) continue;

    fieldRegex.lastIndex = 0;
    const match = fieldRegex.exec(line);
    if (match) {
      const modifiers: string[] = [];
      if (match[1]) modifiers.push(match[1]);
      if (match[2]) modifiers.push(match[2]);

      fields.push({
        name: match[4],
        type: match[3],
        modifiers,
        value: match[5]?.trim(),
        annotations: [],
        line: classStartLine + i,
      });
    }
  }

  return fields;
}

function parseJavaMethods(
  classBody: string,
  classStartLine: number,
  _allLines: string[],
): JavaMethod[] {
  const methods: JavaMethod[] = [];
  const methodRegex =
    /(?:(@\w+(?:\([^)]*\))?)\s+)*(?:(public|private|protected)\s+)?(?:(static|final|abstract|synchronized)\s+)*(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;

  let match;
  while ((match = methodRegex.exec(classBody)) !== null) {
    const methodLine = classStartLine + classBody.substring(0, match.index).split('\n').length - 1;

    const modifiers: string[] = [];
    if (match[2]) modifiers.push(match[2]);
    if (match[3]) modifiers.push(match[3]);

    // Find method annotations
    const annotations: JavaAnnotation[] = [];
    const beforeMethod = classBody.substring(Math.max(0, match.index - 200), match.index);
    const annoRegex = /@(\w+)(?:\(([^)]*)\))?/g;
    let annoMatch;
    while ((annoMatch = annoRegex.exec(beforeMethod)) !== null) {
      annotations.push({
        name: annoMatch[1],
        args: annoMatch[2],
        line: methodLine - 1,
      });
    }

    // Find method body
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findMatchingBrace(classBody, bodyStart - 1);
    const body = classBody.substring(bodyStart, bodyEnd);

    const endLine = classStartLine + classBody.substring(0, bodyEnd).split('\n').length - 1;

    methods.push({
      name: match[5],
      returnType: match[4],
      params: match[6],
      annotations,
      modifiers,
      body,
      line: methodLine,
      endLine,
    });
  }

  return methods;
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
  let depth = 1;
  let i = openBraceIndex + 1;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  while (i < content.length && depth > 0) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
    } else if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
    } else if (inString) {
      if (char === '\\') {
        i++; // skip escaped char
      } else if (char === stringChar) {
        inString = false;
      }
    } else {
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
      } else if (char === '/' && nextChar === '*') {
        inBlockComment = true;
      } else if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
    }

    i++;
  }

  return i - 1;
}
