/**
 * WebdriverIO → Playwright Transformation Rules
 *
 * Maps WDIO's browser/element API to Playwright equivalents.
 * Covers: browser.*, $(), $$(), element methods, WDIO assertions,
 * frame/window handling, cookies, mocking, and page objects.
 */

import type { TransformationRule } from '../types/index.js';

export function generateWebdriverioRules(): TransformationRule[] {
  return [
    // ─── Navigation & Browser ──────────────────────────────────────────

    {
      sourcePattern: /browser\.url\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: 'page.goto($1$2$1)',
      confidence: 0.95,
      category: 'navigation',
      description: 'browser.url() → page.goto()',
    },
    {
      sourcePattern: /await\s+browser\.getUrl\s*\(\s*\)/,
      targetPattern: 'page.url()',
      confidence: 0.95,
      category: 'navigation',
      description: 'browser.getUrl() → page.url()',
    },
    {
      sourcePattern: /await\s+browser\.getTitle\s*\(\s*\)/,
      targetPattern: 'await page.title()',
      confidence: 0.95,
      category: 'navigation',
      description: 'browser.getTitle() → page.title()',
    },
    {
      sourcePattern: /browser\.back\s*\(\s*\)/,
      targetPattern: 'page.goBack()',
      confidence: 0.95,
      category: 'navigation',
      description: 'browser.back() → page.goBack()',
    },
    {
      sourcePattern: /browser\.forward\s*\(\s*\)/,
      targetPattern: 'page.goForward()',
      confidence: 0.95,
      category: 'navigation',
      description: 'browser.forward() → page.goForward()',
    },
    {
      sourcePattern: /browser\.refresh\s*\(\s*\)/,
      targetPattern: 'page.reload()',
      confidence: 0.95,
      category: 'navigation',
      description: 'browser.refresh() → page.reload()',
    },

    // ─── Element Selectors ─────────────────────────────────────────────

    {
      sourcePattern: /await\s+\$\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: 'page.locator($1$2$1)',
      confidence: 0.9,
      category: 'selector',
      description: '$() → page.locator()',
    },
    {
      sourcePattern: /await\s+\$\$\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: 'page.locator($1$2$1)',
      confidence: 0.9,
      category: 'selector',
      description: '$$() → page.locator() (Playwright locator handles both)',
    },

    // ─── Element Actions ───────────────────────────────────────────────

    {
      sourcePattern: /\.setValue\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.fill($1$2$1)',
      confidence: 0.95,
      category: 'action',
      description: '.setValue() → .fill()',
    },
    {
      sourcePattern: /\.addValue\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.pressSequentially($1$2$1)',
      confidence: 0.9,
      category: 'action',
      description: '.addValue() → .pressSequentially()',
    },
    {
      sourcePattern: /\.clearValue\s*\(\s*\)/,
      targetPattern: '.clear()',
      confidence: 0.95,
      category: 'action',
      description: '.clearValue() → .clear()',
    },
    {
      sourcePattern: /\.getText\s*\(\s*\)/,
      targetPattern: '.textContent()',
      confidence: 0.9,
      category: 'action',
      description: '.getText() → .textContent()',
    },
    {
      sourcePattern: /\.getValue\s*\(\s*\)/,
      targetPattern: '.inputValue()',
      confidence: 0.9,
      category: 'action',
      description: '.getValue() → .inputValue()',
    },
    {
      sourcePattern: /\.getAttribute\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.getAttribute($1$2$1)',
      confidence: 0.95,
      category: 'action',
      description: '.getAttribute() → .getAttribute()',
    },
    {
      sourcePattern: /\.getCSSProperty\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), $1$2$1)',
      confidence: 0.7,
      category: 'action',
      description: '.getCSSProperty() → .evaluate(getComputedStyle())',
    },
    {
      sourcePattern: /\.isDisplayed\s*\(\s*\)/,
      targetPattern: '.isVisible()',
      confidence: 0.9,
      category: 'action',
      description: '.isDisplayed() → .isVisible()',
    },
    {
      sourcePattern: /\.isDisplayedInViewport\s*\(\s*\)/,
      targetPattern: '.isVisible()',
      confidence: 0.85,
      category: 'action',
      description: '.isDisplayedInViewport() → .isVisible()',
    },
    {
      sourcePattern: /\.isExisting\s*\(\s*\)/,
      targetPattern: '.count().then(c => c > 0)',
      confidence: 0.8,
      category: 'action',
      description: '.isExisting() → .count() check',
    },
    {
      sourcePattern: /\.isSelected\s*\(\s*\)/,
      targetPattern: '.isChecked()',
      confidence: 0.9,
      category: 'action',
      description: '.isSelected() → .isChecked()',
    },
    {
      sourcePattern: /\.isEnabled\s*\(\s*\)/,
      targetPattern: '.isEnabled()',
      confidence: 0.95,
      category: 'action',
      description: '.isEnabled() → .isEnabled()',
    },
    {
      sourcePattern: /\.isClickable\s*\(\s*\)/,
      targetPattern: '.isEnabled()',
      confidence: 0.8,
      category: 'action',
      description: '.isClickable() → .isEnabled() (Playwright auto-waits for actionability)',
    },

    // ─── Wait Methods ──────────────────────────────────────────────────

    {
      sourcePattern: /\.waitForDisplayed\s*\(\s*\)/,
      targetPattern: ".waitFor({ state: 'visible' })",
      confidence: 0.9,
      category: 'wait',
      description: ".waitForDisplayed() → .waitFor({ state: 'visible' })",
    },
    {
      sourcePattern: /\.waitForDisplayed\s*\(\s*\{[^}]*reverse\s*:\s*true[^}]*\}\s*\)/,
      targetPattern: ".waitFor({ state: 'hidden' })",
      confidence: 0.9,
      category: 'wait',
      description: ".waitForDisplayed({ reverse: true }) → .waitFor({ state: 'hidden' })",
    },
    {
      sourcePattern: /\.waitForExist\s*\(\s*\)/,
      targetPattern: ".waitFor({ state: 'attached' })",
      confidence: 0.9,
      category: 'wait',
      description: ".waitForExist() → .waitFor({ state: 'attached' })",
    },
    {
      sourcePattern: /\.waitForClickable\s*\(\s*\)/,
      targetPattern: ".waitFor({ state: 'visible' })",
      confidence: 0.85,
      category: 'wait',
      description: '.waitForClickable() → .waitFor() (Playwright auto-waits)',
    },
    {
      sourcePattern: /browser\.pause\s*\(\s*(\d+)\s*\)/,
      targetPattern: 'page.waitForTimeout($1)',
      confidence: 0.8,
      category: 'wait',
      description: 'browser.pause() → page.waitForTimeout()',
    },
    {
      sourcePattern: /browser\.waitUntil\s*\(/,
      targetPattern:
        '// [automigrate] browser.waitUntil → use expect().toPass() or page.waitForFunction()',
      confidence: 0.6,
      category: 'wait',
      description: 'browser.waitUntil() → manual conversion needed',
    },

    // ─── Select/Dropdown ───────────────────────────────────────────────

    {
      sourcePattern: /\.selectByVisibleText\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.selectOption({ label: $1$2$1 })',
      confidence: 0.9,
      category: 'action',
      description: '.selectByVisibleText() → .selectOption({ label })',
    },
    {
      sourcePattern: /\.selectByAttribute\s*\(\s*['"`]value['"`]\s*,\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.selectOption($1$2$1)',
      confidence: 0.9,
      category: 'action',
      description: ".selectByAttribute('value') → .selectOption()",
    },
    {
      sourcePattern: /\.selectByIndex\s*\(\s*(\d+)\s*\)/,
      targetPattern: '.selectOption({ index: $1 })',
      confidence: 0.9,
      category: 'action',
      description: '.selectByIndex() → .selectOption({ index })',
    },

    // ─── Mouse Actions ─────────────────────────────────────────────────

    {
      sourcePattern: /\.moveTo\s*\(\s*\)/,
      targetPattern: '.hover()',
      confidence: 0.9,
      category: 'action',
      description: '.moveTo() → .hover()',
    },
    {
      sourcePattern: /\.doubleClick\s*\(\s*\)/,
      targetPattern: '.dblclick()',
      confidence: 0.95,
      category: 'action',
      description: '.doubleClick() → .dblclick()',
    },
    {
      sourcePattern: /\.scrollIntoView\s*\(\s*\)/,
      targetPattern: '.scrollIntoViewIfNeeded()',
      confidence: 0.9,
      category: 'action',
      description: '.scrollIntoView() → .scrollIntoViewIfNeeded()',
    },
    {
      sourcePattern: /\.dragAndDrop\s*\(\s*(\w+)\s*\)/,
      targetPattern: '.dragTo($1)',
      confidence: 0.85,
      category: 'action',
      description: '.dragAndDrop(target) → .dragTo(target)',
    },

    // ─── Keyboard ──────────────────────────────────────────────────────

    {
      sourcePattern: /browser\.keys\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: 'page.keyboard.press($1$2$1)',
      confidence: 0.9,
      category: 'action',
      description: 'browser.keys() → page.keyboard.press()',
    },

    // ─── Frames ────────────────────────────────────────────────────────

    {
      sourcePattern: /browser\.switchToFrame\s*\(\s*(\w+)\s*\)/,
      targetPattern: '$1.contentFrame()',
      confidence: 0.8,
      category: 'frame',
      description: 'browser.switchToFrame() → locator.contentFrame()',
    },
    {
      sourcePattern: /browser\.switchToParentFrame\s*\(\s*\)/,
      targetPattern:
        '// [automigrate] switchToParentFrame — use parent page reference instead of frame',
      confidence: 0.7,
      category: 'frame',
      description: 'browser.switchToParentFrame() → use page reference',
    },

    // ─── Windows ───────────────────────────────────────────────────────

    {
      sourcePattern: /browser\.switchWindow\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern:
        '// [automigrate] switchWindow → use context.pages() to find page by title/url',
      confidence: 0.6,
      category: 'window',
      description: 'browser.switchWindow() → context.pages()',
    },
    {
      sourcePattern: /browser\.closeWindow\s*\(\s*\)/,
      targetPattern: 'page.close()',
      confidence: 0.9,
      category: 'window',
      description: 'browser.closeWindow() → page.close()',
    },
    {
      sourcePattern: /browser\.newWindow\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern:
        '// [automigrate] browser.newWindow → const newPage = await context.newPage(); await newPage.goto($1$2$1)',
      confidence: 0.7,
      category: 'window',
      description: 'browser.newWindow() → context.newPage() + goto()',
    },

    // ─── Cookies ───────────────────────────────────────────────────────

    {
      sourcePattern: /browser\.setCookies\s*\(/,
      targetPattern: 'context.addCookies([',
      confidence: 0.8,
      category: 'cookie',
      description: 'browser.setCookies() → context.addCookies()',
    },
    {
      sourcePattern: /browser\.getCookies\s*\(/,
      targetPattern: 'context.cookies(',
      confidence: 0.8,
      category: 'cookie',
      description: 'browser.getCookies() → context.cookies()',
    },
    {
      sourcePattern: /browser\.deleteCookies\s*\(/,
      targetPattern: 'context.clearCookies(',
      confidence: 0.8,
      category: 'cookie',
      description: 'browser.deleteCookies() → context.clearCookies()',
    },
    {
      sourcePattern: /browser\.deleteAllCookies\s*\(\s*\)/,
      targetPattern: 'context.clearCookies()',
      confidence: 0.9,
      category: 'cookie',
      description: 'browser.deleteAllCookies() → context.clearCookies()',
    },

    // ─── Screenshots ───────────────────────────────────────────────────

    {
      sourcePattern: /browser\.saveScreenshot\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: 'page.screenshot({ path: $1$2$1 })',
      confidence: 0.9,
      category: 'action',
      description: 'browser.saveScreenshot() → page.screenshot()',
    },
    {
      sourcePattern: /\.saveScreenshot\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: '.screenshot({ path: $1$2$1 })',
      confidence: 0.9,
      category: 'action',
      description: 'element.saveScreenshot() → locator.screenshot()',
    },

    // ─── JavaScript Execution ──────────────────────────────────────────

    {
      sourcePattern: /browser\.execute\s*\(/,
      targetPattern: 'page.evaluate(',
      confidence: 0.85,
      category: 'action',
      description: 'browser.execute() → page.evaluate()',
    },
    {
      sourcePattern: /browser\.executeAsync\s*\(/,
      targetPattern: 'page.evaluate(',
      confidence: 0.75,
      category: 'action',
      description: 'browser.executeAsync() → page.evaluate() (adjust for async pattern)',
    },

    // ─── File Upload ───────────────────────────────────────────────────

    {
      sourcePattern: /\.setValue\s*\(\s*(['"`])(\/[^'"]+)\1\s*\)/,
      targetPattern: '.setInputFiles($1$2$1)',
      confidence: 0.7,
      category: 'action',
      description: "file input .setValue('/path') → .setInputFiles()",
    },

    // ─── WDIO Assertions ───────────────────────────────────────────────

    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toBeDisplayed\s*\(\s*\)/,
      targetPattern: 'await expect($1).toBeVisible()',
      confidence: 0.95,
      category: 'assertion',
      description: 'expect().toBeDisplayed() → expect().toBeVisible()',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveText\s*\(\s*(['"`])(.*?)\2\s*\)/,
      targetPattern: 'await expect($1).toHaveText($2$3$2)',
      confidence: 0.95,
      category: 'assertion',
      description: 'expect().toHaveText() → expect().toHaveText() (same API)',
    },
    {
      sourcePattern:
        /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveTextContaining\s*\(\s*(['"`])(.*?)\2\s*\)/,
      targetPattern: 'await expect($1).toContainText($2$3$2)',
      confidence: 0.9,
      category: 'assertion',
      description: 'expect().toHaveTextContaining() → expect().toContainText()',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveValue\s*\(\s*(['"`])(.*?)\2\s*\)/,
      targetPattern: 'await expect($1).toHaveValue($2$3$2)',
      confidence: 0.95,
      category: 'assertion',
      description: 'expect().toHaveValue() → expect().toHaveValue() (same API)',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toBeClickable\s*\(\s*\)/,
      targetPattern: 'await expect($1).toBeEnabled()',
      confidence: 0.85,
      category: 'assertion',
      description: 'expect().toBeClickable() → expect().toBeEnabled()',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toExist\s*\(\s*\)/,
      targetPattern: 'await expect($1).toBeAttached()',
      confidence: 0.9,
      category: 'assertion',
      description: 'expect().toExist() → expect().toBeAttached()',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveUrl\s*\(\s*(['"`])(.*?)\2\s*\)/,
      targetPattern: 'await expect(page).toHaveURL($2$3$2)',
      confidence: 0.9,
      category: 'assertion',
      description: 'expect(browser).toHaveUrl() → expect(page).toHaveURL()',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveTitle\s*\(\s*(['"`])(.*?)\2\s*\)/,
      targetPattern: 'await expect(page).toHaveTitle($2$3$2)',
      confidence: 0.9,
      category: 'assertion',
      description: 'expect(browser).toHaveTitle() → expect(page).toHaveTitle()',
    },
    {
      sourcePattern: /await\s+expect\s*\(\s*(\w+)\s*\)\.not\.toBeDisplayed\s*\(\s*\)/,
      targetPattern: 'await expect($1).toBeHidden()',
      confidence: 0.9,
      category: 'assertion',
      description: 'expect().not.toBeDisplayed() → expect().toBeHidden()',
    },

    // ─── Mock/Intercept ────────────────────────────────────────────────

    {
      sourcePattern: /browser\.mock\s*\(\s*(['"`])(.*?)\1\s*\)/,
      targetPattern: "page.route($1$2$1, route => route.fulfill({ body: '' }))",
      confidence: 0.7,
      category: 'network',
      description: 'browser.mock() → page.route() (needs manual response setup)',
    },

    // ─── Imports ───────────────────────────────────────────────────────

    {
      sourcePattern:
        /(?:const|import)\s+\{[^}]*\}\s*(?:=\s*require\(\s*['"]@wdio\/globals['"]\s*\)|from\s+['"]@wdio\/globals['"])\s*;?/,
      targetPattern: "import { test, expect } from '@playwright/test';",
      confidence: 0.95,
      category: 'import',
      description: '@wdio/globals import → @playwright/test import',
    },

    // ─── Page Object getter pattern ────────────────────────────────────

    {
      sourcePattern: /get\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+\$\(\s*(['"`])(.*?)\2\s*\)\s*;?\s*\}/,
      targetPattern: 'get $1() { return this.page.locator($2$3$2); }',
      confidence: 0.85,
      category: 'pageObject',
      description: 'WDIO page object getter → Playwright locator',
    },
    {
      sourcePattern: /get\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+\$\$\(\s*(['"`])(.*?)\2\s*\)\s*;?\s*\}/,
      targetPattern: 'get $1() { return this.page.locator($2$3$2); }',
      confidence: 0.85,
      category: 'pageObject',
      description: 'WDIO page object $$ getter → Playwright locator',
    },
  ];
}
