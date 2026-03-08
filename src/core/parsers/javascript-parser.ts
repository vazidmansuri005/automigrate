/**
 * JavaScript/TypeScript parser using Babel AST.
 * Handles Selenium JS, Cypress, Puppeteer source files.
 */

import * as babelParser from '@babel/parser';
// @ts-expect-error — babel traverse has ESM/CJS interop issues with @types
import _traverse from '@babel/traverse';
// Handle ESM/CJS interop — @babel/traverse default export may be nested
const traverse: any = typeof _traverse === 'function' ? _traverse : (_traverse as any).default;
import * as t from '@babel/types';
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
  WaitType,
  AssertionUsage,
  AssertionType,
  HookUsage,
  HookType,
  CapabilityUsage,
  ActionUsage,
  ActionType,
  PropertyDefinition,
  AnnotationUsage,
  ParameterDefinition,
} from '../../types/index.js';
import { BaseParser } from './base-parser.js';

// ─── Selenium JS Patterns ──────────────────────────────────────────────────

const SELENIUM_JS_IMPORTS = [
  'selenium-webdriver',
  'selenium-webdriver/chrome',
  'selenium-webdriver/firefox',
  'selenium-webdriver/edge',
];

const SELENIUM_JS_SELECTOR_MAP: Record<string, SelectorType> = {
  'By.id': 'id',
  'By.css': 'css',
  'By.xpath': 'xpath',
  'By.name': 'name',
  'By.className': 'className',
  'By.tagName': 'tagName',
  'By.linkText': 'linkText',
  'By.partialLinkText': 'partialLinkText',
};

// ─── Cypress Patterns ──────────────────────────────────────────────────────

const CYPRESS_SELECTOR_METHODS = [
  'get',
  'find',
  'contains',
  'first',
  'last',
  'eq',
  'filter',
  'not',
  'children',
  'parent',
  'closest',
  'siblings',
];

const _CYPRESS_ACTION_METHODS: Record<string, ActionType> = {
  click: 'click',
  dblclick: 'doubleClick',
  rightclick: 'rightClick',
  type: 'type',
  clear: 'clear',
  select: 'select',
  check: 'click',
  uncheck: 'click',
  trigger: 'custom',
  scrollIntoView: 'scroll',
  scrollTo: 'scroll',
};

const CYPRESS_ASSERTION_MAP: Record<string, AssertionType> = {
  'be.visible': 'visible',
  'not.be.visible': 'hidden',
  'have.text': 'text',
  'contain.text': 'text',
  'have.value': 'value',
  'have.attr': 'attribute',
  'have.length': 'count',
  exist: 'exists',
  'not.exist': 'exists',
  'be.enabled': 'enabled',
  'be.disabled': 'disabled',
  'be.checked': 'checked',
  'be.selected': 'selected',
  'include.text': 'text',
};

// ─── Puppeteer Patterns ────────────────────────────────────────────────────

const PUPPETEER_IMPORTS = ['puppeteer', 'puppeteer-core'];

const PUPPETEER_SELECTOR_METHODS: Record<string, SelectorStrategy> = {
  $: 'page.$',
  $$: 'page.$$',
  waitForSelector: 'page.waitForSelector',
  $eval: 'page.$',
  $$eval: 'page.$$',
};

// ─── Parser Implementation ─────────────────────────────────────────────────

export class JavaScriptParser extends BaseParser {
  language = 'javascript' as const;
  supportedFrameworks: SourceFramework[] = ['selenium', 'cypress', 'puppeteer'];

  canParse(file: SourceFile): boolean {
    return file.language === 'javascript' || file.language === 'typescript';
  }

  protected async buildAST(file: SourceFile): Promise<t.File> {
    const isTS = file.path.endsWith('.ts') || file.path.endsWith('.tsx');
    return babelParser.parse(file.content, {
      sourceType: 'module',
      plugins: [
        isTS ? 'typescript' : 'flow',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'topLevelAwait',
      ],
    });
  }

