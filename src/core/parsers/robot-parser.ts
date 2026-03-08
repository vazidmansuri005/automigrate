/**
 * Robot Framework parser for .robot and .resource files.
 * Parses *** Settings ***, *** Variables ***, *** Test Cases ***, *** Keywords *** sections.
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
  WaitUsage,
  AssertionUsage,
  HookUsage,
  CapabilityUsage,
} from '../../types/index.js';
import { BaseParser } from './base-parser.js';

// ─── Robot AST Types ────────────────────────────────────────────────────────

interface RobotAST {
  settings: RobotSetting[];
  variables: RobotVariable[];
  testCases: RobotTestCase[];
  keywords: RobotKeyword[];
}

interface RobotSetting {
  type:
    | 'library'
    | 'resource'
    | 'suite-setup'
    | 'suite-teardown'
    | 'test-setup'
    | 'test-teardown'
    | 'metadata'
    | 'other';
  name: string;
  args: string[];
  line: number;
}

interface RobotVariable {
  name: string;
  value: string;
  type: 'scalar' | 'list' | 'dict';
  line: number;
}

interface RobotTestCase {
  name: string;
  steps: RobotStep[];
  tags: string[];
  documentation: string;
  setup?: RobotStep;
  teardown?: RobotStep;
  startLine: number;
  endLine: number;
}

interface RobotKeyword {
  name: string;
  args: string[];
  returnValue?: string;
  steps: RobotStep[];
  documentation: string;
  startLine: number;
  endLine: number;
}

interface RobotStep {
  keyword: string;
  args: string[];
  assignTo?: string;
  line: number;
}

// ─── Section header regex ───────────────────────────────────────────────────

const SECTION_RE = /^\*{3}\s+(Settings|Variables|Test Cases|Keywords|Tasks)\s+\*{3}/i;
const VARIABLE_RE = /^\$\{(\w+)\}\s{2,}(.+)$/;
const LIST_VARIABLE_RE = /^@\{(\w+)\}\s{2,}(.+)$/;
const DICT_VARIABLE_RE = /^&\{(\w+)\}\s{2,}(.+)$/;
const ASSIGNMENT_RE = /^\$\{(\w+)\}\s*=\s*/;

// SeleniumLibrary keyword patterns for selector extraction
const SELENIUM_SELECTOR_KEYWORDS = new Set([
  'click element',
  'input text',
  'get text',
  'get webelement',
  'get webelements',
  'element should be visible',
  'element should not be visible',
  'element should contain',
  'element text should be',
  'wait until element is visible',
  'wait until element is not visible',
  'wait until element is enabled',
  'wait until element contains',
  'select from list by value',
  'select from list by label',
  'select from list by index',
  'select checkbox',
  'unselect checkbox',
  'checkbox should be selected',
  'checkbox should not be selected',
  'get element attribute',
  'mouse over',
  'scroll element into view',
  'drag and drop',
  'capture element screenshot',
  'select frame',
  'element should be enabled',
  'element should be disabled',
]);

const SELENIUM_WAIT_KEYWORDS = new Set([
  'wait until element is visible',
  'wait until element is not visible',
  'wait until element is enabled',
  'wait until element contains',
  'wait until page contains',
  'wait until page contains element',
  'wait until page does not contain',
  'wait until page does not contain element',
]);

const SELENIUM_ASSERTION_KEYWORDS = new Set([
  'element should be visible',
  'element should not be visible',
  'element should contain',
  'element text should be',
  'title should be',
  'location should be',
  'page should contain',
  'page should not contain',
  'checkbox should be selected',
  'checkbox should not be selected',
  'element should be enabled',
  'element should be disabled',
]);

// ─── Parser ─────────────────────────────────────────────────────────────────

export class RobotParser extends BaseParser {
  language = 'robot' as const;
  supportedFrameworks: SourceFramework[] = ['robot'];

  canParse(file: SourceFile): boolean {
    return file.language === 'robot';
  }

