import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JavaScriptParser } from '../../../src/core/parsers/javascript-parser.js';
import type { SourceFile, ParsedFile } from '../../../src/types/index.js';

const CYPRESS_FIXTURE = resolve(__dirname, '../../fixtures/cypress/login.cy.js');
const PUPPETEER_FIXTURE = resolve(__dirname, '../../fixtures/puppeteer/search.test.js');

describe('JavaScriptParser - Cypress fixture', () => {
  let parser: JavaScriptParser;
  let parsed: ParsedFile;
  let fixtureContent: string;

  beforeAll(async () => {
    parser = new JavaScriptParser();
    fixtureContent = readFileSync(CYPRESS_FIXTURE, 'utf-8');

    const sourceFile: SourceFile = {
      path: CYPRESS_FIXTURE,
      relativePath: 'cypress/login.cy.js',
      content: fixtureContent,
      language: 'javascript',
      framework: 'cypress',
      encoding: 'utf-8',
    };

    parsed = await parser.parse(sourceFile);
  });

  // ─── Language & Framework ──────────────────────────────────────────────

  it('should report javascript language', () => {
    expect(parser.language).toBe('javascript');
  });

  it('should support cypress, puppeteer, and selenium frameworks', () => {
    expect(parser.supportedFrameworks).toContain('cypress');
    expect(parser.supportedFrameworks).toContain('puppeteer');
    expect(parser.supportedFrameworks).toContain('selenium');
  });

  // ─── Test Cases ───────────────────────────────────────────────────────

  it('should detect describe blocks', () => {
    const describeBlock = parsed.testCases.find((tc) => tc.name === 'Login Page');
    expect(describeBlock).toBeDefined();
  });

  it('should detect it blocks', () => {
    const itBlock = parsed.testCases.find((tc) => tc.name.includes('should login successfully'));
    expect(itBlock).toBeDefined();
  });

  it('should find all it blocks', () => {
    // 3 it blocks + 1 describe
    const itBlocks = parsed.testCases.filter((tc) => tc.name !== 'Login Page');
    expect(itBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('should have line numbers for test cases', () => {
    for (const tc of parsed.testCases) {
      expect(tc.line).toBeGreaterThan(0);
      expect(tc.endLine).toBeGreaterThanOrEqual(tc.line);
    }
  });

  // ─── Selectors ────────────────────────────────────────────────────────

  it('should detect cy.get selectors', () => {
    expect(parsed.selectors.length).toBeGreaterThan(0);

    const usernameSelector = parsed.selectors.find((s) => s.value === '#username');
    expect(usernameSelector).toBeDefined();
  });

  it('should detect cy.contains selectors', () => {
    const containsSelector = parsed.selectors.find((s) => s.value === 'Forgot Password?');
    expect(containsSelector).toBeDefined();
  });

  it('should detect data-testid selectors', () => {
    const testIdSelector = parsed.selectors.find((s) => s.value.includes('data-testid'));
    expect(testIdSelector).toBeDefined();
  });

  // ─── Hooks ────────────────────────────────────────────────────────────

  it('should detect beforeEach hook', () => {
    const beforeHook = parsed.hooks.find((h) => h.type === 'beforeEach');
    expect(beforeHook).toBeDefined();
  });

  it('should detect afterEach hook', () => {
    const afterHook = parsed.hooks.find((h) => h.type === 'afterEach');
    expect(afterHook).toBeDefined();
  });

  // ─── Assertions ───────────────────────────────────────────────────────

  it('should detect .should() assertions', () => {
    expect(parsed.assertions.length).toBeGreaterThan(0);
  });

  it('should detect be.visible assertion type', () => {
    const visibleAssertion = parsed.assertions.find((a) => a.type === 'visible');
    expect(visibleAssertion).toBeDefined();
  });

  it('should detect contain.text assertion type', () => {
    const textAssertion = parsed.assertions.find((a) => a.type === 'text');
    expect(textAssertion).toBeDefined();
  });
});

describe('JavaScriptParser - Puppeteer fixture', () => {
  let parser: JavaScriptParser;
  let parsed: ParsedFile;
  let fixtureContent: string;

  beforeAll(async () => {
    parser = new JavaScriptParser();
    fixtureContent = readFileSync(PUPPETEER_FIXTURE, 'utf-8');

    const sourceFile: SourceFile = {
      path: PUPPETEER_FIXTURE,
      relativePath: 'puppeteer/search.test.js',
      content: fixtureContent,
      language: 'javascript',
      framework: 'puppeteer',
      encoding: 'utf-8',
    };

    parsed = await parser.parse(sourceFile);
  });

  // ─── Test Cases ───────────────────────────────────────────────────────

  it('should detect describe blocks', () => {
    const describeBlock = parsed.testCases.find((tc) => tc.name === 'Search Functionality');
    expect(describeBlock).toBeDefined();
  });

  it('should detect test blocks', () => {
    const testBlock = parsed.testCases.find((tc) =>
      tc.name.includes('should search for a product'),
    );
    expect(testBlock).toBeDefined();
  });

  it('should find all test blocks', () => {
    // 3 test blocks + 1 describe
    const testBlocks = parsed.testCases.filter((tc) => tc.name !== 'Search Functionality');
    expect(testBlocks.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Selectors ────────────────────────────────────────────────────────

  it('should detect page.$ selectors', () => {
    expect(parsed.selectors.length).toBeGreaterThan(0);
  });

  it('should detect page.waitForSelector selectors', () => {
    const waitSelector = parsed.selectors.find((s) => s.strategy === 'page.waitForSelector');
    expect(waitSelector).toBeDefined();
  });

  it('should detect page.$$ selectors', () => {
    const multiSelector = parsed.selectors.find((s) => s.strategy === 'page.$$');
    expect(multiSelector).toBeDefined();
  });

  // ─── Waits ────────────────────────────────────────────────────────────

  it('should detect page.waitForNavigation', () => {
    const navWait = parsed.waits.find((w) => w.type === 'pageLoad');
    expect(navWait).toBeDefined();
  });

  it('should detect page.waitForTimeout', () => {
    const timeoutWait = parsed.waits.find((w) => w.type === 'sleep' && w.timeout === 1000);
    expect(timeoutWait).toBeDefined();
  });

  // ─── Hooks ────────────────────────────────────────────────────────────

  it('should detect beforeAll hook', () => {
    const beforeHook = parsed.hooks.find((h) => h.type === 'beforeAll');
    expect(beforeHook).toBeDefined();
  });

  it('should detect afterAll hook', () => {
    const afterHook = parsed.hooks.find((h) => h.type === 'afterAll');
    expect(afterHook).toBeDefined();
  });

  // ─── Imports ──────────────────────────────────────────────────────────

  it('should detect puppeteer require import', () => {
    const puppeteerImport = parsed.imports.find((i) => i.module === 'puppeteer');
    expect(puppeteerImport).toBeDefined();
    expect(puppeteerImport!.isDefault).toBe(true);
  });

  // ─── canParse ─────────────────────────────────────────────────────────

  it('should return true for JavaScript files', () => {
    const file: SourceFile = {
      path: '/test.js',
      relativePath: 'test.js',
      content: '',
      language: 'javascript',
      framework: 'puppeteer',
      encoding: 'utf-8',
    };
    expect(parser.canParse(file)).toBe(true);
  });

  it('should return true for TypeScript files', () => {
    const file: SourceFile = {
      path: '/test.ts',
      relativePath: 'test.ts',
      content: '',
      language: 'typescript',
      framework: 'puppeteer',
      encoding: 'utf-8',
    };
    expect(parser.canParse(file)).toBe(true);
  });

  it('should return false for Java files', () => {
    const file: SourceFile = {
      path: '/test.java',
      relativePath: 'test.java',
      content: '',
      language: 'java',
      framework: 'selenium',
      encoding: 'utf-8',
    };
    expect(parser.canParse(file)).toBe(false);
  });
});