  protected extractImports(ast: t.File, _file: SourceFile): ImportStatement[] {
    const imports: ImportStatement[] = [];

    traverse(ast, {
      ImportDeclaration(path: any) {
        const members: string[] = [];
        let isDefault = false;

        for (const specifier of path.node.specifiers) {
          if (t.isImportDefaultSpecifier(specifier)) {
            members.push(specifier.local.name);
            isDefault = true;
          } else if (t.isImportSpecifier(specifier)) {
            members.push(
              t.isIdentifier(specifier.imported)
                ? specifier.imported.name
                : specifier.imported.value,
            );
          } else if (t.isImportNamespaceSpecifier(specifier)) {
            members.push(`* as ${specifier.local.name}`);
          }
        }

        imports.push({
          module: path.node.source.value,
          members,
          isDefault,
          line: path.node.loc?.start.line ?? 0,
          raw: _file.content.split('\n')[(path.node.loc?.start.line ?? 1) - 1]?.trim() ?? '',
        });
      },

      // Handle require() calls
      VariableDeclarator(path: any) {
        if (
          t.isCallExpression(path.node.init) &&
          t.isIdentifier(path.node.init.callee, { name: 'require' }) &&
          path.node.init.arguments.length > 0 &&
          t.isStringLiteral(path.node.init.arguments[0])
        ) {
          const module = path.node.init.arguments[0].value;
          const members: string[] = [];

          if (t.isIdentifier(path.node.id)) {
            members.push(path.node.id.name);
          } else if (t.isObjectPattern(path.node.id)) {
            for (const prop of path.node.id.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                members.push(prop.key.name);
              }
            }
          }

          imports.push({
            module,
            members,
            isDefault: t.isIdentifier(path.node.id),
            line: path.node.loc?.start.line ?? 0,
            raw: _file.content.split('\n')[(path.node.loc?.start.line ?? 1) - 1]?.trim() ?? '',
          });
        }
      },
    });

