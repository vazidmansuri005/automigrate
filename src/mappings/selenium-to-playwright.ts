/**
 * Comprehensive Selenium → Playwright API mapping tables.
 * Covers WebDriver, WebElement, Actions, Wait, Navigation, and more.
 */

import type { TransformationRule, TransformConfidence, TransformCategory } from '../types/index.js';

// ─── Core API Mappings ─────────────────────────────────────────────────────

export interface APIMapping {
  selenium: string;
  playwright: string;
  confidence: TransformConfidence;
  notes?: string;
  requiresAsync?: boolean;
  requiresAwait?: boolean;
}

// ─── WebDriver → Page ──────────────────────────────────────────────────────

export const DRIVER_MAPPINGS: APIMapping[] = [
  // Navigation
  {
    selenium: 'driver.get(url)',
    playwright: 'await page.goto(url)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.navigate().to(url)',
    playwright: 'await page.goto(url)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.navigate().back()',
    playwright: 'await page.goBack()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.navigate().forward()',
    playwright: 'await page.goForward()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.navigate().refresh()',
    playwright: 'await page.reload()',
    confidence: 'high',
    requiresAwait: true,
  },
  { selenium: 'driver.getCurrentUrl()', playwright: 'page.url()', confidence: 'high' },
  {
    selenium: 'driver.getTitle()',
    playwright: 'await page.title()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.getPageSource()',
    playwright: 'await page.content()',
    confidence: 'high',
    requiresAwait: true,
  },

  // Window management
  {
    selenium: 'driver.manage().window().maximize()',
    playwright: '// Playwright: set viewport in config or use page.setViewportSize()',
    confidence: 'medium',
    notes: 'Playwright uses viewport sizes instead of window maximize',
  },
  {
    selenium: 'driver.manage().window().setSize(w, h)',
    playwright: 'await page.setViewportSize({ width: w, height: h })',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.manage().window().getSize()',
    playwright: 'page.viewportSize()',
    confidence: 'high',
  },
  {
    selenium: 'driver.manage().window().fullscreen()',
    playwright: '// Playwright: configure in browser launch options',
    confidence: 'low',
  },

  // Cookies
  {
    selenium: 'driver.manage().addCookie(cookie)',
    playwright: 'await context.addCookies([cookie])',
    confidence: 'medium',
    notes: 'Playwright uses BrowserContext for cookies',
  },
  {
    selenium: 'driver.manage().getCookies()',
    playwright: 'await context.cookies()',
    confidence: 'medium',
  },
  {
    selenium: 'driver.manage().getCookieNamed(name)',
    playwright: 'await context.cookies().then(c => c.find(x => x.name === name))',
    confidence: 'medium',
  },
  {
    selenium: 'driver.manage().deleteAllCookies()',
    playwright: 'await context.clearCookies()',
    confidence: 'high',
  },
  {
    selenium: 'driver.manage().deleteCookieNamed(name)',
    playwright: '// Playwright: clearCookies() or addCookies() to overwrite',
    confidence: 'low',
  },

  // Screenshots
  {
    selenium: 'driver.getScreenshotAs(OutputType.FILE)',
    playwright: "await page.screenshot({ path: 'screenshot.png' })",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.getScreenshotAs(OutputType.BASE64)',
    playwright: 'await page.screenshot()',
    confidence: 'high',
    requiresAwait: true,
  },

  // JavaScript execution
  {
    selenium: 'driver.executeScript(script, ...args)',
    playwright: 'await page.evaluate(script, ...args)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.executeAsyncScript(script, ...args)',
    playwright: 'await page.evaluate(script, ...args)',
    confidence: 'medium',
    notes: 'Playwright evaluate is always async-capable',
  },

  // Frames
  {
    selenium: 'driver.switchTo().frame(frameRef)',
    playwright: 'const frame = page.frameLocator(selector)',
    confidence: 'medium',
    notes: 'Playwright uses frameLocator for frame interaction',
  },
  {
    selenium: 'driver.switchTo().defaultContent()',
    playwright: '// Playwright: interact with page directly (no frame switching needed)',
    confidence: 'high',
    notes: 'Playwright frameLocator scopes automatically',
  },
  {
    selenium: 'driver.switchTo().parentFrame()',
    playwright: '// Playwright: frameLocator handles parent context automatically',
    confidence: 'high',
  },

  // Windows/Tabs
  {
    selenium: 'driver.switchTo().window(handle)',
    playwright: 'const page = context.pages().find(p => ...)',
    confidence: 'medium',
    notes: 'Playwright auto-tracks pages',
  },
  { selenium: 'driver.getWindowHandles()', playwright: 'context.pages()', confidence: 'high' },
  { selenium: 'driver.getWindowHandle()', playwright: 'page', confidence: 'high' },
  {
    selenium: 'driver.switchTo().newWindow(WindowType.TAB)',
    playwright: 'const newPage = await context.newPage()',
    confidence: 'high',
  },

  // Alerts
  {
    selenium: 'driver.switchTo().alert().accept()',
    playwright: "page.on('dialog', d => d.accept())",
    confidence: 'medium',
    notes: 'Playwright handles dialogs via event listeners',
  },
  {
    selenium: 'driver.switchTo().alert().dismiss()',
    playwright: "page.on('dialog', d => d.dismiss())",
    confidence: 'medium',
  },
  {
    selenium: 'driver.switchTo().alert().getText()',
    playwright: "page.on('dialog', d => d.message())",
    confidence: 'medium',
  },
  {
    selenium: 'driver.switchTo().alert().sendKeys(text)',
    playwright: "page.on('dialog', d => d.accept(text))",
    confidence: 'medium',
  },

  // Lifecycle
  {
    selenium: 'driver.quit()',
    playwright: 'await browser.close()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'driver.close()',
    playwright: 'await page.close()',
    confidence: 'high',
    requiresAwait: true,
  },
];

