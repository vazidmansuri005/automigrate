/**
 * Puppeteer → Playwright API mapping tables.
 * Puppeteer and Playwright share similar APIs, making this the most 1:1 migration.
 */

import type { TransformationRule, TransformConfidence, TransformCategory } from '../types/index.js';

export interface APIMapping {
  puppeteer: string;
  playwright: string;
  confidence: TransformConfidence;
  notes?: string;
}

// ─── Browser & Page ────────────────────────────────────────────────────────

export const BROWSER_MAPPINGS: APIMapping[] = [
  {
    puppeteer: 'puppeteer.launch(options)',
    playwright: 'chromium.launch(options)',
    confidence: 'high',
    notes: 'Also available: firefox.launch(), webkit.launch()',
  },
  {
    puppeteer: 'browser.newPage()',
    playwright: 'const context = await browser.newContext(); const page = await context.newPage()',
    confidence: 'medium',
    notes: 'Playwright uses BrowserContext for isolation',
  },
  { puppeteer: 'browser.close()', playwright: 'await browser.close()', confidence: 'high' },
  { puppeteer: 'browser.pages()', playwright: 'context.pages()', confidence: 'high' },
  { puppeteer: 'browser.version()', playwright: 'browser.version()', confidence: 'high' },
  {
    puppeteer: 'page.browser()',
    playwright: '// Use browser variable directly',
    confidence: 'high',
  },

  // Launch options
  { puppeteer: "headless: 'new'", playwright: 'headless: true', confidence: 'high' },
  { puppeteer: 'headless: false', playwright: 'headless: false', confidence: 'high' },
  {
    puppeteer: "args: ['--no-sandbox']",
    playwright: '// Playwright handles sandbox automatically',
    confidence: 'high',
  },
  { puppeteer: 'devtools: true', playwright: 'devtools: true', confidence: 'high' },
  { puppeteer: 'slowMo: ms', playwright: 'slowMo: ms', confidence: 'high' },
  { puppeteer: 'executablePath: path', playwright: 'executablePath: path', confidence: 'high' },
  {
    puppeteer: 'userDataDir: path',
    playwright: '// Use context: { storageState: path }',
    confidence: 'medium',
  },
];

// ─── Navigation ────────────────────────────────────────────────────────────

export const NAVIGATION_MAPPINGS: APIMapping[] = [
  { puppeteer: 'page.goto(url)', playwright: 'await page.goto(url)', confidence: 'high' },
  {
    puppeteer: "page.goto(url, { waitUntil: 'networkidle0' })",
    playwright: "await page.goto(url, { waitUntil: 'networkidle' })",
    confidence: 'high',
  },
  {
    puppeteer: "page.goto(url, { waitUntil: 'networkidle2' })",
    playwright: "await page.goto(url, { waitUntil: 'networkidle' })",
    confidence: 'high',
    notes: "Playwright only has 'networkidle' (no 0/2 distinction)",
  },
  {
    puppeteer: "page.goto(url, { waitUntil: 'domcontentloaded' })",
    playwright: "await page.goto(url, { waitUntil: 'domcontentloaded' })",
    confidence: 'high',
  },
  {
    puppeteer: "page.goto(url, { waitUntil: 'load' })",
    playwright: "await page.goto(url, { waitUntil: 'load' })",
    confidence: 'high',
  },
  { puppeteer: 'page.goBack()', playwright: 'await page.goBack()', confidence: 'high' },
  { puppeteer: 'page.goForward()', playwright: 'await page.goForward()', confidence: 'high' },
  { puppeteer: 'page.reload()', playwright: 'await page.reload()', confidence: 'high' },
  { puppeteer: 'page.url()', playwright: 'page.url()', confidence: 'high' },
  { puppeteer: 'page.title()', playwright: 'await page.title()', confidence: 'high' },
  { puppeteer: 'page.content()', playwright: 'await page.content()', confidence: 'high' },
];

// ─── Selectors & Elements ──────────────────────────────────────────────────