  protected async buildAST(file: SourceFile): Promise<RobotAST> {
    const lines = file.content.split('\n');
    const ast: RobotAST = { settings: [], variables: [], testCases: [], keywords: [] };

    let currentSection: string | null = null;
    let currentBlock: {
      name: string;
      lines: Array<{ text: string; num: number }>;
      startLine: number;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for section header
      const sectionMatch = line.match(SECTION_RE);
      if (sectionMatch) {
        // Flush previous block
        if (currentBlock && currentSection) {
          this.flushBlock(ast, currentSection, currentBlock, lineNum - 1);
        }
        currentSection = sectionMatch[1].toLowerCase();
        currentBlock = null;
        continue;
      }

      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) continue;

      if (!currentSection) continue;

      if (currentSection === 'settings') {
        this.parseSetting(ast, line.trim(), lineNum);
      } else if (currentSection === 'variables') {
        this.parseVariable(ast, line.trim(), lineNum);
      } else if (
        currentSection === 'test cases' ||
        currentSection === 'tasks' ||
        currentSection === 'keywords'
      ) {
        // Non-indented lines are block names (test case or keyword names)
        if (!line.startsWith(' ') && !line.startsWith('\t')) {
          if (currentBlock) {
            this.flushBlock(ast, currentSection, currentBlock, lineNum - 1);
          }
          currentBlock = { name: line.trim(), lines: [], startLine: lineNum };
        } else if (currentBlock) {
          currentBlock.lines.push({ text: line.trim(), num: lineNum });
        }
      }
    }

    // Flush final block
    if (currentBlock && currentSection) {
      this.flushBlock(ast, currentSection, currentBlock, lines.length);
    }