// ─── WebElement → Locator ──────────────────────────────────────────────────

export const ELEMENT_MAPPINGS: APIMapping[] = [
  // Actions
  {
    selenium: 'element.click()',
    playwright: 'await locator.click()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.sendKeys(text)',
    playwright: 'await locator.fill(text)',
    confidence: 'high',
    requiresAwait: true,
    notes: 'fill() clears first; use type() for key-by-key',
  },
  {
    selenium: 'element.sendKeys(Keys.ENTER)',
    playwright: "await locator.press('Enter')",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.sendKeys(Keys.TAB)',
    playwright: "await locator.press('Tab')",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.clear()',
    playwright: 'await locator.clear()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.submit()',
    playwright: "await locator.press('Enter')",
    confidence: 'medium',
    notes: 'Playwright has no submit(); use press Enter or click submit button',
  },

  // State
  {
    selenium: 'element.getText()',
    playwright: 'await locator.textContent()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.getAttribute(name)',
    playwright: 'await locator.getAttribute(name)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.getCssValue(prop)',
    playwright: 'await locator.evaluate(el => getComputedStyle(el).prop)',
    confidence: 'medium',
    requiresAwait: true,
  },
  {
    selenium: 'element.getTagName()',
    playwright: 'await locator.evaluate(el => el.tagName)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.getSize()',
    playwright: 'await locator.boundingBox()',
    confidence: 'medium',
    requiresAwait: true,
  },
  {
    selenium: 'element.getLocation()',
    playwright: 'await locator.boundingBox()',
    confidence: 'medium',
    requiresAwait: true,
  },
  {
    selenium: 'element.getRect()',
    playwright: 'await locator.boundingBox()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.isDisplayed()',
    playwright: 'await locator.isVisible()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.isEnabled()',
    playwright: 'await locator.isEnabled()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'element.isSelected()',
    playwright: 'await locator.isChecked()',
    confidence: 'high',
    requiresAwait: true,
  },

  // Select (dropdown)
  {
    selenium: 'new Select(element).selectByVisibleText(text)',
    playwright: 'await locator.selectOption({ label: text })',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'new Select(element).selectByValue(value)',
    playwright: 'await locator.selectOption(value)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'new Select(element).selectByIndex(index)',
    playwright: 'await locator.selectOption({ index })',
    confidence: 'high',
    requiresAwait: true,
  },

  // Interaction
  {
    selenium: 'element.screenshot()',
    playwright: 'await locator.screenshot()',
    confidence: 'high',
    requiresAwait: true,
  },
];

// ─── By → Locator Strategies ───────────────────────────────────────────────

export const SELECTOR_MAPPINGS: APIMapping[] = [
  { selenium: "By.id('value')", playwright: "page.locator('#value')", confidence: 'high' },
  { selenium: "By.css('selector')", playwright: "page.locator('selector')", confidence: 'high' },
  {
    selenium: "By.cssSelector('selector')",
    playwright: "page.locator('selector')",
    confidence: 'high',
  },
  {
    selenium: "By.xpath('//path')",
    playwright: "page.locator('xpath=//path')",
    confidence: 'high',
    notes: 'Consider converting XPath to CSS for better performance',
  },
  {
    selenium: "By.name('value')",
    playwright: 'page.locator(\'[name="value"]\')',
    confidence: 'high',
  },
  { selenium: "By.className('value')", playwright: "page.locator('.value')", confidence: 'high' },
  { selenium: "By.tagName('tag')", playwright: "page.locator('tag')", confidence: 'high' },
  {
    selenium: "By.linkText('text')",
    playwright: "page.getByRole('link', { name: 'text' })",
    confidence: 'high',
    notes: 'Playwright role-based selectors are preferred',
  },
  {
    selenium: "By.partialLinkText('text')",
    playwright: "page.getByRole('link', { name: /text/ })",
    confidence: 'medium',
  },
  { selenium: 'driver.findElement(by)', playwright: 'page.locator(selector)', confidence: 'high' },
  {
    selenium: 'driver.findElements(by)',
    playwright: 'page.locator(selector).all()',
    confidence: 'high',
  },
  {
    selenium: 'element.findElement(by)',
    playwright: 'locator.locator(selector)',
    confidence: 'high',
  },
  {
    selenium: 'element.findElements(by)',
    playwright: 'locator.locator(selector).all()',
    confidence: 'high',
  },
];