export const SELECTOR_MAPPINGS: APIMapping[] = [
  {
    puppeteer: 'page.$(selector)',
    playwright: 'page.locator(selector)',
    confidence: 'high',
    notes: 'Playwright locators are lazy — no await needed for creation',
  },
  {
    puppeteer: 'page.$$(selector)',
    playwright: 'page.locator(selector)',
    confidence: 'high',
    notes: 'Use .all() to get array, .count() for length',
  },
  {
    puppeteer: 'page.$eval(selector, fn)',
    playwright: 'await page.locator(selector).evaluate(fn)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.$$eval(selector, fn)',
    playwright: 'await page.locator(selector).evaluateAll(fn)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForSelector(selector)',
    playwright: 'await page.locator(selector).waitFor()',
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForSelector(selector, { visible: true })',
    playwright: "await page.locator(selector).waitFor({ state: 'visible' })",
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForSelector(selector, { hidden: true })',
    playwright: "await page.locator(selector).waitFor({ state: 'hidden' })",
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForXPath(xpath)',
    playwright: 'await page.locator(`xpath=${xpath}`).waitFor()',
    confidence: 'high',
  },
  { puppeteer: 'element.$(selector)', playwright: 'locator.locator(selector)', confidence: 'high' },
  {
    puppeteer: 'element.$$(selector)',
    playwright: 'locator.locator(selector)',
    confidence: 'high',
  },
];

// ─── Element Interactions ──────────────────────────────────────────────────

export const INTERACTION_MAPPINGS: APIMapping[] = [
  {
    puppeteer: 'page.click(selector)',
    playwright: 'await page.locator(selector).click()',
    confidence: 'high',
  },
  { puppeteer: 'element.click()', playwright: 'await locator.click()', confidence: 'high' },
  {
    puppeteer: 'page.type(selector, text)',
    playwright: 'await page.locator(selector).fill(text)',
    confidence: 'high',
    notes: 'fill() replaces; use pressSequentially() for key-by-key',
  },
  {
    puppeteer: 'element.type(text)',
    playwright: 'await locator.pressSequentially(text)',
    confidence: 'high',
  },
  {
    puppeteer: 'element.type(text, { delay: ms })',
    playwright: 'await locator.pressSequentially(text, { delay: ms })',
    confidence: 'high',
  },
  {
    puppeteer: 'page.focus(selector)',
    playwright: 'await page.locator(selector).focus()',
    confidence: 'high',
  },
  {
    puppeteer: 'page.hover(selector)',
    playwright: 'await page.locator(selector).hover()',
    confidence: 'high',
  },
  {
    puppeteer: 'page.select(selector, value)',
    playwright: 'await page.locator(selector).selectOption(value)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.tap(selector)',
    playwright: 'await page.locator(selector).tap()',
    confidence: 'high',
  },
  {
    puppeteer: "element.press('Enter')",
    playwright: "await locator.press('Enter')",
    confidence: 'high',
  },
  {
    puppeteer: 'element.uploadFile(path)',
    playwright: 'await locator.setInputFiles(path)',
    confidence: 'high',
  },
  {
    puppeteer: 'element.screenshot()',
    playwright: 'await locator.screenshot()',
    confidence: 'high',
  },
  {
    puppeteer: 'element.boundingBox()',
    playwright: 'await locator.boundingBox()',
    confidence: 'high',
  },
  {
    puppeteer: 'element.isIntersectingViewport()',
    playwright: 'await locator.isVisible()',
    confidence: 'medium',
  },

  // Element properties
  {
    puppeteer: "element.getProperty('textContent')",
    playwright: 'await locator.textContent()',
    confidence: 'high',
  },
  {
    puppeteer: "element.getProperty('value')",
    playwright: 'await locator.inputValue()',
    confidence: 'high',
  },
  {
    puppeteer: "element.getProperty('innerHTML')",
    playwright: 'await locator.innerHTML()',
    confidence: 'high',
  },
  {
    puppeteer: 'element.evaluate(fn)',
    playwright: 'await locator.evaluate(fn)',
    confidence: 'high',
  },
];

// ─── Page APIs ─────────────────────────────────────────────────────────────

