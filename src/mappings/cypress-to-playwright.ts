/**
 * Comprehensive Cypress → Playwright API mapping tables.
 */

import type { TransformationRule, TransformConfidence, TransformCategory } from '../types/index.js';

export interface APIMapping {
  cypress: string;
  playwright: string;
  confidence: TransformConfidence;
  notes?: string;
}

// ─── Commands → Page Actions ───────────────────────────────────────────────

export const COMMAND_MAPPINGS: APIMapping[] = [
  // Navigation
  { cypress: 'cy.visit(url)', playwright: 'await page.goto(url)', confidence: 'high' },
  { cypress: "cy.go('back')", playwright: 'await page.goBack()', confidence: 'high' },
  { cypress: "cy.go('forward')", playwright: 'await page.goForward()', confidence: 'high' },
  { cypress: 'cy.reload()', playwright: 'await page.reload()', confidence: 'high' },
  { cypress: 'cy.url()', playwright: 'page.url()', confidence: 'high' },
  { cypress: 'cy.title()', playwright: 'await page.title()', confidence: 'high' },
  { cypress: 'cy.location()', playwright: 'new URL(page.url())', confidence: 'medium' },

  // Selectors
  { cypress: "cy.get('selector')", playwright: "page.locator('selector')", confidence: 'high' },
  {
    cypress: 'cy.get(\'[data-testid="id"]\')',
    playwright: "page.getByTestId('id')",
    confidence: 'high',
  },
  {
    cypress: 'cy.get(\'[data-cy="id"]\')',
    playwright: "page.getByTestId('id')",
    confidence: 'high',
    notes: 'Configure testIdAttribute in playwright.config.ts',
  },
  { cypress: "cy.contains('text')", playwright: "page.getByText('text')", confidence: 'high' },
  {
    cypress: "cy.contains('selector', 'text')",
    playwright: "page.locator('selector').filter({ hasText: 'text' })",
    confidence: 'high',
  },
  { cypress: "cy.find('selector')", playwright: "locator.locator('selector')", confidence: 'high' },
  { cypress: 'cy.first()', playwright: 'locator.first()', confidence: 'high' },
  { cypress: 'cy.last()', playwright: 'locator.last()', confidence: 'high' },
  { cypress: 'cy.eq(n)', playwright: 'locator.nth(n)', confidence: 'high' },
  {
    cypress: "cy.filter('selector')",
    playwright: "locator.filter({ has: page.locator('selector') })",
    confidence: 'medium',
  },
  {
    cypress: "cy.not('selector')",
    playwright: "locator.filter({ hasNot: page.locator('selector') })",
    confidence: 'medium',
  },
  { cypress: 'cy.children()', playwright: "locator.locator('> *')", confidence: 'medium' },
  { cypress: 'cy.parent()', playwright: "locator.locator('..')", confidence: 'medium' },
  {
    cypress: "cy.closest('selector')",
    playwright: "locator.locator('selector >> nth=0')",
    confidence: 'low',
    notes: 'May need manual adjustment',
  },
  {
    cypress: 'cy.siblings()',
    playwright: "// Manual: locator.locator('..').locator('> *').filter()",
    confidence: 'low',
  },

  // Actions
  { cypress: '.click()', playwright: 'await locator.click()', confidence: 'high' },
  {
    cypress: '.click({ force: true })',
    playwright: 'await locator.click({ force: true })',
    confidence: 'high',
  },
  { cypress: '.dblclick()', playwright: 'await locator.dblclick()', confidence: 'high' },
  {
    cypress: '.rightclick()',
    playwright: "await locator.click({ button: 'right' })",
    confidence: 'high',
  },
  {
    cypress: ".type('text')",
    playwright: "await locator.fill('text')",
    confidence: 'high',
    notes: 'fill() replaces content; use pressSequentially() for key-by-key',
  },
  {
    cypress: ".type('text', { delay: ms })",
    playwright: "await locator.pressSequentially('text', { delay: ms })",
    confidence: 'high',
  },
  { cypress: ".type('{enter}')", playwright: "await locator.press('Enter')", confidence: 'high' },
  {
    cypress: ".type('{selectall}')",
    playwright: "await locator.press('Control+a')",
    confidence: 'high',
  },
  {
    cypress: ".type('{backspace}')",
    playwright: "await locator.press('Backspace')",
    confidence: 'high',
  },
  { cypress: '.clear()', playwright: 'await locator.clear()', confidence: 'high' },
  { cypress: '.check()', playwright: 'await locator.check()', confidence: 'high' },
  { cypress: '.uncheck()', playwright: 'await locator.uncheck()', confidence: 'high' },
  {
    cypress: '.select(value)',
    playwright: 'await locator.selectOption(value)',
    confidence: 'high',
  },
  {
    cypress: '.select([values])',
    playwright: 'await locator.selectOption([values])',
    confidence: 'high',
  },
  { cypress: ".trigger('mouseover')", playwright: 'await locator.hover()', confidence: 'high' },
  {
    cypress: ".trigger('mousedown')",
    playwright: "await locator.dispatchEvent('mousedown')",
    confidence: 'medium',
  },
  {
    cypress: '.scrollIntoView()',
    playwright: 'await locator.scrollIntoViewIfNeeded()',
    confidence: 'high',
  },
  {
    cypress: ".scrollTo('bottom')",
    playwright: 'await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))',
    confidence: 'medium',
  },
  { cypress: '.focus()', playwright: 'await locator.focus()', confidence: 'high' },
  { cypress: '.blur()', playwright: 'await locator.blur()', confidence: 'high' },

  // Input/Upload
  {
    cypress: "cy.get('input[type=file]').selectFile('path')",
    playwright: "await locator.setInputFiles('path')",
    confidence: 'high',
  },
  {
    cypress: "cy.get('input[type=file]').attachFile('path')",
    playwright: "await locator.setInputFiles('path')",
    confidence: 'high',
    notes: 'cypress-file-upload plugin equivalent',
  },

  // Viewport
  {
    cypress: 'cy.viewport(width, height)',
    playwright: 'await page.setViewportSize({ width, height })',
    confidence: 'high',
  },
  {
    cypress: "cy.viewport('iphone-6')",
    playwright: "// Use playwright.devices['iPhone 6'] in config",
    confidence: 'medium',
  },

  // Screenshots
  {
    cypress: 'cy.screenshot(name)',
    playwright: 'await page.screenshot({ path: `screenshots/${name}.png` })',
    confidence: 'high',
  },
  {
    cypress: '.screenshot(name)',
    playwright: 'await locator.screenshot({ path: `screenshots/${name}.png` })',
    confidence: 'high',
  },

  // Cookies/Storage
  {
    cypress: 'cy.setCookie(name, value)',
    playwright: 'await context.addCookies([{ name, value, url }])',
    confidence: 'medium',
  },
  {
    cypress: 'cy.getCookie(name)',
    playwright: 'const cookies = await context.cookies(); cookies.find(c => c.name === name)',
    confidence: 'medium',
  },
  { cypress: 'cy.getCookies()', playwright: 'await context.cookies()', confidence: 'high' },
  { cypress: 'cy.clearCookies()', playwright: 'await context.clearCookies()', confidence: 'high' },
  {
    cypress: 'cy.clearLocalStorage()',
    playwright: 'await page.evaluate(() => localStorage.clear())',
    confidence: 'high',
  },

  // Network
  {
    cypress: "cy.intercept('GET', url, response)",
    playwright: 'await page.route(url, route => route.fulfill({ body: response }))',
    confidence: 'medium',
    notes: 'Playwright route API is more powerful',
  },
  {
    cypress: "cy.intercept('POST', url).as('alias')",
    playwright: 'const response = page.waitForResponse(url)',
    confidence: 'medium',
  },
  {
    cypress: "cy.wait('@alias')",
    playwright: 'await response',
    confidence: 'medium',
    notes: 'Use page.waitForResponse() instead of intercept aliases',
  },

  // Misc
  {
    cypress: 'cy.exec(command)',
    playwright: '// Run via Node.js child_process or test fixture',
    confidence: 'low',
  },
  {
    cypress: 'cy.task(name, arg)',
    playwright: '// Use Playwright fixtures or test.beforeAll()',
    confidence: 'low',
  },
  {
    cypress: "cy.fixture('file')",
    playwright: "JSON.parse(fs.readFileSync('fixtures/file.json', 'utf-8'))",
    confidence: 'medium',
  },
  {
    cypress: 'cy.readFile(path)',
    playwright: "fs.readFileSync(path, 'utf-8')",
    confidence: 'high',
  },
  {
    cypress: 'cy.writeFile(path, data)',
    playwright: 'fs.writeFileSync(path, data)',
    confidence: 'high',
  },
  {
    cypress: 'cy.log(message)',
    playwright: 'console.log(message) // or test.info().annotations',
    confidence: 'high',
  },
  { cypress: 'cy.pause()', playwright: 'await page.pause()', confidence: 'high' },
  { cypress: 'cy.debug()', playwright: 'await page.pause()', confidence: 'high' },
  { cypress: 'cy.clock()', playwright: 'await page.clock.install()', confidence: 'high' },
  { cypress: 'cy.tick(ms)', playwright: 'await page.clock.fastForward(ms)', confidence: 'high' },
];

