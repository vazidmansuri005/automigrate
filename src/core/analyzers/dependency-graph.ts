/**
 * Cross-file dependency graph builder.
 * Scans all source files to build:
 * - Class hierarchy (extends/implements chains)
 * - Method call resolution (traces helper.click(locator) → actual Selenium API)
 * - Import/dependency mapping
 *
 * This enables accurate migration of complex repos with:
 * - Helper class inheritance (e.g., WebMethods extends WebMethodsHelper extends SeleniumWebDriverHelper)
 * - Dynamic locator resolution (e.g., String[] locator = {"id", "username"})
 * - Shared utility methods
 */

import fg from 'fast-glob';
import { readFile } from 'node:fs/promises';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('dependency-graph');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClassNode {
  name: string;
  filePath: string;
  extends?: string;
  implements: string[];
  methods: MethodNode[];
  fields: FieldNode[];
  imports: string[];
  line: number;
}

export interface MethodNode {
  name: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
  body: string;
  line: number;
  containsSeleniumCalls: boolean;
  calledMethods: string[];
}

export interface FieldNode {
  name: string;
  type: string;
  initialValue?: string;
  isStatic: boolean;
  line: number;
}

export interface DependencyGraph {
  classes: Map<string, ClassNode>;
  inheritanceChains: Map<string, string[]>;
  methodIndex: Map<string, MethodNode>;
  fileToClasses: Map<string, string[]>;
}

export interface ResolvedMethod {
  className: string;
  method: MethodNode;
  inheritancePath: string[];
}

// ─── Graph Builder ──────────────────────────────────────────────────────────

export class DependencyGraphBuilder {
  private graph: DependencyGraph = {
    classes: new Map(),
    inheritanceChains: new Map(),
    methodIndex: new Map(),
    fileToClasses: new Map(),
  };

  /**
   * Scan all Java/C#/Python files in a directory and build the dependency graph.
   */
  async buildFromDirectory(
    sourceDir: string,
    includePatterns: string[] = ['**/*.java'],
    excludePatterns: string[] = ['**/node_modules/**', '**/target/**'],
  ): Promise<DependencyGraph> {
    const files = await fg(includePatterns, {
      cwd: sourceDir,
      ignore: excludePatterns,
      absolute: false,
    });

    log.info(`Scanning ${files.length} files for dependency graph...`);

    for (const relPath of files) {
      const absPath = `${sourceDir}/${relPath}`;
      try {
        const content = await readFile(absPath, 'utf-8');
        this.parseFile(relPath, content);
      } catch {
        log.warn(`Could not read: ${relPath}`);
      }
    }

    this.buildInheritanceChains();
    this.buildMethodIndex();

    log.info(
      `Dependency graph: ${this.graph.classes.size} classes, ` +
        `${this.graph.inheritanceChains.size} inheritance chains, ` +
        `${this.graph.methodIndex.size} indexed methods`,
    );

    return this.graph;
  }

  /**
   * Build graph from already-loaded file contents (for in-memory use).
   */
  buildFromFiles(files: Array<{ path: string; content: string }>): DependencyGraph {
    for (const file of files) {
      this.parseFile(file.path, file.content);
    }
    this.buildInheritanceChains();
    this.buildMethodIndex();
    return this.graph;
  }

  /**
   * Resolve a method call by walking up the inheritance chain.
   * e.g., resolveMethod("WebMethods", "click") might find it in SeleniumWebDriverHelper.
   */
  resolveMethod(className: string, methodName: string): ResolvedMethod | null {
    const chain = this.graph.inheritanceChains.get(className) ?? [className];

    for (const cls of chain) {
      const classNode = this.graph.classes.get(cls);
      if (!classNode) continue;

      const method = classNode.methods.find((m) => m.name === methodName);
      if (method) {
        return {
          className: cls,
          method,
          inheritancePath: chain.slice(0, chain.indexOf(cls) + 1),
        };
      }
    }

    return null;
  }

  /**
   * Get the full inheritance chain for a class.
   * Returns [ChildClass, ParentClass, GrandParentClass, ...]
   */
  getInheritanceChain(className: string): string[] {
    return this.graph.inheritanceChains.get(className) ?? [className];
  }

