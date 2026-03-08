/**
 * Python parser using regex for Selenium Python sources.
 * Handles pytest class-based and function-based test patterns.
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

// ─── Python Selenium Patterns ────────────────────────────────────────────────

const SELENIUM_BY_METHODS: Record<string, SelectorType> = {
  ID: 'id',
  CSS_SELECTOR: 'css',
  XPATH: 'xpath',
  NAME: 'name',
  CLASS_NAME: 'className',
  TAG_NAME: 'tagName',
  LINK_TEXT: 'linkText',
  PARTIAL_LINK_TEXT: 'partialLinkText',
};

const PYTHON_HOOK_NAMES: Record<string, HookType> = {
  setup_method: 'beforeEach',
  teardown_method: 'afterEach',
  setup: 'beforeEach',
  teardown: 'afterEach',
  setup_class: 'beforeAll',
  teardown_class: 'afterAll',
  setup_module: 'beforeAll',
  teardown_module: 'afterAll',
  setUpClass: 'beforeAll',
  tearDownClass: 'afterAll',
};

// ─── AST Interfaces ─────────────────────────────────────────────────────────

interface PythonAST {
  content: string;
  lines: string[];
  imports: PythonImport[];
  classes: PythonClass[];
  functions: PythonFunction[];
}

interface PythonImport {
  module: string;
  members: string[];
  isFrom: boolean;
  line: number;
  raw: string;
}

interface PythonClass {
  name: string;
  bases: string[];
  methods: PythonFunction[];
  line: number;
  endLine: number;
  body: string;
}

interface PythonFunction {
  name: string;
  params: string;
  decorators: string[];
  body: string;
  line: number;
  endLine: number;
  indent: number;
}

// ─── Regex-based Python Parser ──────────────────────────────────────────────

export class PythonParser extends BaseParser {
  language = 'python' as const;
  supportedFrameworks: SourceFramework[] = ['selenium'];

  protected async buildAST(file: SourceFile): Promise<PythonAST> {
    return parsePythonSource(file.content);
  }

  protected extractImports(ast: PythonAST, _file: SourceFile): ImportStatement[] {
    return ast.imports.map((imp) => ({
      module: imp.module,
      members: imp.members.length > 0 ? imp.members : [imp.module.split('.').pop() ?? imp.module],
      isDefault: !imp.isFrom,
      line: imp.line,
      raw: imp.raw,
    }));
  }

  protected extractClasses(ast: PythonAST, _file: SourceFile): ClassDefinition[] {
    return ast.classes.map((cls) => {
      const methods = cls.methods.map((m) => this.convertFunction(m));
      const properties = this.extractClassProperties(cls);

      const isPageObject =
        cls.name.includes('Page') ||
        cls.name.includes('Component') ||
        cls.bases.some((b) => b.includes('Page'));

      const isTestClass =
        cls.name.startsWith('Test') ||
        cls.name.endsWith('Test') ||
        cls.name.endsWith('Tests') ||
        methods.some((m) => m.isTest);

      return {
        name: cls.name,
        extends: cls.bases[0],
        implements: [],
        methods,
        properties,
        annotations: [],
        line: cls.line,
        isPageObject,
        isTestClass,
      };
    });
  }

  protected extractFunctions(ast: PythonAST, _file: SourceFile): FunctionDefinition[] {
    // Top-level functions (not inside classes)
    return ast.functions.map((fn) => this.convertFunction(fn));
  }

  protected extractTestCases(ast: PythonAST, _file: SourceFile): TestCase[] {
    const tests: TestCase[] = [];

    // Class-based test methods
    for (const cls of ast.classes) {
      for (const method of cls.methods) {
        if (!this.isTestFunction(method)) continue;

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

    // Top-level test functions (pytest function-based)
    for (const fn of ast.functions) {
      if (!this.isTestFunction(fn)) continue;

      const selectors = this.extractSelectorsFromBody(fn.body, fn.line);
      const waits = this.extractWaitsFromBody(fn.body, fn.line);
      const assertions = this.extractAssertionsFromBody(fn.body, fn.line);
      const actions = this.extractActionsFromBody(fn.body, fn.line);

      tests.push({
        name: fn.name,
        description: undefined,
        body: fn.body,
        selectors,
        actions,
        assertions,
        waits,
        hooks: [],
        line: fn.line,
        endLine: fn.endLine,
      });
    }

    return tests;
  }

  protected extractPageObjects(
    _ast: PythonAST,
    _file: SourceFile,
    classes: ClassDefinition[],
  ): PageObjectDefinition[] {
    return classes
      .filter((c) => c.isPageObject)
      .map((c) => ({
        name: c.name,
        url: undefined,
        selectors: c.properties
          .filter((p) => p.value?.includes('By.') || p.type?.includes('WebElement'))
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

  protected extractSelectors(ast: PythonAST, _file: SourceFile): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];

    // By.XXX pattern: find_element(By.ID, "value")
    const byRegex =
      /By\.(ID|CSS_SELECTOR|XPATH|NAME|CLASS_NAME|TAG_NAME|LINK_TEXT|PARTIAL_LINK_TEXT)\s*,\s*["']([^"']+)["']/g;

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

  protected extractWaits(ast: PythonAST, _file: SourceFile): WaitUsage[] {
    const waits: WaitUsage[] = [];

    for (let i = 0; i < ast.lines.length; i++) {
      const line = ast.lines[i];

      // time.sleep(n)
      const sleepMatch = line.match(/time\.sleep\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
      if (sleepMatch) {
        waits.push({
          type: 'sleep',
          timeout: Math.round(parseFloat(sleepMatch[1]) * 1000),
          line: i + 1,
          raw: line.trim(),
        });
      }

      // WebDriverWait(driver, n)
      const wdwMatch = line.match(/WebDriverWait\s*\([^,]+,\s*(\d+)\s*\)/);
      if (wdwMatch) {
        waits.push({
          type: 'explicit',
          timeout: parseInt(wdwMatch[1], 10),
          line: i + 1,
          raw: line.trim(),
        });
      }

      // implicitly_wait(n)
      const implicitMatch = line.match(/\.implicitly_wait\s*\(\s*(\d+)\s*\)/);
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

  protected extractAssertions(ast: PythonAST, _file: SourceFile): AssertionUsage[] {
    const assertions: AssertionUsage[] = [];
    const assertionPatterns: Array<{
      pattern: RegExp;
      type: AssertionType;
    }> = [
      { pattern: /assert\s+.*==\s*/, type: 'text' },
      { pattern: /assert\s+.*\.is_displayed\s*\(\s*\)/, type: 'visible' },
      { pattern: /assert\s+.*\.is_enabled\s*\(\s*\)/, type: 'enabled' },
      { pattern: /assert\s+.*\.is_selected\s*\(\s*\)/, type: 'selected' },
      { pattern: /assert\s+.*\bin\b/, type: 'text' },
      { pattern: /assert\s+not\s+/, type: 'hidden' },
      { pattern: /assertEqual\s*\(/, type: 'text' },
      { pattern: /assertTrue\s*\(/, type: 'visible' },
      { pattern: /assertFalse\s*\(/, type: 'hidden' },
      { pattern: /assertIn\s*\(/, type: 'text' },
      { pattern: /assertIsNotNone\s*\(/, type: 'exists' },
      { pattern: /\.title\s*==/, type: 'title' },
      { pattern: /\.current_url\s*==/, type: 'url' },
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
          break; // one assertion type per line
        }
      }
    }

    return assertions;
  }

  protected extractHooks(ast: PythonAST, _file: SourceFile): HookUsage[] {
    const hooks: HookUsage[] = [];

    // Class-level hooks
    for (const cls of ast.classes) {
      for (const method of cls.methods) {
        const hookType = PYTHON_HOOK_NAMES[method.name];
        if (hookType) {
          hooks.push({
            type: hookType,
            body: method.body,
            line: method.line,
          });
        }

        // pytest fixture decorators used as hooks
        for (const dec of method.decorators) {
          if (dec.includes('pytest.fixture')) {
            hooks.push({
              type: 'beforeEach',
              body: method.body,
              line: method.line,
            });
          }
        }
      }
    }

    // Top-level fixtures/hooks
    for (const fn of ast.functions) {
      const hookType = PYTHON_HOOK_NAMES[fn.name];
      if (hookType) {
        hooks.push({
          type: hookType,
          body: fn.body,
          line: fn.line,
        });
      }

      for (const dec of fn.decorators) {
        if (dec.includes('pytest.fixture')) {
          hooks.push({
            type: 'beforeEach',
            body: fn.body,
            line: fn.line,
          });
        }
      }
    }

    return hooks;
  }

  protected extractCapabilities(ast: PythonAST, _file: SourceFile): CapabilityUsage[] {
    const capabilities: CapabilityUsage[] = [];

    // desired_caps["key"] = "value" or desired_caps.update({...})
    const capRegex =
      /(?:desired_cap(?:abilities|s)?|caps?|options)\s*\[\s*["']([^"']+)["']\s*\]\s*=\s*["']?([^"'\n]+)["']?/g;

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

  private convertFunction(fn: PythonFunction): FunctionDefinition {
    const params = this.parsePythonParams(fn.params);
    const annotations = fn.decorators.map((d, idx) => ({
      name: d,
      line: fn.line - fn.decorators.length + idx,
    }));

    return {
      name: fn.name,
      params,
      returnType: undefined,
      body: fn.body,
      annotations,
      isAsync: fn.decorators.some((d) => d.includes('async')) || fn.name.startsWith('async_'),
      isTest: this.isTestFunction(fn),
      line: fn.line,
    };
  }

  private isTestFunction(fn: PythonFunction): boolean {
    if (fn.name.startsWith('test_') || fn.name.startsWith('test')) return true;
    if (fn.decorators.some((d) => d.includes('pytest.mark'))) return true;
    // Exclude setup/teardown hooks
    if (PYTHON_HOOK_NAMES[fn.name]) return false;
    return false;
  }

  private parsePythonParams(paramsStr: string): ParameterDefinition[] {
    if (!paramsStr.trim()) return [];

    return paramsStr
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && p !== 'self' && p !== 'cls')
      .map((p) => {
        // Handle type annotations: name: type = default
        const annotMatch = p.match(/^(\w+)\s*:\s*(\w+)(?:\s*=\s*(.+))?$/);
        if (annotMatch) {
          return {
            name: annotMatch[1],
            type: annotMatch[2],
            defaultValue: annotMatch[3]?.trim(),
          };
        }
        // Handle default values: name=default
        const defaultMatch = p.match(/^(\w+)\s*=\s*(.+)$/);
        if (defaultMatch) {
          return {
            name: defaultMatch[1],
            defaultValue: defaultMatch[2].trim(),
          };
        }
        return { name: p };
      });
  }

  private extractClassProperties(cls: PythonClass): PropertyDefinition[] {
    const properties: PropertyDefinition[] = [];

    // Match self.xxx = ... assignments in __init__ or setup_method
    const selfAssignRegex = /self\.(\w+)\s*=\s*(.+)/g;
    const lines = cls.body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let match;
      selfAssignRegex.lastIndex = 0;

      while ((match = selfAssignRegex.exec(lines[i])) !== null) {
        const name = match[1];
        // Skip duplicates
        if (properties.some((p) => p.name === name)) continue;

        properties.push({
          name,
          type: undefined,
          value: match[2].trim(),
          isStatic: false,
          visibility: 'public',
          line: cls.line + i,
        });
      }
    }

    return properties;
  }

  private extractSelectorsFromBody(body: string, startLine: number): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];
    const byRegex =
      /By\.(ID|CSS_SELECTOR|XPATH|NAME|CLASS_NAME|TAG_NAME|LINK_TEXT|PARTIAL_LINK_TEXT)\s*,\s*["']([^"']+)["']/g;

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
      if (line.includes('time.sleep')) {
        const match = line.match(/time\.sleep\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
        waits.push({
          type: 'sleep',
          timeout: match ? Math.round(parseFloat(match[1]) * 1000) : undefined,
          line: startLine + i,
          raw: line.trim(),
        });
      }
      if (line.includes('WebDriverWait')) {
        const match = line.match(/WebDriverWait\s*\([^,]+,\s*(\d+)\s*\)/);
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
      if (/\bassert\b/.test(line)) {
        let type: AssertionType = 'custom';
        if (/\.is_displayed\s*\(\s*\)/.test(line)) type = 'visible';
        else if (/\.is_enabled\s*\(\s*\)/.test(line)) type = 'enabled';
        else if (/\.is_selected\s*\(\s*\)/.test(line)) type = 'selected';
        else if (/==/.test(line)) type = 'text';
        else if (/\bin\b/.test(line)) type = 'text';

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
      { pattern: /\.click\s*\(/, type: 'click' },
      { pattern: /\.send_keys\s*\(/, type: 'type' },
      { pattern: /\.clear\s*\(/, type: 'clear' },
      { pattern: /\.submit\s*\(/, type: 'click' },
      { pattern: /\.get\s*\(\s*["']http/, type: 'navigate' },
      { pattern: /\.back\s*\(\s*\)/, type: 'back' },
      { pattern: /\.forward\s*\(\s*\)/, type: 'forward' },
      { pattern: /\.refresh\s*\(\s*\)/, type: 'refresh' },
      { pattern: /ActionChains\s*\(/, type: 'custom' },
      { pattern: /\.switch_to\.frame\s*\(/, type: 'switchFrame' },
      { pattern: /\.switch_to\.window\s*\(/, type: 'switchWindow' },
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
      /By\.(ID|CSS_SELECTOR|XPATH|NAME|CLASS_NAME)\s*,\s*["']([^"']+)["']/,
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

// ─── Python Source Parser (Regex-based) ──────────────────────────────────────

function parsePythonSource(content: string): PythonAST {
  const lines = content.split('\n');

  const imports = parsePythonImports(lines);
  const classes = parsePythonClasses(content, lines);
  const functions = parsePythonTopLevelFunctions(content, lines);

  return { content, lines, imports, classes, functions };
}

function parsePythonImports(lines: string[]): PythonImport[] {
  const imports: PythonImport[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // from module import member1, member2
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
    if (fromMatch) {
      const members = fromMatch[2]
        .split(',')
        .map((m) =>
          m
            .trim()
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean);
      imports.push({
        module: fromMatch[1],
        members,
        isFrom: true,
        line: i + 1,
        raw: line,
      });
      continue;
    }

    // import module / import module as alias
    const importMatch = line.match(/^import\s+([\w.]+)(?:\s+as\s+\w+)?$/);
    if (importMatch) {
      imports.push({
        module: importMatch[1],
        members: [],
        isFrom: false,
        line: i + 1,
        raw: line,
      });
    }
  }

  return imports;
}

function parsePythonClasses(content: string, lines: string[]): PythonClass[] {
  const classes: PythonClass[] = [];
  const classRegex = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/gm;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const classLine = content.substring(0, match.index).split('\n').length;
    const className = match[1];
    const bases = match[2]
      ? match[2]
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean)
      : [];

    // Determine class body by indentation
    const classIndent = getIndent(lines[classLine - 1]);
    const bodyStart = classLine; // 0-indexed: classLine is next line
    let endLine = lines.length;

    for (let i = bodyStart; i < lines.length; i++) {
      const line = lines[i];
      // Skip blank lines and comments
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      const indent = getIndent(line);
      // If indent <= class indent and it's not the class line itself, class body ended
      if (indent <= classIndent && i > bodyStart) {
        endLine = i;
        break;
      }
    }

    const bodyLines = lines.slice(bodyStart, endLine);
    const body = bodyLines.join('\n');

    // Parse methods inside the class
    const methods = parsePythonFunctions(body, bodyStart, classIndent + 4);

    classes.push({
      name: className,
      bases,
      methods,
      line: classLine,
      endLine,
      body,
    });
  }

  return classes;
}

function parsePythonTopLevelFunctions(content: string, lines: string[]): PythonFunction[] {
  return parsePythonFunctions(content, 0, 0);
}

function parsePythonFunctions(
  content: string,
  lineOffset: number,
  expectedIndent: number,
): PythonFunction[] {
  const functions: PythonFunction[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = getIndent(line);

    // Collect decorators
    const decorators: string[] = [];
    if (indent === expectedIndent && line.trim().startsWith('@')) {
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('@')) {
        decorators.push(lines[j].trim().substring(1));
        j++;
      }
      // Check if next line is a def
      if (j < lines.length) {
        const defMatch = lines[j].match(/^(\s*)def\s+(\w+)\s*\(([^)]*)\)\s*(?:->.*?)?\s*:/);
        if (defMatch && getIndent(lines[j]) === expectedIndent) {
          const fnName = defMatch[2];
          const params = defMatch[3];
          const bodyIndent = expectedIndent + 4;

          // Find function body
          let endLine = j + 1;
          for (let k = j + 1; k < lines.length; k++) {
            const bodyLine = lines[k];
            if (bodyLine.trim() === '' || bodyLine.trim().startsWith('#')) continue;
            if (getIndent(bodyLine) < bodyIndent) {
              endLine = k;
              break;
            }
            endLine = k + 1;
          }

          const bodyLines = lines.slice(j + 1, endLine);
          const body = bodyLines.join('\n');

          functions.push({
            name: fnName,
            params,
            decorators,
            body,
            line: lineOffset + j + 1,
            endLine: lineOffset + endLine,
            indent: expectedIndent,
          });

          i = endLine - 1; // skip processed lines
          continue;
        }
      }
    }

    // Match def without decorators
    const defMatch = line.match(/^(\s*)def\s+(\w+)\s*\(([^)]*)\)\s*(?:->.*?)?\s*:/);
    if (defMatch && indent === expectedIndent) {
      const fnName = defMatch[2];
      const params = defMatch[3];
      const bodyIndent = expectedIndent + 4;

      // Find function body
      let endLine = i + 1;
      for (let k = i + 1; k < lines.length; k++) {
        const bodyLine = lines[k];
        if (bodyLine.trim() === '' || bodyLine.trim().startsWith('#')) continue;
        if (getIndent(bodyLine) < bodyIndent) {
          endLine = k;
          break;
        }
        endLine = k + 1;
      }

      const bodyLines = lines.slice(i + 1, endLine);
      const body = bodyLines.join('\n');

      functions.push({
        name: fnName,
        params,
        decorators: [],
        body,
        line: lineOffset + i + 1,
        endLine: lineOffset + endLine,
        indent: expectedIndent,
      });

      i = endLine - 1;
    }
  }

  return functions;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}