// ─── Wait → Auto-Wait / Explicit ──────────────────────────────────────────

export const WAIT_MAPPINGS: APIMapping[] = [
  {
    selenium: 'Thread.sleep(ms)',
    playwright: 'await page.waitForTimeout(ms)',
    confidence: 'high',
    requiresAwait: true,
    notes: 'Consider removing — Playwright auto-waits',
  },
  {
    selenium: 'new WebDriverWait(driver, timeout).until(condition)',
    playwright: '// Playwright auto-waits; use expect() or waitFor*()',
    confidence: 'medium',
    notes: 'Most Selenium waits are unnecessary in Playwright',
  },
  {
    selenium: 'ExpectedConditions.visibilityOfElementLocated(by)',
    playwright: "await locator.waitFor({ state: 'visible' })",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'ExpectedConditions.invisibilityOfElementLocated(by)',
    playwright: "await locator.waitFor({ state: 'hidden' })",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'ExpectedConditions.elementToBeClickable(by)',
    playwright: '// Playwright auto-waits for actionability',
    confidence: 'high',
    notes: 'Playwright click() auto-waits for element to be actionable',
  },
  {
    selenium: 'ExpectedConditions.presenceOfElementLocated(by)',
    playwright: "await locator.waitFor({ state: 'attached' })",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'ExpectedConditions.textToBePresentInElement(element, text)',
    playwright: 'await expect(locator).toContainText(text)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'ExpectedConditions.titleContains(text)',
    playwright: 'await expect(page).toHaveTitle(new RegExp(text))',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'ExpectedConditions.urlContains(text)',
    playwright: 'await expect(page).toHaveURL(new RegExp(text))',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'ExpectedConditions.alertIsPresent()',
    playwright: "page.on('dialog', handler)",
    confidence: 'medium',
  },
  {
    selenium: 'ExpectedConditions.frameToBeAvailableAndSwitchToIt(by)',
    playwright: 'page.frameLocator(selector)',
    confidence: 'medium',
  },
  {
    selenium: 'driver.manage().timeouts().implicitlyWait(duration)',
    playwright: '// Playwright: use actionTimeout in config',
    confidence: 'medium',
    notes: 'Set in playwright.config.ts',
  },
  {
    selenium: 'driver.manage().timeouts().pageLoadTimeout(duration)',
    playwright: '// Playwright: use navigationTimeout in config',
    confidence: 'medium',
  },
  {
    selenium: 'driver.manage().timeouts().setScriptTimeout(duration)',
    playwright: '// Playwright: not needed, evaluate has built-in timeout',
    confidence: 'high',
  },
];

// ─── Actions (Advanced Interactions) ───────────────────────────────────────

export const ACTIONS_MAPPINGS: APIMapping[] = [
  {
    selenium: 'new Actions(driver).moveToElement(element).perform()',
    playwright: 'await locator.hover()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'new Actions(driver).doubleClick(element).perform()',
    playwright: 'await locator.dblclick()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'new Actions(driver).contextClick(element).perform()',
    playwright: "await locator.click({ button: 'right' })",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'new Actions(driver).dragAndDrop(source, target).perform()',
    playwright: 'await source.dragTo(target)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium:
      'new Actions(driver).keyDown(Keys.CONTROL).click(element).keyUp(Keys.CONTROL).perform()',
    playwright: "await locator.click({ modifiers: ['Control'] })",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: "new Actions(driver).sendKeys(Keys.chord(Keys.CONTROL, 'a')).perform()",
    playwright: "await page.keyboard.press('Control+a')",
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium:
      'new Actions(driver).moveToElement(el).clickAndHold().moveByOffset(x, y).release().perform()',
    playwright: 'await locator.dragTo(target)',
    confidence: 'medium',
    notes: 'Complex drag may need page.mouse API',
  },
  {
    selenium: 'new Actions(driver).scrollToElement(element).perform()',
    playwright: 'await locator.scrollIntoViewIfNeeded()',
    confidence: 'high',
    requiresAwait: true,
  },
];