  /**
   * Get all Selenium/WebDriver API calls made by a method and its transitive callees.
   */
  getSeleniumCallsForMethod(
    className: string,
    methodName: string,
    visited = new Set<string>(),
  ): string[] {
    const key = `${className}.${methodName}`;
    if (visited.has(key)) return [];
    visited.add(key);

    const resolved = this.resolveMethod(className, methodName);
    if (!resolved) return [];

    const calls: string[] = [];

    // Direct Selenium calls in this method
    const seleniumPatterns = [
      /driver\.findElement\s*\(\s*By\.\w+/g,
      /driver\.get\s*\(/g,
      /\.sendKeys\s*\(/g,
      /\.click\s*\(/g,
      /\.getText\s*\(/g,
      /\.isDisplayed\s*\(/g,
      /WebDriverWait\b/g,
      /ExpectedConditions\.\w+/g,
    ];

    for (const pattern of seleniumPatterns) {
      const matches = resolved.method.body.matchAll(pattern);
      for (const m of matches) {
        calls.push(m[0]);
      }
    }

    // Resolve transitive calls
    for (const calledMethod of resolved.method.calledMethods) {
      const [calledClass, calledName] = calledMethod.includes('.')
        ? calledMethod.split('.')
        : [className, calledMethod];
      calls.push(...this.getSeleniumCallsForMethod(calledClass, calledName, visited));
    }

    return calls;
  }

  /**
   * Trace a dynamic locator pattern: String[] locator = {"id", "value"}
   * Returns the resolved By.* call if determinable.
   */
  resolveLocatorArray(
    className: string,
    variableName: string,
  ): { strategy: string; value: string } | null {
    const chain = this.getInheritanceChain(className);

    for (const cls of chain) {
      const classNode = this.graph.classes.get(cls);
      if (!classNode) continue;

      // Check fields
      for (const field of classNode.fields) {
        if (field.name === variableName && field.initialValue) {
          return this.parseLocatorArrayValue(field.initialValue);
        }
      }

      // Check method bodies for local variable assignment
      for (const method of classNode.methods) {
        const assignRegex = new RegExp(
          `(?:String\\[\\]\\s+)?${variableName}\\s*=\\s*\\{\\s*"([^"]+)"\\s*,\\s*"([^"]+)"\\s*\\}`,
        );
        const match = method.body.match(assignRegex);
        if (match) {
          return { strategy: match[1], value: match[2] };
        }
      }
    }

    return null;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private parseFile(filePath: string, content: string): void {
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (ext === 'java') {
      this.parseJavaFile(filePath, content);
    } else if (ext === 'cs') {
      this.parseCSharpFile(filePath, content);
    } else if (ext === 'py') {
      this.parsePythonFile(filePath, content);
    }
  }

  private parseJavaFile(filePath: string, content: string): void {
    const lines = content.split('\n');

    // Extract imports
    const imports: string[] = [];
    for (const line of lines) {
      const importMatch = line.match(/^\s*import\s+([\w.]+)\s*;/);
      if (importMatch) imports.push(importMatch[1]);
    }

    // Extract class declarations (handles multiple classes per file)
    const classRegex =
      /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g;

    let classMatch: RegExpExecArray | null;
    const classNames: string[] = [];

    while ((classMatch = classRegex.exec(content)) !== null) {
      const className = classMatch[1];
      const extendsClass = classMatch[2] || undefined;
      const implementsList = classMatch[3] ? classMatch[3].split(',').map((s) => s.trim()) : [];

      const lineNum = content.substring(0, classMatch.index).split('\n').length;

      // Extract methods for this class
      const methods = this.extractJavaMethods(content, classMatch.index, className);
      const fields = this.extractJavaFields(content, classMatch.index);

      const classNode: ClassNode = {
        name: className,
        filePath,
        extends: extendsClass,
        implements: implementsList,
        methods,
        fields,
        imports,
        line: lineNum,
      };

      this.graph.classes.set(className, classNode);
      classNames.push(className);
    }

    if (classNames.length > 0) {
      this.graph.fileToClasses.set(filePath, classNames);
    }
  }

  private extractJavaMethods(
    content: string,
    classStartIdx: number,
    _className: string,
  ): MethodNode[] {
    const methods: MethodNode[] = [];

    // Find the class body (from opening { to matching })
    const classBody = this.extractBracedBlock(content, classStartIdx);
    if (!classBody) return methods;

    // Match method signatures
    const methodRegex =
      /(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:synchronized\s+)?(\w+(?:<[\w<>,\s]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;

    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRegex.exec(classBody)) !== null) {
      const returnType = methodMatch[1];
      const methodName = methodMatch[2];
      const paramStr = methodMatch[3];

      // Skip constructors (return type == class name)
      if (returnType === _className) continue;

      const params = this.parseJavaParams(paramStr);
      const methodBody = this.extractBracedBlock(classBody, methodMatch.index) ?? '';

      const lineNum = content.substring(0, classStartIdx + methodMatch.index).split('\n').length;

      const seleniumPatterns = [
        /driver\./,
        /By\.\w+/,
        /WebDriverWait/,
        /ExpectedConditions/,
        /\.findElement/,
        /\.sendKeys/,
        /\.click\(\)/,
      ];
      const containsSeleniumCalls = seleniumPatterns.some((p) => p.test(methodBody));

      // Extract method calls within body
      const calledMethods = this.extractCalledMethods(methodBody);

      methods.push({
        name: methodName,
        params,
        returnType,
        body: methodBody,
        line: lineNum,
        containsSeleniumCalls,
        calledMethods,
      });
    }

    return methods;
  }

  private extractJavaFields(content: string, classStartIdx: number): FieldNode[] {
    const fields: FieldNode[] = [];
    const classBody = this.extractBracedBlock(content, classStartIdx);
    if (!classBody) return fields;

    // Match field declarations (not inside methods)
    const fieldRegex =
      /(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:final\s+)?([\w<>[,\]\s]+?)\s+(\w+)\s*(?:=\s*(.+?))?\s*;/g;

    // Only look at top-level lines (outside method bodies)
    const topLevelLines = this.getTopLevelLines(classBody);

    for (const line of topLevelLines) {
      const match = line.match(
        /(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:final\s+)?([\w<>[\]]+)\s+(\w+)\s*(?:=\s*(.+?))?\s*;/,
      );
      if (match) {
        const isStatic = /\bstatic\b/.test(line);
        fields.push({
          name: match[2],
          type: match[1],
          initialValue: match[3]?.trim(),
          isStatic,
          line: 0,
        });
      }
    }

    return fields;
  }

  private parseCSharpFile(filePath: string, content: string): void {
    // Similar to Java but with C# syntax differences
    const classRegex =
      /(?:public\s+|private\s+|protected\s+|internal\s+)?(?:abstract\s+|sealed\s+)?(?:partial\s+)?class\s+(\w+)(?:\s*:\s*([\w,\s]+))?\s*\{/g;

    let match: RegExpExecArray | null;
    const classNames: string[] = [];

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const baseList = match[2] ? match[2].split(',').map((s) => s.trim()) : [];
      const extendsClass = baseList.length > 0 ? baseList[0] : undefined;
      const implementsList = baseList.slice(1);

      const lineNum = content.substring(0, match.index).split('\n').length;
      const methods = this.extractCSharpMethods(content, match.index);

      const classNode: ClassNode = {
        name: className,
        filePath,
        extends: extendsClass,
        implements: implementsList,
        methods,
        fields: [],
        imports: [],
        line: lineNum,
      };

      this.graph.classes.set(className, classNode);
      classNames.push(className);
    }

    if (classNames.length > 0) {
      this.graph.fileToClasses.set(filePath, classNames);
    }
  }

  private extractCSharpMethods(content: string, classStartIdx: number): MethodNode[] {
    const methods: MethodNode[] = [];
    const classBody = this.extractBracedBlock(content, classStartIdx);
    if (!classBody) return methods;

    const methodRegex =
      /(?:(?:public|private|protected|internal)\s+)?(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?([\w<>[\]?]+)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(classBody)) !== null) {
      const methodBody = this.extractBracedBlock(classBody, match.index) ?? '';
      methods.push({
        name: match[2],
        params: this.parseJavaParams(match[3]),
        returnType: match[1],
        body: methodBody,
        line: 0,
        containsSeleniumCalls: /driver\.|FindElement|By\./.test(methodBody),
        calledMethods: this.extractCalledMethods(methodBody),
      });
    }

    return methods;
  }

  private parsePythonFile(filePath: string, content: string): void {
    // Python class detection
    const classRegex = /^class\s+(\w+)(?:\(([^)]+)\))?\s*:/gm;

    let match: RegExpExecArray | null;
    const classNames: string[] = [];

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const bases = match[2] ? match[2].split(',').map((s) => s.trim()) : [];
      const extendsClass = bases.length > 0 ? bases[0] : undefined;

      const lineNum = content.substring(0, match.index).split('\n').length;

      const classNode: ClassNode = {
        name: className,
        filePath,
        extends: extendsClass,
        implements: [],
        methods: this.extractPythonMethods(content, match.index),
        fields: [],
        imports: [],
        line: lineNum,
      };

      this.graph.classes.set(className, classNode);
      classNames.push(className);
    }

    if (classNames.length > 0) {
      this.graph.fileToClasses.set(filePath, classNames);
    }
  }

  private extractPythonMethods(content: string, classStartIdx: number): MethodNode[] {
    const methods: MethodNode[] = [];
    // Simple regex for Python methods — indentation-based, so just look for `def` after class
    const remaining = content.substring(classStartIdx);
    const methodRegex = /^\s{4}def\s+(\w+)\s*\(([^)]*)\)\s*(?:->.*)?:/gm;

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(remaining)) !== null) {
      // Extract body (everything indented 8+ spaces after the def)
      const afterDef = remaining.substring(match.index + match[0].length);
      const bodyLines: string[] = [];
      for (const line of afterDef.split('\n')) {
        if (line.match(/^\s{8,}/) || line.trim() === '') {
          bodyLines.push(line);
        } else if (bodyLines.length > 0) {
          break;
        }
      }

      const body = bodyLines.join('\n');
      methods.push({
        name: match[1],
        params: match[2]
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p && p !== 'self')
          .map((p) => ({ name: p.split(':')[0].trim(), type: p.split(':')[1]?.trim() ?? 'any' })),
        returnType: 'any',
        body,
        line: 0,
        containsSeleniumCalls: /driver\.|find_element|By\./.test(body),
        calledMethods: this.extractCalledMethods(body),
      });
    }

    return methods;
  }