    return imports;
  }

  protected extractClasses(ast: t.File, file: SourceFile): ClassDefinition[] {
    const classes: ClassDefinition[] = [];

    traverse(ast, {
      ClassDeclaration(path: any) {
        const classDef = extractClassDef(path.node, file);
        if (classDef) classes.push(classDef);
      },
    });

    return classes;
  }

  protected extractFunctions(ast: t.File, file: SourceFile): FunctionDefinition[] {
    const functions: FunctionDefinition[] = [];

    traverse(ast, {
      FunctionDeclaration(path: any) {
        if (path.node.id) {
          functions.push(extractFunctionDef(path.node, file));
        }
      },
      ArrowFunctionExpression(path: any) {
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          functions.push(extractArrowFunctionDef(parent.id.name, path.node, file));
        }
      },
    });

    return functions;
  }

  protected extractTestCases(ast: t.File, file: SourceFile): TestCase[] {
    const tests: TestCase[] = [];
    const framework = this.detectFramework(file);

    traverse(ast, {
      CallExpression(path: any) {
        const testInfo = getTestCallInfo(path.node);
        if (!testInfo) return;

        const bodyNode = getTestBodyNode(path.node);
        if (!bodyNode) return;

        const lines = file.content.split('\n');
        const startLine = path.node.loc?.start.line ?? 0;
        const endLine = path.node.loc?.end.line ?? 0;
        const bodyText = lines.slice(startLine - 1, endLine).join('\n');

        tests.push({
          name: testInfo.name,
          description: testInfo.description,
          body: bodyText,
          selectors: extractSelectorsFromBody(bodyNode, file, framework),
          actions: extractActionsFromBody(bodyNode, file, framework),
          assertions: extractAssertionsFromBody(bodyNode, file, framework),
          waits: extractWaitsFromBody(bodyNode, file, framework),
          hooks: [],
          line: startLine,
          endLine,
        });
      },
    });

    return tests;
  }

  protected extractPageObjects(
    _ast: t.File,
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
              p.type?.includes('By') ||
              p.type?.includes('Locator') ||
              p.value?.includes('By.') ||
              p.value?.includes('[data-'),
          )
          .map((p) => ({
            name: p.name,
            selector: {
              type: 'css' as SelectorType,
              value: p.value ?? '',
              strategy: 'By.css' as SelectorStrategy,
              line: p.line,
              raw: p.value ?? '',
              confidence: 0.8,
            },
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

  protected extractSelectors(ast: t.File, file: SourceFile): SelectorUsage[] {
    const selectors: SelectorUsage[] = [];
    const framework = this.detectFramework(file);

    traverse(ast, {
      CallExpression(path: any) {
        const sel = extractSelectorFromCall(path.node, file, framework);
        if (sel) selectors.push(sel);
      },
    });

    return selectors;
  }

  protected extractWaits(ast: t.File, file: SourceFile): WaitUsage[] {
    const waits: WaitUsage[] = [];
    const framework = this.detectFramework(file);

    traverse(ast, {
      CallExpression(path: any) {
        const wait = extractWaitFromCall(path.node, file, framework);
        if (wait) waits.push(wait);
      },
    });

    return waits;
  }

  protected extractAssertions(ast: t.File, file: SourceFile): AssertionUsage[] {
    const assertions: AssertionUsage[] = [];
    const framework = this.detectFramework(file);

    traverse(ast, {
      CallExpression(path: any) {
        const assertion = extractAssertionFromCall(path.node, file, framework);
        if (assertion) assertions.push(assertion);
      },
    });

    return assertions;
  }

  protected extractHooks(ast: t.File, file: SourceFile): HookUsage[] {
    const hooks: HookUsage[] = [];
    const hookNames: Record<string, HookType> = {
      beforeAll: 'beforeAll',
      afterAll: 'afterAll',
      beforeEach: 'beforeEach',
      afterEach: 'afterEach',
      before: 'beforeAll',
      after: 'afterAll',
    };

    traverse(ast, {
      CallExpression(path: any) {
        if (t.isIdentifier(path.node.callee) && hookNames[path.node.callee.name]) {
          const lines = file.content.split('\n');
          const startLine = path.node.loc?.start.line ?? 0;
          const endLine = path.node.loc?.end.line ?? 0;

          hooks.push({
            type: hookNames[path.node.callee.name],
            body: lines.slice(startLine - 1, endLine).join('\n'),
            line: startLine,
          });
        }
      },
    });

    return hooks;
  }

  protected extractCapabilities(ast: t.File, _file: SourceFile): CapabilityUsage[] {
    const capabilities: CapabilityUsage[] = [];

    traverse(ast, {
      ObjectProperty(path: any) {
        if (t.isIdentifier(path.node.key) && isCapabilityProperty(path.node.key.name)) {
          capabilities.push({
            key: path.node.key.name,
            value: extractLiteralValue(path.node.value),
            line: path.node.loc?.start.line ?? 0,
          });
        }
      },
    });

    return capabilities;
  }

  private detectFramework(file: SourceFile): SourceFramework {
    if (file.framework) return file.framework;

    const content = file.content;

    if (content.includes('cy.') || content.includes('Cypress.')) {
      return 'cypress';
    }
    if (
      PUPPETEER_IMPORTS.some(
        (imp) =>
          content.includes(`require('${imp}')`) ||
          content.includes(`from '${imp}'`) ||
          content.includes(`from "${imp}"`),
      )
    ) {
      return 'puppeteer';
    }
    if (
      SELENIUM_JS_IMPORTS.some(
        (imp) =>
          content.includes(`require('${imp}')`) ||
          content.includes(`from '${imp}'`) ||
          content.includes(`from "${imp}"`),
      )
    ) {
      return 'selenium';
    }

    return 'selenium';
  }
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function extractClassDef(node: t.ClassDeclaration, file: SourceFile): ClassDefinition | null {
  if (!node.id) return null;

  const methods: FunctionDefinition[] = [];
  const properties: PropertyDefinition[] = [];
  const annotations: AnnotationUsage[] = [];

  if (node.decorators) {
    for (const dec of node.decorators) {
      if (t.isIdentifier(dec.expression)) {
        annotations.push({
          name: dec.expression.name,
          line: dec.loc?.start.line ?? 0,
        });
      }
    }
  }

  for (const member of node.body.body) {
    if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
      methods.push({
        name: member.key.name,
        params: member.params.map((p) => ({
          name: t.isIdentifier(p)
            ? p.name
            : t.isAssignmentPattern(p) && t.isIdentifier(p.left)
              ? p.left.name
              : 'unknown',
          type: undefined,
          defaultValue: undefined,
        })),
        returnType: undefined,
        body: file.content
          .split('\n')
          .slice((member.loc?.start.line ?? 1) - 1, member.loc?.end.line)
          .join('\n'),
        annotations: [],
        isAsync: member.async,
        isTest: member.key.name.startsWith('test') || member.key.name.startsWith('should'),
        line: member.loc?.start.line ?? 0,
      });
    } else if (t.isClassProperty(member) && t.isIdentifier(member.key)) {
      properties.push({
        name: member.key.name,
        type: undefined,
        value: member.value
          ? file.content.split('\n')[(member.loc?.start.line ?? 1) - 1]?.trim()
          : undefined,
        isStatic: member.static,
        visibility: 'public',
        line: member.loc?.start.line ?? 0,
      });
    }
  }

  const superClass = node.superClass
    ? t.isIdentifier(node.superClass)
      ? node.superClass.name
      : undefined
    : undefined;

  const isPageObject =
    node.id.name.includes('Page') ||
    node.id.name.includes('Component') ||
    superClass?.includes('Page') ||
    false;

  const isTestClass =
    node.id.name.includes('Test') ||
    node.id.name.includes('Spec') ||
    superClass?.includes('Test') ||
    methods.some((m) => m.isTest);

  return {
    name: node.id.name,
    extends: superClass,
    implements: [],
    methods,
    properties,
    annotations,
    line: node.loc?.start.line ?? 0,
    isPageObject,
    isTestClass,
  };
}

function extractFunctionDef(node: t.FunctionDeclaration, file: SourceFile): FunctionDefinition {
  return {
    name: node.id?.name ?? 'anonymous',
    params: node.params.map(extractParam),
    returnType: undefined,
    body: file.content
      .split('\n')
      .slice((node.loc?.start.line ?? 1) - 1, node.loc?.end.line)
      .join('\n'),
    annotations: [],
    isAsync: node.async,
    isTest: node.id?.name.startsWith('test') || node.id?.name.startsWith('should') || false,
    line: node.loc?.start.line ?? 0,
  };
}

function extractArrowFunctionDef(
  name: string,
  node: t.ArrowFunctionExpression,
  file: SourceFile,
): FunctionDefinition {
  return {
    name,
    params: node.params.map(extractParam),
    returnType: undefined,
    body: file.content
      .split('\n')
      .slice((node.loc?.start.line ?? 1) - 1, node.loc?.end.line)
      .join('\n'),
    annotations: [],
    isAsync: node.async,
    isTest: name.startsWith('test') || name.startsWith('should'),
    line: node.loc?.start.line ?? 0,
  };
}

function extractParam(param: t.Node): ParameterDefinition {
  if (t.isIdentifier(param)) {
    return { name: param.name };
  }
  if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
    return {
      name: param.left.name,
      defaultValue: t.isStringLiteral(param.right) ? param.right.value : undefined,
    };
  }
  if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
    return { name: `...${param.argument.name}` };
  }
  return { name: 'unknown' };
}