// ─── Assertions ────────────────────────────────────────────────────────────

export const ASSERTION_MAPPINGS: APIMapping[] = [
  {
    selenium: 'assertEquals(expected, element.getText())',
    playwright: 'await expect(locator).toHaveText(expected)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertTrue(element.isDisplayed())',
    playwright: 'await expect(locator).toBeVisible()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertFalse(element.isDisplayed())',
    playwright: 'await expect(locator).toBeHidden()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertTrue(element.isEnabled())',
    playwright: 'await expect(locator).toBeEnabled()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertTrue(element.isSelected())',
    playwright: 'await expect(locator).toBeChecked()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertEquals(expected, element.getAttribute(attr))',
    playwright: 'await expect(locator).toHaveAttribute(attr, expected)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertEquals(expected, driver.getTitle())',
    playwright: 'await expect(page).toHaveTitle(expected)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertEquals(expected, driver.getCurrentUrl())',
    playwright: 'await expect(page).toHaveURL(expected)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertTrue(element.getText().contains(text))',
    playwright: 'await expect(locator).toContainText(text)',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertNotNull(element)',
    playwright: 'await expect(locator).toBeAttached()',
    confidence: 'high',
    requiresAwait: true,
  },
  {
    selenium: 'assertEquals(count, elements.size())',
    playwright: 'await expect(locator).toHaveCount(count)',
    confidence: 'high',
    requiresAwait: true,
  },
];

// ─── Keys Mapping ──────────────────────────────────────────────────────────

export const KEYS_MAPPING: Record<string, string> = {
  'Keys.ENTER': "'Enter'",
  'Keys.RETURN': "'Enter'",
  'Keys.TAB': "'Tab'",
  'Keys.ESCAPE': "'Escape'",
  'Keys.BACK_SPACE': "'Backspace'",
  'Keys.DELETE': "'Delete'",
  'Keys.SPACE': "' '",
  'Keys.ARROW_UP': "'ArrowUp'",
  'Keys.ARROW_DOWN': "'ArrowDown'",
  'Keys.ARROW_LEFT': "'ArrowLeft'",
  'Keys.ARROW_RIGHT': "'ArrowRight'",
  'Keys.HOME': "'Home'",
  'Keys.END': "'End'",
  'Keys.PAGE_UP': "'PageUp'",
  'Keys.PAGE_DOWN': "'PageDown'",
  'Keys.CONTROL': "'Control'",
  'Keys.SHIFT': "'Shift'",
  'Keys.ALT': "'Alt'",
  'Keys.META': "'Meta'",
  'Keys.F1': "'F1'",
  'Keys.F2': "'F2'",
  'Keys.F3': "'F3'",
  'Keys.F4': "'F4'",
  'Keys.F5': "'F5'",
  'Keys.F6': "'F6'",
  'Keys.F7': "'F7'",
  'Keys.F8': "'F8'",
  'Keys.F9': "'F9'",
  'Keys.F10': "'F10'",
  'Keys.F11': "'F11'",
  'Keys.F12': "'F12'",
};

// ─── Generate TransformationRules from Mappings ────────────────────────────

export function generateSeleniumRules(): TransformationRule[] {
  const rules: TransformationRule[] = [];
  let id = 0;

  const addRulesFromMappings = (mappings: APIMapping[], category: TransformCategory) => {
    for (const mapping of mappings) {
      rules.push({
        id: `selenium-${category}-${++id}`,
        name: `${mapping.selenium} → ${mapping.playwright}`,
        description: mapping.notes ?? `Convert ${mapping.selenium} to Playwright equivalent`,
        sourceFramework: 'selenium',
        sourcePattern: escapeForRegex(mapping.selenium),
        targetTemplate: mapping.playwright,
        confidence: mapping.confidence,
        category,
        requiresManualReview: mapping.confidence !== 'high',
        examples: [
          {
            input: mapping.selenium,
            output: mapping.playwright,
            language: 'javascript',
          },
        ],
      });
    }
  };

  addRulesFromMappings(DRIVER_MAPPINGS, 'navigation');
  addRulesFromMappings(ELEMENT_MAPPINGS, 'action');
  addRulesFromMappings(SELECTOR_MAPPINGS, 'selector');
  addRulesFromMappings(WAIT_MAPPINGS, 'wait');
  addRulesFromMappings(ACTIONS_MAPPINGS, 'action');
  addRulesFromMappings(ASSERTION_MAPPINGS, 'assertion');

  return rules;
}

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