export const PAGE_MAPPINGS: APIMapping[] = [
  // Screenshots
  {
    puppeteer: 'page.screenshot(options)',
    playwright: 'await page.screenshot(options)',
    confidence: 'high',
  },
  { puppeteer: 'page.pdf(options)', playwright: 'await page.pdf(options)', confidence: 'high' },

  // JavaScript
  {
    puppeteer: 'page.evaluate(fn, ...args)',
    playwright: 'await page.evaluate(fn, ...args)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.evaluateHandle(fn)',
    playwright: 'await page.evaluateHandle(fn)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.addScriptTag(options)',
    playwright: 'await page.addScriptTag(options)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.addStyleTag(options)',
    playwright: 'await page.addStyleTag(options)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.exposeFunction(name, fn)',
    playwright: 'await page.exposeFunction(name, fn)',
    confidence: 'high',
  },

  // Keyboard & Mouse
  {
    puppeteer: 'page.keyboard.press(key)',
    playwright: 'await page.keyboard.press(key)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.keyboard.type(text)',
    playwright: 'await page.keyboard.type(text)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.keyboard.down(key)',
    playwright: 'await page.keyboard.down(key)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.keyboard.up(key)',
    playwright: 'await page.keyboard.up(key)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.mouse.click(x, y)',
    playwright: 'await page.mouse.click(x, y)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.mouse.move(x, y)',
    playwright: 'await page.mouse.move(x, y)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.mouse.wheel({ deltaY: n })',
    playwright: 'await page.mouse.wheel(0, n)',
    confidence: 'high',
  },

  // Viewport
  {
    puppeteer: 'page.setViewport({ width, height })',
    playwright: 'await page.setViewportSize({ width, height })',
    confidence: 'high',
  },
  { puppeteer: 'page.viewport()', playwright: 'page.viewportSize()', confidence: 'high' },

  // Frames
  { puppeteer: 'page.frames()', playwright: 'page.frames()', confidence: 'high' },
  { puppeteer: 'page.mainFrame()', playwright: 'page.mainFrame()', confidence: 'high' },
  { puppeteer: 'frame.$(selector)', playwright: 'frame.locator(selector)', confidence: 'high' },

  // Waiting
  {
    puppeteer: 'page.waitForTimeout(ms)',
    playwright: 'await page.waitForTimeout(ms)',
    confidence: 'high',
    notes: 'Consider removing — Playwright auto-waits',
  },
  {
    puppeteer: 'page.waitForNavigation()',
    playwright: 'await page.waitForLoadState()',
    confidence: 'high',
  },
  {
    puppeteer: "page.waitForNavigation({ waitUntil: 'networkidle0' })",
    playwright: "await page.waitForLoadState('networkidle')",
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForFunction(fn)',
    playwright: 'await page.waitForFunction(fn)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForResponse(url)',
    playwright: 'await page.waitForResponse(url)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForRequest(url)',
    playwright: 'await page.waitForRequest(url)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.waitForFileChooser()',
    playwright: "const fc = page.waitForEvent('filechooser')",
    confidence: 'medium',
  },

  // Network
  {
    puppeteer: 'page.setRequestInterception(true)',
    playwright: '// Use page.route() — no need to enable interception',
    confidence: 'high',
  },
  {
    puppeteer: "page.on('request', handler)",
    playwright: "await page.route('**/*', route => handler(route.request()))",
    confidence: 'medium',
  },
  {
    puppeteer: "page.on('response', handler)",
    playwright: "page.on('response', handler)",
    confidence: 'high',
  },
  { puppeteer: 'request.continue()', playwright: 'await route.continue()', confidence: 'high' },
  {
    puppeteer: 'request.respond(response)',
    playwright: 'await route.fulfill(response)',
    confidence: 'high',
  },
  { puppeteer: 'request.abort()', playwright: 'await route.abort()', confidence: 'high' },
  {
    puppeteer: 'page.setExtraHTTPHeaders(headers)',
    playwright: 'await page.setExtraHTTPHeaders(headers)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.authenticate({ username, password })',
    playwright: '// Use context.setHTTPCredentials() or page.route()',
    confidence: 'medium',
  },

  // Cookies
  { puppeteer: 'page.cookies()', playwright: 'await context.cookies()', confidence: 'high' },
  {
    puppeteer: 'page.setCookie(...cookies)',
    playwright: 'await context.addCookies(cookies)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.deleteCookie(...cookies)',
    playwright: 'await context.clearCookies()',
    confidence: 'medium',
  },

  // Emulation
  {
    puppeteer: 'page.emulate(device)',
    playwright: "// Use browser.newContext({ ...devices['Device'] })",
    confidence: 'medium',
  },
  {
    puppeteer: 'page.setUserAgent(ua)',
    playwright: '// Set in context: browser.newContext({ userAgent: ua })',
    confidence: 'medium',
  },
  {
    puppeteer: 'page.emulateMediaType(type)',
    playwright: 'await page.emulateMedia({ media: type })',
    confidence: 'high',
  },
  {
    puppeteer: 'page.setGeolocation(geo)',
    playwright: '// Set in context: browser.newContext({ geolocation: geo })',
    confidence: 'medium',
  },

  // Dialog
  {
    puppeteer: "page.on('dialog', handler)",
    playwright: "page.on('dialog', handler)",
    confidence: 'high',
  },
  { puppeteer: 'dialog.accept()', playwright: 'await dialog.accept()', confidence: 'high' },
  { puppeteer: 'dialog.dismiss()', playwright: 'await dialog.dismiss()', confidence: 'high' },
  { puppeteer: 'dialog.message()', playwright: 'dialog.message()', confidence: 'high' },

  // Events
  {
    puppeteer: "page.on('console', handler)",
    playwright: "page.on('console', handler)",
    confidence: 'high',
  },
  {
    puppeteer: "page.on('error', handler)",
    playwright: "page.on('pageerror', handler)",
    confidence: 'high',
  },
  {
    puppeteer: "page.on('load', handler)",
    playwright: "page.on('load', handler)",
    confidence: 'high',
  },
  {
    puppeteer: "page.on('close', handler)",
    playwright: "page.on('close', handler)",
    confidence: 'high',
  },

  // Misc
  { puppeteer: 'page.close()', playwright: 'await page.close()', confidence: 'high' },
  { puppeteer: 'page.isClosed()', playwright: 'page.isClosed()', confidence: 'high' },
  { puppeteer: 'page.bringToFront()', playwright: 'await page.bringToFront()', confidence: 'high' },
  {
    puppeteer: 'page.setDefaultTimeout(ms)',
    playwright: 'page.setDefaultTimeout(ms)',
    confidence: 'high',
  },
  {
    puppeteer: 'page.setDefaultNavigationTimeout(ms)',
    playwright: 'page.setDefaultNavigationTimeout(ms)',
    confidence: 'high',
  },
];

// ─── Rule Generator ────────────────────────────────────────────────────────

export function generatePuppeteerRules(): TransformationRule[] {
  const rules: TransformationRule[] = [];
  let id = 0;

  const addRules = (mappings: APIMapping[], category: TransformCategory) => {
    for (const mapping of mappings) {
      rules.push({
        id: `puppeteer-${category}-${++id}`,
        name: `${mapping.puppeteer} → ${mapping.playwright}`,
        description: mapping.notes ?? `Convert ${mapping.puppeteer} to Playwright`,
        sourceFramework: 'puppeteer',
        sourcePattern: escapeForRegex(mapping.puppeteer),
        targetTemplate: mapping.playwright,
        confidence: mapping.confidence,
        category,
        requiresManualReview: mapping.confidence !== 'high',
        examples: [
          {
            input: mapping.puppeteer,
            output: mapping.playwright,
            language: 'javascript',
          },
        ],
      });
    }
  };

  addRules(BROWSER_MAPPINGS, 'config');
  addRules(NAVIGATION_MAPPINGS, 'navigation');
  addRules(SELECTOR_MAPPINGS, 'selector');
  addRules(INTERACTION_MAPPINGS, 'action');
  addRules(PAGE_MAPPINGS, 'action');

  return rules;
}

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