    return ast;
  }

  private parseSetting(ast: RobotAST, line: string, lineNum: number): void {
    const parts = line.split(/\s{2,}|\t/);
    const directive = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (directive === 'library') {
      ast.settings.push({
        type: 'library',
        name: args[0] ?? '',
        args: args.slice(1),
        line: lineNum,
      });
    } else if (directive === 'resource') {
      ast.settings.push({ type: 'resource', name: args[0] ?? '', args: [], line: lineNum });
    } else if (directive === 'suite setup') {
      ast.settings.push({
        type: 'suite-setup',
        name: args[0] ?? '',
        args: args.slice(1),
        line: lineNum,
      });
    } else if (directive === 'suite teardown') {
      ast.settings.push({
        type: 'suite-teardown',
        name: args[0] ?? '',
        args: args.slice(1),
        line: lineNum,
      });
    } else if (directive === 'test setup') {
      ast.settings.push({
        type: 'test-setup',
        name: args[0] ?? '',
        args: args.slice(1),
        line: lineNum,
      });
    } else if (directive === 'test teardown') {
      ast.settings.push({
        type: 'test-teardown',
        name: args[0] ?? '',
        args: args.slice(1),
        line: lineNum,
      });
    } else {
      ast.settings.push({ type: 'other', name: line, args: [], line: lineNum });
    }
  }

  private parseVariable(ast: RobotAST, line: string, lineNum: number): void {
    let match = line.match(VARIABLE_RE);
    if (match) {
      ast.variables.push({ name: match[1], value: match[2].trim(), type: 'scalar', line: lineNum });
      return;
    }
    match = line.match(LIST_VARIABLE_RE);
    if (match) {
      ast.variables.push({ name: match[1], value: match[2].trim(), type: 'list', line: lineNum });
      return;
    }
    match = line.match(DICT_VARIABLE_RE);
    if (match) {
      ast.variables.push({ name: match[1], value: match[2].trim(), type: 'dict', line: lineNum });
    }
  }

  private flushBlock(
    ast: RobotAST,
    section: string,
    block: { name: string; lines: Array<{ text: string; num: number }>; startLine: number },
    endLine: number,
  ): void {
    const steps: RobotStep[] = [];
    let tags: string[] = [];
    let documentation = '';
    let setup: RobotStep | undefined;
    let teardown: RobotStep | undefined;
    const args: string[] = [];
    let returnValue: string | undefined;

    for (const { text, num } of block.lines) {
      // Test case / keyword metadata
      if (text.startsWith('[')) {
        const metaMatch = text.match(/^\[(\w+)\]\s*(.*)/);
        if (metaMatch) {
          const key = metaMatch[1].toLowerCase();
          const val = metaMatch[2].trim();
          if (key === 'tags') {
            tags = val.split(/\s{2,}|\t/).filter(Boolean);
          } else if (key === 'documentation') {
            documentation = val;
          } else if (key === 'setup') {
            const setupParts = val.split(/\s{2,}|\t/);
            setup = { keyword: setupParts[0], args: setupParts.slice(1), line: num };
          } else if (key === 'teardown') {
            const tdParts = val.split(/\s{2,}|\t/);
            teardown = { keyword: tdParts[0], args: tdParts.slice(1), line: num };
          } else if (key === 'arguments') {
            args.push(...val.split(/\s{2,}|\t/).filter(Boolean));
          } else if (key === 'return') {
            returnValue = val;
          }
          continue;
        }
      }

      // Regular step
      const step = this.parseStep(text, num);
      if (step) steps.push(step);
    }

    if (section === 'test cases' || section === 'tasks') {
      ast.testCases.push({
        name: block.name,
        steps,
        tags,
        documentation,
        setup,
        teardown,
        startLine: block.startLine,
        endLine,
      });
    } else if (section === 'keywords') {
      ast.keywords.push({
        name: block.name,
        args,
        returnValue,
        steps,
        documentation,
        startLine: block.startLine,
        endLine,
      });
    }
  }

  private parseStep(text: string, lineNum: number): RobotStep | null {
    // Check for variable assignment: ${var}=    Keyword    args...
    const assignMatch = text.match(ASSIGNMENT_RE);
    let assignTo: string | undefined;
    let rest = text;

    if (assignMatch) {
      assignTo = assignMatch[1];
      rest = text.slice(assignMatch[0].length).trim();
    }

    const parts = rest.split(/\s{2,}|\t/).filter(Boolean);
    if (parts.length === 0) return null;

    return {
      keyword: parts[0],
      args: parts.slice(1),
      assignTo,
      line: lineNum,
    };
  }

  // ─── Extract methods ────────────────────────────────────────────────────

  protected extractImports(ast: unknown, _file: SourceFile): ImportStatement[] {
    const robot = ast as RobotAST;
    return robot.settings
      .filter((s) => s.type === 'library' || s.type === 'resource')
      .map((s) => ({
        module: s.name,
        members: [],
        isDefault: false,
        isNamespace: false,
        alias: undefined,
        line: s.line,
        raw: `${s.type === 'library' ? 'Library' : 'Resource'}    ${s.name}`,
      }));
  }

  protected extractClasses(_ast: unknown, _file: SourceFile): ClassDefinition[] {
    // Robot Framework doesn't have classes
    return [];
  }

  protected extractFunctions(ast: unknown, _file: SourceFile): FunctionDefinition[] {
    const robot = ast as RobotAST;
    return robot.keywords.map((kw) => ({
      name: kw.name,
      params: kw.args.map((a) => {
        const clean = a.replace(/^\$\{/, '').replace(/\}$/, '');
        return { name: clean, type: undefined, defaultValue: undefined };
      }),
      parameters: kw.args.map((a) => {
        const clean = a.replace(/^\$\{/, '').replace(/\}$/, '');
        return { name: clean, type: undefined, defaultValue: undefined };
      }),
      returnType: kw.returnValue ? 'string' : undefined,
      body: kw.steps.map((s) => `${s.keyword}    ${s.args.join('    ')}`).join('\n'),
      line: kw.startLine,
      startLine: kw.startLine,
      endLine: kw.endLine,
      annotations: [],
      isAsync: false,
      isStatic: false,
      isTest: false,
    }));
  }

  protected extractTestCases(ast: unknown, _file: SourceFile): TestCase[] {
    const robot = ast as RobotAST;
    return robot.testCases.map((tc) => ({
      name: tc.name,
      body: tc.steps.map((s) => `${s.keyword}    ${s.args.join('    ')}`).join('\n'),
      selectors: [],
      actions: [],
      assertions: [],
      waits: [],
      hooks: [],
      line: tc.startLine,
      endLine: tc.endLine,
    }));
  }

  protected extractPageObjects(
    _ast: unknown,
    _file: SourceFile,
    _classes: ClassDefinition[],
  ): PageObjectDefinition[] {
    return [];
  }

  protected extractSelectors(ast: unknown, _file: SourceFile): SelectorUsage[] {
    const robot = ast as RobotAST;
    const selectors: SelectorUsage[] = [];

    const allSteps = [
      ...robot.testCases.flatMap((tc) => tc.steps),
      ...robot.keywords.flatMap((kw) => kw.steps),
    ];

    for (const step of allSteps) {
      const kwLower = step.keyword.toLowerCase();
      if (SELENIUM_SELECTOR_KEYWORDS.has(kwLower) && step.args.length > 0) {
        const rawSelector = step.args[0];
        const { type, value, strategy } = this.parseRobotSelector(rawSelector);
        selectors.push({
          type,
          value,
          strategy,
          raw: rawSelector,
          line: step.line,
          confidence: 0.9,
        });
      }
    }

    return selectors;
  }

  private parseRobotSelector(raw: string): {
    type: SelectorType;
    value: string;
    strategy:
      | 'By.id'
      | 'By.css'
      | 'By.xpath'
      | 'By.name'
      | 'By.linkText'
      | 'By.className'
      | 'By.tagName'
      | 'custom';
  } {
    // Robot Framework selector prefixes: id:, css:, xpath:, name:, link:, class:, tag:
    if (raw.startsWith('id:')) return { type: 'id', value: raw.slice(3), strategy: 'By.id' };
    if (raw.startsWith('css:')) return { type: 'css', value: raw.slice(4), strategy: 'By.css' };
    if (raw.startsWith('xpath:') || raw.startsWith('//'))
      return {
        type: 'xpath',
        value: raw.startsWith('xpath:') ? raw.slice(6) : raw,
        strategy: 'By.xpath',
      };
    if (raw.startsWith('name:')) return { type: 'name', value: raw.slice(5), strategy: 'By.name' };
    if (raw.startsWith('link:'))
      return { type: 'linkText', value: raw.slice(5), strategy: 'By.linkText' };
    if (raw.startsWith('class:'))
      return { type: 'className', value: raw.slice(6), strategy: 'By.className' };
    if (raw.startsWith('tag:'))
      return { type: 'tagName', value: raw.slice(4), strategy: 'By.tagName' };
    // Default: treat as id or css depending on content
    if (raw.includes('.') || raw.includes('#') || raw.includes('['))
      return { type: 'css', value: raw, strategy: 'By.css' };
    return { type: 'id', value: raw, strategy: 'By.id' };
  }

  protected extractWaits(ast: unknown, _file: SourceFile): WaitUsage[] {
    const robot = ast as RobotAST;
    const waits: WaitUsage[] = [];

    const allSteps = [
      ...robot.testCases.flatMap((tc) => tc.steps),
      ...robot.keywords.flatMap((kw) => kw.steps),
    ];

    for (const step of allSteps) {
      if (SELENIUM_WAIT_KEYWORDS.has(step.keyword.toLowerCase())) {
        waits.push({
          type: 'explicit',
          condition: step.keyword,
          timeout: this.extractTimeoutMs(step.args),
          raw: `${step.keyword}    ${step.args.join('    ')}`,
          line: step.line,
        });
      }
    }

    return waits;
  }

  private extractTimeoutMs(args: string[]): number | undefined {
    for (const arg of args) {
      if (arg.toLowerCase().startsWith('timeout=')) {
        const val = arg.slice(8);
        // Convert Robot timeout string (e.g., "10s", "5000") to ms
        if (val.endsWith('s')) return parseInt(val) * 1000;
        if (val.endsWith('ms')) return parseInt(val);
        return parseInt(val);
      }
    }
    return undefined;
  }

  protected extractAssertions(ast: unknown, _file: SourceFile): AssertionUsage[] {
    const robot = ast as RobotAST;
    const assertions: AssertionUsage[] = [];

    const allSteps = [
      ...robot.testCases.flatMap((tc) => tc.steps),
      ...robot.keywords.flatMap((kw) => kw.steps),
    ];

    for (const step of allSteps) {
      if (SELENIUM_ASSERTION_KEYWORDS.has(step.keyword.toLowerCase())) {
        assertions.push({
          type: 'custom',
          raw: `${step.keyword}    ${step.args.join('    ')}`,
          line: step.line,
        });
      }
    }

    return assertions;
  }

  protected extractHooks(ast: unknown, _file: SourceFile): HookUsage[] {
    const robot = ast as RobotAST;
    const hooks: HookUsage[] = [];

    for (const s of robot.settings) {
      if (s.type === 'suite-setup') {
        hooks.push({
          type: 'beforeAll' as any,
          name: s.name,
          body: s.args.join(' '),
          line: s.line,
        });
      } else if (s.type === 'suite-teardown') {
        hooks.push({ type: 'afterAll' as any, name: s.name, body: s.args.join(' '), line: s.line });
      } else if (s.type === 'test-setup') {
        hooks.push({
          type: 'beforeEach' as any,
          name: s.name,
          body: s.args.join(' '),
          line: s.line,
        });
      } else if (s.type === 'test-teardown') {
        hooks.push({
          type: 'afterEach' as any,
          name: s.name,
          body: s.args.join(' '),
          line: s.line,
        });
      }
    }

    return hooks;
  }

  protected extractCapabilities(_ast: unknown, _file: SourceFile): CapabilityUsage[] {
    return [];
  }
}