interface TestCallInfo {
  name: string;
  description?: string;
}

function getTestCallInfo(node: t.CallExpression): TestCallInfo | null {
  const testFunctions = ['it', 'test', 'specify', 'describe', 'context'];

  // it('name', fn) or test('name', fn)
  if (
    t.isIdentifier(node.callee) &&
    testFunctions.includes(node.callee.name) &&
    node.arguments.length >= 2 &&
    t.isStringLiteral(node.arguments[0])
  ) {
    return { name: node.arguments[0].value };
  }

  // it.only('name', fn) or test.skip('name', fn)
  if (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object) &&
    testFunctions.includes(node.callee.object.name) &&
    node.arguments.length >= 2 &&
    t.isStringLiteral(node.arguments[0])
  ) {
    return { name: node.arguments[0].value };
  }

  return null;
}

function getTestBodyNode(node: t.CallExpression): t.Node | null {
  const bodyArg = node.arguments[1] || node.arguments[0];
  if (t.isArrowFunctionExpression(bodyArg) || t.isFunctionExpression(bodyArg)) {
    return bodyArg.body;
  }
  return null;
}

function extractSelectorsFromBody(
  _body: t.Node,
  _file: SourceFile,
  _framework: SourceFramework,
): SelectorUsage[] {
  // Will be populated by traversal — extractSelectors handles the full AST
  return [];
}

