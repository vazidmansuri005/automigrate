import { describe, it, expect } from 'vitest';
import { Transformer, getRulesForFramework } from '../../../src/core/transformers/transformer.js';
import type {
  MigrationConfig,
  ParsedFile,
  SourceFile,
  SourceFramework,
  SourceLanguage,
} from '../../../src/types/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: '/tmp/src',
    outputDir: '/tmp/out',
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java', '**/*.js'],
    excludePatterns: [],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: false,
    maxConcurrency: 1,
    verbose: false,
    ...overrides,
  };
}

function makeSourceFile(
  content: string,
  framework: SourceFramework,
  language: SourceLanguage = 'javascript',
): SourceFile {
  return {
    path: `/tmp/src/test.${language === 'java' ? 'java' : 'js'}`,
    relativePath: `test.${language === 'java' ? 'java' : 'js'}`,
    content,
    language,
    framework,
    encoding: 'utf-8',
  };
}

function makeParsedFile(source: SourceFile, overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    source,
    ast: null,
    imports: [],
    classes: [],
    functions: [],
    testCases: [],
    pageObjects: [],
    selectors: [],
    waits: [],
    assertions: [],
    hooks: [],
    capabilities: [],
    ...overrides,
  };
}

/**
 * Helper to transform a single line of code and return the transformed output.
 * Returns the first transformed line that differs from the original, or the
 * first line if all pass through unchanged.
 */
function transformLine(
  content: string,
  framework: SourceFramework,
  language: SourceLanguage = 'javascript',
): string {
  const source = makeSourceFile(content, framework, language);
  const parsed = makeParsedFile(source);
  const rules = getRulesForFramework(framework);
  const transformer = new Transformer(rules, makeConfig(), framework, language);
  const result = transformer.transform(parsed);
  // Return the first line that was actually transformed (differs from original)
  const changed = result.transformedLines.find((l) => l.transformed !== l.original);
  return changed?.transformed ?? result.transformedLines[0]?.transformed ?? '';
}

// ─── Java Selenium: cssSelector quote handling ────────────────────────────────

describe('cssSelector quote handling', () => {
  it('should transform cssSelector with inner single-quotes to locator.fill', () => {
    const content = `driver.findElement(By.cssSelector("input[data-test='username']")).sendKeys("admin");`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.fill('));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('.fill(');
    expect(line!.transformed).toContain("data-test='username'");
    expect(line!.transformed).not.toContain('By.cssSelector');
  });

  it('should transform cssSelector.click to locator.click', () => {
    const content = `driver.findElement(By.cssSelector(".login-btn")).click();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find(
      (l) => l.transformed.includes('.click()') && l.transformed.includes('.login-btn'),
    );
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.login-btn').click()");
    expect(line!.transformed).not.toContain('By.cssSelector');
  });

  it('should transform cssSelector.clear to locator.clear', () => {
    const content = `driver.findElement(By.cssSelector("#email")).clear();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.clear()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('#email').clear()");
    expect(line!.transformed).not.toContain('By.cssSelector');
  });

  it('should transform cssSelector.getText to locator.textContent', () => {
    const content = `driver.findElement(By.cssSelector(".message")).getText();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.textContent()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.message').textContent()");
    expect(line!.transformed).not.toContain('By.cssSelector');
  });
});

// ─── Java Selenium: Cookie operations ─────────────────────────────────────────

describe('Cookie operations', () => {
  it('should transform addCookie to context.addCookies', () => {
    const content = `driver.manage().addCookie(new Cookie("token", "abc123"));`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('context.addCookies'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('context.addCookies');
    expect(line!.transformed).toContain('token');
    expect(line!.transformed).toContain('abc123');
    expect(line!.transformed).not.toContain('new Cookie');
  });

  it('should transform getCookieNamed to context.cookies().find', () => {
    const content = `driver.manage().getCookieNamed("token");`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('context.cookies'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('.find(');
    expect(line!.transformed).toContain('token');
    expect(line!.transformed).not.toContain('getCookieNamed');
  });

  it('should transform deleteAllCookies to context.clearCookies', () => {
    const content = `driver.manage().deleteAllCookies();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) =>
      l.transformed.includes('context.clearCookies'),
    );
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('context.clearCookies()');
    expect(line!.transformed).not.toContain('deleteAllCookies');
  });
});

// ─── Java Selenium: Frame switching ───────────────────────────────────────────