  // ─── Utility Methods ─────────────────────────────────────────────────────

  private buildInheritanceChains(): void {
    for (const [className] of this.graph.classes) {
      if (this.graph.inheritanceChains.has(className)) continue;

      const chain: string[] = [];
      let current: string | undefined = className;
      const visited = new Set<string>();

      while (current && !visited.has(current)) {
        visited.add(current);
        chain.push(current);
        const classNode = this.graph.classes.get(current);
        current = classNode?.extends;
      }

      // Detect circular inheritance
      if (current && visited.has(current)) {
        log.warn(
          `Circular inheritance detected: ${chain.join(' → ')} → ${current}. ` +
            `Breaking cycle at ${current}. Review your class hierarchy.`,
        );
      }

      this.graph.inheritanceChains.set(className, chain);
    }
  }

  private buildMethodIndex(): void {
    for (const [className, classNode] of this.graph.classes) {
      for (const method of classNode.methods) {
        this.graph.methodIndex.set(`${className}.${method.name}`, method);
      }
    }
  }

  private extractBracedBlock(content: string, startIdx: number): string | null {
    // Find the first { after startIdx
    const openIdx = content.indexOf('{', startIdx);
    if (openIdx === -1) return null;

    let depth = 1;
    let i = openIdx + 1;
    let inString: string | null = null;

    while (i < content.length && depth > 0) {
      const ch = content[i];
      const prev = i > 0 ? content[i - 1] : '';

      if (inString) {
        if (ch === inString && prev !== '\\') inString = null;
        i++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = ch;
      } else if (ch === '/' && i + 1 < content.length && content[i + 1] === '/') {
        // Skip line comment
        while (i < content.length && content[i] !== '\n') i++;
      } else if (ch === '/' && i + 1 < content.length && content[i + 1] === '*') {
        // Skip block comment
        i += 2;
        while (i < content.length - 1 && !(content[i] === '*' && content[i + 1] === '/')) i++;
        i += 2;
        continue;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
      }

      i++;
    }

    return content.substring(openIdx + 1, i - 1);
  }