function extractActionsFromBody(
  _body: t.Node,
  _file: SourceFile,
  _framework: SourceFramework,
): ActionUsage[] {
  return [];
}

function extractAssertionsFromBody(
  _body: t.Node,
  _file: SourceFile,
  _framework: SourceFramework,
): AssertionUsage[] {
  return [];
}

function extractWaitsFromBody(
  _body: t.Node,
  _file: SourceFile,
  _framework: SourceFramework,
): WaitUsage[] {
  return [];
}

function extractSelectorFromCall(
  node: t.CallExpression,
  file: SourceFile,
  framework: SourceFramework,
): SelectorUsage | null {
  const line = node.loc?.start.line ?? 0;
  const lines = file.content.split('\n');
  const raw = lines[line - 1]?.trim() ?? '';

  if (framework === 'cypress') {
    // cy.get('.selector'), cy.contains('text'), cy.find('#id')
    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object, { name: 'cy' }) &&
      t.isIdentifier(node.callee.property)
    ) {
      const method = node.callee.property.name;
      if (
        CYPRESS_SELECTOR_METHODS.includes(method) &&
        node.arguments.length > 0 &&
        t.isStringLiteral(node.arguments[0])
      ) {
        const value = node.arguments[0].value;
        return {
          type: inferSelectorType(value),
          value,
          strategy: `cy.${method}` as SelectorStrategy,
          line,
          raw,
          confidence: 0.9,
        };
      }
    }
  }

  if (framework === 'puppeteer') {
    // page.$('.selector'), page.waitForSelector('#id')
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const method = node.callee.property.name;
      if (
        PUPPETEER_SELECTOR_METHODS[method] &&
        node.arguments.length > 0 &&
        t.isStringLiteral(node.arguments[0])
      ) {
        const value = node.arguments[0].value;
        return {
          type: inferSelectorType(value),
          value,
          strategy: PUPPETEER_SELECTOR_METHODS[method],
          line,
          raw,
          confidence: 0.9,
        };
      }
    }
  }

  if (framework === 'selenium') {
    // By.id('myId'), By.css('.class'), By.xpath('//div')
    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object, { name: 'By' }) &&
      t.isIdentifier(node.callee.property) &&
      node.arguments.length > 0 &&
      t.isStringLiteral(node.arguments[0])
    ) {
      const byMethod = `By.${node.callee.property.name}`;
      const selectorType = SELENIUM_JS_SELECTOR_MAP[byMethod] ?? 'custom';
      return {
        type: selectorType,
        value: node.arguments[0].value,
        strategy: byMethod as SelectorStrategy,
        line,
        raw,
        confidence: 0.95,
      };
    }
  }

  return null;
}