// ─── Assertions ────────────────────────────────────────────────────────────

export const ASSERTION_MAPPINGS: APIMapping[] = [
  {
    cypress: ".should('be.visible')",
    playwright: 'await expect(locator).toBeVisible()',
    confidence: 'high',
  },
  {
    cypress: ".should('not.be.visible')",
    playwright: 'await expect(locator).toBeHidden()',
    confidence: 'high',
  },
  {
    cypress: ".should('exist')",
    playwright: 'await expect(locator).toBeAttached()',
    confidence: 'high',
  },
  {
    cypress: ".should('not.exist')",
    playwright: 'await expect(locator).not.toBeAttached()',
    confidence: 'high',
  },
  {
    cypress: ".should('have.text', text)",
    playwright: 'await expect(locator).toHaveText(text)',
    confidence: 'high',
  },
  {
    cypress: ".should('contain.text', text)",
    playwright: 'await expect(locator).toContainText(text)',
    confidence: 'high',
  },
  {
    cypress: ".should('include.text', text)",
    playwright: 'await expect(locator).toContainText(text)',
    confidence: 'high',
  },
  {
    cypress: ".should('have.value', value)",
    playwright: 'await expect(locator).toHaveValue(value)',
    confidence: 'high',
  },
  {
    cypress: ".should('have.attr', attr, value)",
    playwright: 'await expect(locator).toHaveAttribute(attr, value)',
    confidence: 'high',
  },
  {
    cypress: ".should('have.class', className)",
    playwright: 'await expect(locator).toHaveClass(new RegExp(className))',
    confidence: 'high',
  },
  {
    cypress: ".should('have.css', prop, value)",
    playwright: 'await expect(locator).toHaveCSS(prop, value)',
    confidence: 'high',
  },
  {
    cypress: ".should('have.length', n)",
    playwright: 'await expect(locator).toHaveCount(n)',
    confidence: 'high',
  },
  {
    cypress: ".should('be.enabled')",
    playwright: 'await expect(locator).toBeEnabled()',
    confidence: 'high',
  },
  {
    cypress: ".should('be.disabled')",
    playwright: 'await expect(locator).toBeDisabled()',
    confidence: 'high',
  },
  {
    cypress: ".should('be.checked')",
    playwright: 'await expect(locator).toBeChecked()',
    confidence: 'high',
  },
  {
    cypress: ".should('not.be.checked')",
    playwright: 'await expect(locator).not.toBeChecked()',
    confidence: 'high',
  },
  {
    cypress: ".should('be.focused')",
    playwright: 'await expect(locator).toBeFocused()',
    confidence: 'high',
  },
  {
    cypress: ".should('have.prop', prop, value)",
    playwright: '// Manual: await expect(locator).toHaveJSProperty(prop, value)',
    confidence: 'medium',
  },
  {
    cypress: ".should('match', selector)",
    playwright: '// Manual: use locator.filter() or evaluate',
    confidence: 'low',
  },
  {
    cypress: ".should('contain', text)",
    playwright: 'await expect(locator).toContainText(text)',
    confidence: 'high',
  },
  {
    cypress: ".and('be.visible')",
    playwright: '// Chain: await expect(locator).toBeVisible()',
    confidence: 'high',
    notes: 'Playwright assertions are separate statements',
  },

  // URL/Title assertions
  {
    cypress: "cy.url().should('include', text)",
    playwright: 'await expect(page).toHaveURL(new RegExp(text))',
    confidence: 'high',
  },
  {
    cypress: "cy.url().should('eq', url)",
    playwright: 'await expect(page).toHaveURL(url)',
    confidence: 'high',
  },
  {
    cypress: "cy.title().should('eq', title)",
    playwright: 'await expect(page).toHaveTitle(title)',
    confidence: 'high',
  },
  {
    cypress: "cy.title().should('include', text)",
    playwright: 'await expect(page).toHaveTitle(new RegExp(text))',
    confidence: 'high',
  },
];