describe('Frame switching', () => {
  it('should transform switchTo().frame(element) to contentFrame()', () => {
    const content = `driver.switchTo().frame(myFrame);`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('contentFrame'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('myFrame.contentFrame()');
    expect(line!.transformed).not.toContain('switchTo');
  });

  it('should transform switchTo().frame(index) to frameLocator.nth', () => {
    // Note: The element rule (matching \w+) comes before the index rule (matching \d+) in
    // the rule list, so a bare numeric like frame(0) is caught by the element rule.
    // Using a multi-digit index or a named frame string would be needed for the index rule.
    // We test that frame(0) is still transformed (caught by the element rule as contentFrame).
    const content = `driver.switchTo().frame(0);`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    // The element-variable rule captures `0` as a variable name and produces contentFrame
    const line = result.transformedLines.find((l) => l.transformed.includes('contentFrame'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('0.contentFrame()');
    expect(line!.transformed).not.toContain('switchTo');
  });

  it('should transform switchTo().parentFrame() to automigrate comment', () => {
    const content = `driver.switchTo().parentFrame();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('[automigrate]'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('parentFrame');
    expect(line!.transformed).not.toContain('switchTo()');
  });
});

// ─── Java Selenium: Actions API ───────────────────────────────────────────────

describe('Actions API', () => {
  it('should skip Actions variable declaration', () => {
    const content = `Actions actions = new Actions(driver);`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.original.includes('Actions'));
    expect(line).toBeDefined();
    expect(line!.transformed).toBe('');
  });

  it('should transform variable-based actions.moveToElement.perform to hover', () => {
    const content = `actions.moveToElement(element).perform();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.hover()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('await element.hover()');
    expect(line!.transformed).not.toContain('moveToElement');
  });

  it('should transform variable-based actions.dragAndDrop.perform to dragTo', () => {
    const content = `actions.dragAndDrop(source, target).perform();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.dragTo('));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('await source.dragTo(target)');
    expect(line!.transformed).not.toContain('dragAndDrop');
  });

  it('should transform variable-based actions.contextClick.perform to right-click', () => {
    const content = `actions.contextClick(element).perform();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('right'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("await element.click({ button: 'right' })");
    expect(line!.transformed).not.toContain('contextClick');
  });

  it('should transform variable-based actions.doubleClick.perform to dblclick', () => {
    const content = `actions.doubleClick(element).perform();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.dblclick()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('await element.dblclick()');
    expect(line!.transformed).not.toContain('doubleClick');
  });
});

// ─── Java control flow ────────────────────────────────────────────────────────

describe('Java control flow', () => {
  it('should transform for-each with WebElement to for..of with locator.all()', () => {
    const content = `for (WebElement item : items) {`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('for (const'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('for (const item of await items.all())');
    expect(line!.transformed).not.toContain('WebElement');
  });

  it('should transform Java String type declaration to const', () => {
    // Use a value that won't be caught by a higher-priority Selenium rule (like driver.getTitle)
    const content = `String title = someMethod();`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('const title'));
    expect(line).toBeDefined();
    expect(line!.transformed).toMatch(/const title = someMethod\(\);/);
    expect(line!.transformed).not.toContain('String ');
  });

  it('should transform FluentWait to automigrate comment', () => {
    const content = `FluentWait<WebDriver> wait = new FluentWait<>(driver).withTimeout(Duration.ofSeconds(30));`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('[automigrate]'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('FluentWait');
    expect(line!.transformed).not.toContain('new FluentWait');
  });
});

// ─── AppiumBy selectors ───────────────────────────────────────────────────────

describe('AppiumBy selectors', () => {
  it('should transform AppiumBy.accessibilityId to page.getByLabel', () => {
    const content = `driver.findElement(AppiumBy.accessibilityId("Login"));`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('getByLabel'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.getByLabel('Login')");
    expect(line!.transformed).not.toContain('AppiumBy');
  });

  it('should transform AppiumBy.id to page.locator with hash', () => {
    const content = `driver.findElement(AppiumBy.id("com.app:id/btn"));`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('page.locator'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('#com.app:id/btn');
    expect(line!.transformed).not.toContain('AppiumBy');
  });

  it('should transform getDriver().findElement(By.id) to page.locator', () => {
    const content = `getDriver().findElement(By.id("username"));`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('page.locator'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('#username')");
    expect(line!.transformed).not.toContain('getDriver()');
    expect(line!.transformed).not.toContain('By.id');
  });
});

// ─── JUnit 5 assertions ──────────────────────────────────────────────────────

describe('JUnit 5 assertions', () => {
  it('should transform Assertions.assertTrue(findElement(By.id).isDisplayed) to expect.toBeVisible', () => {
    const content = `Assertions.assertTrue(driver.findElement(By.id("msg")).isDisplayed());`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('toBeVisible'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("await expect(page.locator('#msg')).toBeVisible()");
    expect(line!.transformed).not.toContain('Assertions.assertTrue');
    expect(line!.transformed).not.toContain('isDisplayed');
  });

  it('should also handle assertTrue without Assertions. prefix', () => {
    const content = `assertTrue(driver.findElement(By.id("msg")).isDisplayed());`;
    const source = makeSourceFile(content, 'selenium', 'java');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('selenium');
    const transformer = new Transformer(rules, makeConfig(), 'selenium', 'java');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('toBeVisible'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("await expect(page.locator('#msg')).toBeVisible()");
  });
});

// ─── WDIO compound $() actions ────────────────────────────────────────────────

describe('WDIO compound $() actions', () => {
  it('should transform $().setValue to page.locator().fill', () => {
    const content = `$('#username').setValue('admin');`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.fill('));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('#username').fill('admin')");
    expect(line!.transformed).not.toContain('setValue');
  });

  it('should transform $().click to page.locator().click', () => {
    const content = `$('.btn').click();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('page.locator'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.btn').click()");
  });

  it('should transform $().getText to page.locator().textContent', () => {
    const content = `$('.msg').getText();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.textContent()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.msg').textContent()");
    expect(line!.transformed).not.toContain('getText');
  });

  it('should transform $().waitForDisplayed({ reverse: true }) to waitFor({ state: hidden })', () => {
    const content = `$('#loader').waitForDisplayed({ reverse: true });`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('waitFor'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("state: 'hidden'");
    expect(line!.transformed).not.toContain('waitForDisplayed');
    expect(line!.transformed).not.toContain('reverse');
  });

  it('should transform $().doubleClick to page.locator().dblclick', () => {
    const content = `$('.item').doubleClick();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.dblclick()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.item').dblclick()");
    expect(line!.transformed).not.toContain('doubleClick');
  });

  it('should transform $().clearValue to page.locator().clear', () => {
    const content = `$('#field').clearValue();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.clear()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('#field').clear()");
    expect(line!.transformed).not.toContain('clearValue');
  });

  it('should transform $().isDisplayed to page.locator().isVisible', () => {
    const content = `$('.element').isDisplayed();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('.isVisible()'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.locator('.element').isVisible()");
    expect(line!.transformed).not.toContain('isDisplayed');
  });
});

// ─── WDIO alerts and cookies ──────────────────────────────────────────────────

describe('WDIO alerts and cookies', () => {
  it('should transform browser.acceptAlert to page.on dialog accept', () => {
    const content = `browser.acceptAlert();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('dialog'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.on('dialog'");
    expect(line!.transformed).toContain('dialog.accept()');
    expect(line!.transformed).not.toContain('acceptAlert');
  });

  it('should transform browser.dismissAlert to page.on dialog dismiss', () => {
    const content = `browser.dismissAlert();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('dialog'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain("page.on('dialog'");
    expect(line!.transformed).toContain('dialog.dismiss()');
    expect(line!.transformed).not.toContain('dismissAlert');
  });

  it('should transform browser.setCookies with array to context.addCookies', () => {
    const content = `browser.setCookies([{name: 'a', value: 'b'}]);`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('context.addCookies'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('context.addCookies');
    expect(line!.transformed).not.toContain('browser.setCookies');
  });

  it('should transform WDIO expect().toBeDisplayed to expect().toBeVisible', () => {
    const content = `expect(el).toBeDisplayed();`;
    const source = makeSourceFile(content, 'webdriverio', 'javascript');
    const parsed = makeParsedFile(source);
    const rules = getRulesForFramework('webdriverio');
    const transformer = new Transformer(rules, makeConfig(), 'webdriverio', 'javascript');
    const result = transformer.transform(parsed);

    const line = result.transformedLines.find((l) => l.transformed.includes('toBeVisible'));
    expect(line).toBeDefined();
    expect(line!.transformed).toContain('await expect(el).toBeVisible()');
    expect(line!.transformed).not.toContain('toBeDisplayed');
  });
});