function extractWaitFromCall(
  node: t.CallExpression,
  file: SourceFile,
  framework: SourceFramework,
): WaitUsage | null {
  const line = node.loc?.start.line ?? 0;
  const lines = file.content.split('\n');
  const raw = lines[line - 1]?.trim() ?? '';

  // Generic sleep/setTimeout detection
  if (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, { name: 'sleep' })
  ) {
    return {
      type: 'sleep' as WaitType,
      timeout: t.isNumericLiteral(node.arguments[0]) ? node.arguments[0].value : undefined,
      line,
      raw,
    };
  }

  if (framework === 'selenium') {
    // driver.wait(until.elementLocated(...), timeout)
    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: 'wait' })
    ) {
      return {
        type: 'explicit' as WaitType,
        timeout: t.isNumericLiteral(node.arguments[1]) ? node.arguments[1].value : undefined,
        line,
        raw,
      };
    }
  }

  if (framework === 'cypress') {
    // cy.wait(1000) or cy.wait('@alias')
    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object, { name: 'cy' }) &&
      t.isIdentifier(node.callee.property, { name: 'wait' })
    ) {
      return {
        type: t.isNumericLiteral(node.arguments[0]) ? 'sleep' : ('networkIdle' as WaitType),
        timeout: t.isNumericLiteral(node.arguments[0]) ? node.arguments[0].value : undefined,
        condition: t.isStringLiteral(node.arguments[0]) ? node.arguments[0].value : undefined,
        line,
        raw,
      };
    }
  }

  if (framework === 'puppeteer') {
    // page.waitForSelector, page.waitForNavigation, page.waitForTimeout
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const method = node.callee.property.name;
      if (method === 'waitForSelector') {
        return { type: 'element', line, raw };
      }
      if (method === 'waitForNavigation') {
        return { type: 'pageLoad', line, raw };
      }
      if (method === 'waitForTimeout') {
        return {
          type: 'sleep',
          timeout: t.isNumericLiteral(node.arguments[0]) ? node.arguments[0].value : undefined,
          line,
          raw,
        };
      }
      if (method === 'waitForNetworkIdle') {
        return { type: 'networkIdle', line, raw };
      }
    }
  }

  return null;
}

function extractAssertionFromCall(
  node: t.CallExpression,
  file: SourceFile,
  framework: SourceFramework,
): AssertionUsage | null {
  const line = node.loc?.start.line ?? 0;
  const lines = file.content.split('\n');
  const raw = lines[line - 1]?.trim() ?? '';

  if (framework === 'cypress') {
    // .should('be.visible'), .should('have.text', 'expected')
    if (
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: 'should' }) &&
      node.arguments.length > 0 &&
      t.isStringLiteral(node.arguments[0])
    ) {
      const assertion = node.arguments[0].value;
      const assertionType = CYPRESS_ASSERTION_MAP[assertion] ?? ('custom' as AssertionType);
      return {
        type: assertionType,
        expected: t.isStringLiteral(node.arguments[1]) ? node.arguments[1].value : undefined,
        line,
        raw,
      };
    }
  }

  // expect(...).toBe(...), assert.equal(...)
  if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
    const method = node.callee.property.name;
    const assertionMethods: Record<string, AssertionType> = {
      toBe: 'text',
      toEqual: 'text',
      toContain: 'text',
      toBeVisible: 'visible',
      toBeHidden: 'hidden',
      toBeEnabled: 'enabled',
      toBeDisabled: 'disabled',
      toHaveText: 'text',
      toHaveValue: 'value',
      toHaveAttribute: 'attribute',
      toHaveCount: 'count',
      toHaveURL: 'url',
      toHaveTitle: 'title',
    };

    if (assertionMethods[method]) {
      return {
        type: assertionMethods[method],
        expected: t.isStringLiteral(node.arguments[0]) ? node.arguments[0].value : undefined,
        line,
        raw,
      };
    }
  }

  return null;
}

function inferSelectorType(value: string): SelectorType {
  if (value.startsWith('#')) return 'id';
  if (value.startsWith('.')) return 'css';
  if (value.startsWith('//') || value.startsWith('(//')) return 'xpath';
  if (value.startsWith('[data-testid') || value.startsWith('[data-test')) return 'dataTestId';
  if (value.includes('[') || value.includes('>') || value.includes(':')) return 'css';
  if (/^[a-z]+$/i.test(value)) return 'tagName';
  return 'css';
}

function isCapabilityProperty(name: string): boolean {
  const capabilityKeys = [
    'browserName',
    'platformName',
    'browserVersion',
    'headless',
    'deviceName',
    'app',
    'automationName',
    'acceptInsecureCerts',
    'timeouts',
  ];
  return capabilityKeys.includes(name);
}

function extractLiteralValue(node: t.Node): unknown {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isBooleanLiteral(node)) return node.value;
  if (t.isNullLiteral(node)) return null;
  return undefined;
}