// ─── Hooks ─────────────────────────────────────────────────────────────────

export const HOOK_MAPPINGS: APIMapping[] = [
  {
    cypress: 'before(() => { ... })',
    playwright: 'test.beforeAll(async () => { ... })',
    confidence: 'high',
  },
  {
    cypress: 'after(() => { ... })',
    playwright: 'test.afterAll(async () => { ... })',
    confidence: 'high',
  },
  {
    cypress: 'beforeEach(() => { ... })',
    playwright: 'test.beforeEach(async ({ page }) => { ... })',
    confidence: 'high',
  },
  {
    cypress: 'afterEach(() => { ... })',
    playwright: 'test.afterEach(async ({ page }) => { ... })',
    confidence: 'high',
  },
];

// ─── Config ────────────────────────────────────────────────────────────────

export const CONFIG_MAPPINGS: APIMapping[] = [
  { cypress: 'baseUrl', playwright: "use: { baseURL: '...' }", confidence: 'high' },
  {
    cypress: 'viewportWidth / viewportHeight',
    playwright: 'use: { viewport: { width: ..., height: ... } }',
    confidence: 'high',
  },
  {
    cypress: 'defaultCommandTimeout',
    playwright: 'use: { actionTimeout: ... }',
    confidence: 'high',
  },
  { cypress: 'pageLoadTimeout', playwright: 'use: { navigationTimeout: ... }', confidence: 'high' },
  { cypress: 'video: true', playwright: "use: { video: 'on' }", confidence: 'high' },
  {
    cypress: 'screenshotOnRunFailure: true',
    playwright: "use: { screenshot: 'only-on-failure' }",
    confidence: 'high',
  },
  { cypress: 'retries: n', playwright: 'retries: n', confidence: 'high' },
  { cypress: 'specPattern', playwright: 'testDir + testMatch', confidence: 'medium' },
  { cypress: 'env: {}', playwright: '// Use .env file or process.env', confidence: 'medium' },
  {
    cypress: 'chromeWebSecurity: false',
    playwright: 'use: { bypassCSP: true }',
    confidence: 'medium',
  },
];