  private getTopLevelLines(classBody: string): string[] {
    const lines = classBody.split('\n');
    const topLevel: string[] = [];
    let depth = 0;

    for (const line of lines) {
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0) topLevel.push(line);
    }

    return topLevel;
  }

  private parseJavaParams(paramStr: string): Array<{ name: string; type: string }> {
    if (!paramStr.trim()) return [];

    return paramStr
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => {
        const parts = p.split(/\s+/);
        const name = parts[parts.length - 1];
        const type = parts.slice(0, -1).join(' ');
        return { name, type: type || 'any' };
      });
  }

  private extractCalledMethods(body: string): string[] {
    const calls: string[] = [];
    // Match method calls: this.methodName(, super.methodName(, or plain methodName(
    const callRegex = /(?:(?:this|super|[\w]+)\.)?([\w]+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = callRegex.exec(body)) !== null) {
      const name = match[1];
      // Skip common non-method calls
      if (
        ![
          'if',
          'for',
          'while',
          'switch',
          'catch',
          'return',
          'new',
          'throw',
          'System',
          'String',
        ].includes(name) &&
        name !== name.toUpperCase() // Skip constants
      ) {
        calls.push(name);
      }
    }

    return [...new Set(calls)];
  }

  private parseLocatorArrayValue(value: string): { strategy: string; value: string } | null {
    // Parse: {"id", "username"} or {"xpath", "//div[@class='test']"}
    const match = value.match(/\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/);
    if (match) {
      return { strategy: match[1], value: match[2] };
    }
    return null;
  }
}
