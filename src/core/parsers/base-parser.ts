/**
 * Base parser interface and abstract implementation.
 * All language-specific parsers extend this.
 */

import type {
  SourceFile,
  ParsedFile,
  SourceLanguage,
  SourceFramework,
  ImportStatement,
  ClassDefinition,
  FunctionDefinition,
  TestCase,
  PageObjectDefinition,
  SelectorUsage,
  WaitUsage,
  AssertionUsage,
  HookUsage,
  CapabilityUsage,
} from '../../types/index.js';

export interface Parser {
  language: SourceLanguage;
  supportedFrameworks: SourceFramework[];
  canParse(file: SourceFile): boolean;
  parse(file: SourceFile): Promise<ParsedFile>;
}

export abstract class BaseParser implements Parser {
  abstract language: SourceLanguage;
  abstract supportedFrameworks: SourceFramework[];

  canParse(file: SourceFile): boolean {
    return file.language === this.language;
  }

  async parse(file: SourceFile): Promise<ParsedFile> {
    const ast = await this.buildAST(file);
    const imports = this.extractImports(ast, file);
    const classes = this.extractClasses(ast, file);
    const functions = this.extractFunctions(ast, file);
    const testCases = this.extractTestCases(ast, file);
    const pageObjects = this.extractPageObjects(ast, file, classes);
    const selectors = this.extractSelectors(ast, file);
    const waits = this.extractWaits(ast, file);
    const assertions = this.extractAssertions(ast, file);
    const hooks = this.extractHooks(ast, file);
    const capabilities = this.extractCapabilities(ast, file);

    return {
      source: file,
      ast,
      imports,
      classes,
      functions,
      testCases,
      pageObjects,
      selectors,
      waits,
      assertions,
      hooks,
      capabilities,
    };
  }

  protected abstract buildAST(file: SourceFile): Promise<unknown>;
  protected abstract extractImports(ast: unknown, file: SourceFile): ImportStatement[];
  protected abstract extractClasses(ast: unknown, file: SourceFile): ClassDefinition[];
  protected abstract extractFunctions(ast: unknown, file: SourceFile): FunctionDefinition[];
  protected abstract extractTestCases(ast: unknown, file: SourceFile): TestCase[];
  protected abstract extractPageObjects(
    ast: unknown,
    file: SourceFile,
    classes: ClassDefinition[],
  ): PageObjectDefinition[];
  protected abstract extractSelectors(ast: unknown, file: SourceFile): SelectorUsage[];
  protected abstract extractWaits(ast: unknown, file: SourceFile): WaitUsage[];
  protected abstract extractAssertions(ast: unknown, file: SourceFile): AssertionUsage[];
  protected abstract extractHooks(ast: unknown, file: SourceFile): HookUsage[];
  protected abstract extractCapabilities(ast: unknown, file: SourceFile): CapabilityUsage[];
}