// ─── Special Patterns ──────────────────────────────────────────────────────

export const CYPRESS_SPECIAL_KEYS: Record<string, string> = {
  '{enter}': 'Enter',
  '{esc}': 'Escape',
  '{backspace}': 'Backspace',
  '{del}': 'Delete',
  '{selectall}': 'Control+a',
  '{movetostart}': 'Home',
  '{movetoend}': 'End',
  '{uparrow}': 'ArrowUp',
  '{downarrow}': 'ArrowDown',
  '{leftarrow}': 'ArrowLeft',
  '{rightarrow}': 'ArrowRight',
  '{pageup}': 'PageUp',
  '{pagedown}': 'PageDown',
  '{home}': 'Home',
  '{end}': 'End',
};

// ─── Rule Generator ────────────────────────────────────────────────────────

export function generateCypressRules(): TransformationRule[] {
  const rules: TransformationRule[] = [];
  let id = 0;

  const addRules = (mappings: APIMapping[], category: TransformCategory) => {
    for (const mapping of mappings) {
      rules.push({
        id: `cypress-${category}-${++id}`,
        name: `${mapping.cypress} → ${mapping.playwright}`,
        description: mapping.notes ?? `Convert ${mapping.cypress} to Playwright`,
        sourceFramework: 'cypress',
        sourcePattern: escapeForRegex(mapping.cypress),
        targetTemplate: mapping.playwright,
        confidence: mapping.confidence,
        category,
        requiresManualReview: mapping.confidence !== 'high',
        examples: [
          {
            input: mapping.cypress,
            output: mapping.playwright,
            language: 'javascript',
          },
        ],
      });
    }
  };

  addRules(COMMAND_MAPPINGS, 'action');
  addRules(ASSERTION_MAPPINGS, 'assertion');
  addRules(HOOK_MAPPINGS, 'hook');
  addRules(CONFIG_MAPPINGS, 'config');

  return rules;
}

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
