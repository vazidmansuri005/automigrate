# automigrate

**Migrate Selenium, Cypress, Puppeteer, WebdriverIO, Appium, and Robot Framework test suites to Playwright.**

[![npm version](https://img.shields.io/npm/v/automigrate.svg)](https://www.npmjs.com/package/automigrate)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/vazidmansuri005/automigrate/ci.yml?branch=main)](https://github.com/vazidmansuri005/automigrate/actions)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)

---

![automigrate demo](demo.gif)

automigrate analyzes your existing test suites, builds a transformation plan with confidence scores, and generates idiomatic Playwright code. It runs in dry-run mode by default and never modifies your source files.

## Features

- **Multi-framework** -- Selenium, Cypress, Puppeteer, WebdriverIO, Appium, and Robot Framework
- **Multi-language** -- Java, JavaScript, TypeScript, and Python parsers
- **Safety-first** -- Dry-run by default; original files are never touched
- **Confidence scoring** -- Every transformation is rated high/medium/low so you know what needs manual review
- **Smart selectors** -- Converts legacy selectors to Playwright best practices (`getByRole`, `getByTestId`)
- **Page Object generation** -- Detects page object patterns and produces Playwright POM equivalents
- **Fixture generation** -- Creates Playwright test fixtures from setup/teardown hooks
- **Plugin system** -- Custom parsers, transformation rules, and code generators via the `AutomigratePlugin` interface
- **Parallel processing** -- Concurrent file transformation with configurable concurrency
- **Unified diffs** -- Preview every change before committing with `automigrate diff`
- **Watch mode** -- Re-migrate incrementally as source files change with `--watch`
- **Non-test file filtering** -- Automatically excludes config files (`wdio.conf`, `jest.config`, `tsconfig`, etc.)

## Quick Start

### Analyze your test suite

```bash
npx automigrate analyze ./tests
```

This scans your test directory, detects frameworks and languages, and prints a complexity report with migration confidence estimates.

### Run a migration (dry-run)

```bash
npx automigrate migrate ./tests --output ./playwright-tests
```

By default this is a dry-run. You will see a full report and preview of the generated files without anything being written to disk.

### Write the output

```bash
npx automigrate migrate ./tests --output ./playwright-tests --no-dry-run
```

You will be prompted for confirmation before any files are created. Pass `-y` to skip the prompt.

### Deep scan

```bash
npx automigrate scan ./tests
```

Performs a deep structural analysis -- detects frameworks, file roles, patterns, and generates a migration blueprint.

## Installation

```bash
# Global install
npm install -g automigrate

# Or use npx (no install required)
npx automigrate --help

# Or add to your project
npm install --save-dev automigrate
```

Requires Node.js >= 18.0.0.

## CLI Reference

### `scan <sourceDir>`

Deep-scan project structure -- detect frameworks, file roles, patterns, and generate a migration blueprint.

```bash
automigrate scan ./tests --verbose
```

### `analyze <sourceDir>`

Scan source tests and produce a migration feasibility report.

```bash
automigrate analyze ./tests --format json --output report.json
```

| Option              | Description                                | Default       |
| ------------------- | ------------------------------------------ | ------------- |
| `--format <format>` | Output format: `table`, `json`, `markdown` | `table`       |
| `--output <file>`   | Write report to file                       | stdout        |
| `--config <path>`   | Path to config file                        | auto-detected |
| `-v, --verbose`     | Verbose output                             | `false`       |

### `migrate <sourceDir>`

Run the full migration pipeline.

```bash
automigrate migrate ./tests \
  --output ./playwright-tests \
  --language typescript \
  --selector-strategy best-practice \
  --wait-strategy auto-wait \
  --page-objects \
  --fixtures \
  --no-dry-run -y
```

| Option                | Description                                                                   | Default         |
| --------------------- | ----------------------------------------------------------------------------- | --------------- |
| `--output <dir>`      | Output directory for Playwright tests (required)                              | --              |
| `--framework <fw>`    | Source framework: `selenium`, `cypress`, `puppeteer`, `webdriverio`, `appium` | auto-detected   |
| `--language <lang>`   | Target language: `typescript`, `javascript`                                   | `typescript`    |
| `--no-dry-run`        | Write files to disk                                                           | dry-run enabled |
| `--selector-strategy` | `preserve`, `modernize`, `best-practice`                                      | `preserve`      |
| `--wait-strategy`     | `preserve`, `auto-wait`, `explicit`                                           | `auto-wait`     |
| `--page-objects`      | Generate Playwright page object classes                                       | `false`         |
| `--fixtures`          | Generate Playwright test fixtures                                             | `false`         |
| `--include <glob>`    | Include patterns (repeatable)                                                 | see defaults    |
| `--exclude <glob>`    | Exclude patterns (repeatable)                                                 | see defaults    |
| `--concurrency <n>`   | Max concurrent file processing                                                | `4`             |
| `--watch`             | Watch source directory and re-migrate on changes                              | `false`         |
| `--format <format>`   | Report format: `table`, `json`                                                | `table`         |
| `--report <file>`     | Write full JSON report to file                                                | --              |
| `-v, --verbose`       | Verbose output                                                                | `false`         |
| `-y, --yes`           | Skip confirmation prompt                                                      | `false`         |

### `diff <sourceDir>`

Preview changes as unified diffs without writing files.

```bash
automigrate diff ./tests --output ./playwright-tests
```

### `init`

Generate a `.automigrate.config.ts` configuration template in the current directory.

```bash
automigrate init
```

## Configuration

Run `automigrate init` to generate a `.automigrate.config.ts` file. All CLI options can be set here:

```typescript
import type { MigrationConfig } from 'automigrate';

const config: MigrationConfig = {
  sourceDir: './tests',
  outputDir: './playwright-tests',
  targetLanguage: 'typescript',

  // Safety
  dryRun: true,
  preserveOriginal: true,

  // Code generation
  generatePageObjects: true,
  generateFixtures: true,

  // File selection
  includePatterns: ['**/*.spec.ts', '**/*.test.js', '**/*.java'],
  excludePatterns: ['**/node_modules/**', '**/dist/**'],

  // Transformation strategies
  selectorStrategy: 'best-practice', // "preserve" | "modernize" | "best-practice"
  waitStrategy: 'auto-wait', // "preserve" | "auto-wait" | "explicit"
  assertionStyle: 'expect', // "expect" | "test.expect"

  // Performance
  parallel: true,
  maxConcurrency: 4,

  // Custom rules (optional)
  customRules: [],
};

export default config;
```

### Selector Strategies

| Strategy        | Behavior                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| `preserve`      | Keep original selectors as-is, only change the API (`By.id("x")` to `page.locator('#x')`) |
| `modernize`     | Convert to Playwright locator syntax but preserve selector strings                        |
| `best-practice` | Upgrade to role-based and test-id selectors where possible (`getByRole`, `getByTestId`)   |

### Wait Strategies

| Strategy    | Behavior                                                            |
| ----------- | ------------------------------------------------------------------- |
| `preserve`  | Translate waits 1:1 (explicit waits, sleeps)                        |
| `auto-wait` | Remove unnecessary waits -- Playwright auto-waits for actionability |
| `explicit`  | Convert all waits to explicit `waitFor()` calls                     |

## Supported Transformations

### Selenium (Java/JS) to Playwright

| Selenium                                    | Playwright                                       |
| ------------------------------------------- | ------------------------------------------------ |
| `driver.get(url)`                           | `await page.goto(url)`                           |
| `driver.findElement(By.id("x"))`            | `page.locator('#x')`                             |
| `driver.findElement(By.cssSelector("s"))`   | `page.locator('s')`                              |
| `driver.findElement(By.xpath("//a"))`       | `page.locator('xpath=//a')`                      |
| `element.sendKeys("text")`                  | `await locator.fill("text")`                     |
| `element.click()`                           | `await locator.click()`                          |
| `element.clear()`                           | `await locator.clear()`                          |
| `element.getText()`                         | `await locator.textContent()`                    |
| `element.getAttribute("href")`              | `await locator.getAttribute("href")`             |
| `element.isDisplayed()`                     | `await locator.isVisible()`                      |
| `driver.executeScript(js)`                  | `await page.evaluate(js)`                        |
| `driver.switchTo().frame(ref)`              | `page.frameLocator(selector)` / `contentFrame()` |
| `driver.switchTo().alert().accept()`        | `page.on('dialog', d => d.accept())`             |
| `driver.manage().addCookie(c)`              | `await context.addCookies([c])`                  |
| `driver.manage().getCookieNamed("n")`       | `(await context.cookies()).find(...)`            |
| `driver.manage().deleteAllCookies()`        | `await context.clearCookies()`                   |
| `new Actions(driver).moveToElement(el)`     | `await el.hover()`                               |
| `new Actions(driver).dragAndDrop(src, tgt)` | `await src.dragTo(tgt)`                          |
| `new Actions(driver).contextClick(el)`      | `await el.click({ button: 'right' })`            |
| `new Actions(driver).doubleClick(el)`       | `await el.dblclick()`                            |
| `new Select(el).selectByVisibleText("x")`   | `await el.selectOption({ label: 'x' })`          |
| `driver.getTitle()`                         | `await page.title()`                             |
| `driver.getCurrentUrl()`                    | `page.url()`                                     |
| `driver.navigate().back()`                  | `await page.goBack()`                            |
| `driver.getScreenshotAs(...)`               | `await page.screenshot({ path })`                |
| `driver.quit()`                             | `await browser.close()`                          |
| `assertTrue(el.isDisplayed())`              | `await expect(locator).toBeVisible()`            |
| `assertEquals(title, "x")`                  | `await expect(page).toHaveTitle("x")`            |

### WebdriverIO to Playwright

| WebdriverIO                                 | Playwright                                            |
| ------------------------------------------- | ----------------------------------------------------- |
| `browser.url(path)`                         | `await page.goto(path)`                               |
| `$('selector')`                             | `page.locator('selector')`                            |
| `$$('selector')`                            | `page.locator('selector')`                            |
| `$('sel').setValue('text')`                 | `await page.locator('sel').fill('text')`              |
| `$('sel').click()`                          | `await page.locator('sel').click()`                   |
| `$('sel').doubleClick()`                    | `await page.locator('sel').dblclick()`                |
| `$('sel').clearValue()`                     | `await page.locator('sel').clear()`                   |
| `$('sel').getText()`                        | `await page.locator('sel').textContent()`             |
| `$('sel').getValue()`                       | `await page.locator('sel').inputValue()`              |
| `$('sel').isDisplayed()`                    | `await page.locator('sel').isVisible()`               |
| `$('sel').waitForDisplayed()`               | `await page.locator('sel').waitFor()`                 |
| `$('sel').waitForDisplayed({reverse:true})` | `await page.locator('sel').waitFor({state:'hidden'})` |
| `$('sel').moveTo()`                         | `await page.locator('sel').hover()`                   |
| `$('sel').scrollIntoView()`                 | `await page.locator('sel').scrollIntoViewIfNeeded()`  |
| `$('sel').selectByVisibleText('x')`         | `await page.locator('sel').selectOption({label:'x'})` |
| `browser.pause(ms)`                         | `await page.waitForTimeout(ms)`                       |
| `browser.execute(fn)`                       | `await page.evaluate(fn)`                             |
| `browser.keys('Enter')`                     | `await page.keyboard.press('Enter')`                  |
| `browser.saveScreenshot(path)`              | `await page.screenshot({ path })`                     |
| `browser.acceptAlert()`                     | `page.on('dialog', d => d.accept())`                  |
| `browser.dismissAlert()`                    | `page.on('dialog', d => d.dismiss())`                 |
| `browser.setCookies(cookies)`               | `await context.addCookies(cookies)`                   |
| `browser.deleteCookies()`                   | `await context.clearCookies()`                        |
| `expect(el).toBeDisplayed()`                | `await expect(locator).toBeVisible()`                 |
| `expect(el).toHaveText(t)`                  | `await expect(locator).toHaveText(t)`                 |
| `expect(el).toHaveTextContaining(t)`        | `await expect(locator).toContainText(t)`              |
| `expect(el).toBeSelected()`                 | `await expect(locator).toBeChecked()`                 |

### Cypress to Playwright

| Cypress                       | Playwright                            |
| ----------------------------- | ------------------------------------- |
| `cy.visit(url)`               | `await page.goto(url)`                |
| `cy.get('selector')`          | `page.locator('selector')`            |
| `cy.get('[data-testid="x"]')` | `page.getByTestId('x')`               |
| `cy.contains('text')`         | `page.getByText('text')`              |
| `.click()`                    | `await locator.click()`               |
| `.type('text')`               | `await locator.fill('text')`          |
| `.type('{enter}')`            | `await locator.press('Enter')`        |
| `.clear()`                    | `await locator.clear()`               |
| `.check()` / `.uncheck()`     | `await locator.check()` / `uncheck()` |
| `.select(value)`              | `await locator.selectOption(value)`   |
| `.should('be.visible')`       | `await expect(locator).toBeVisible()` |
| `.should('have.text', t)`     | `await expect(locator).toHaveText(t)` |
| `cy.intercept(method, url)`   | `await page.route(url, handler)`      |
| `cy.screenshot(name)`         | `await page.screenshot({ path })`     |

### Puppeteer to Playwright

| Puppeteer                   | Playwright                                  |
| --------------------------- | ------------------------------------------- |
| `puppeteer.launch(opts)`    | `chromium.launch(opts)`                     |
| `browser.newPage()`         | `context.newPage()`                         |
| `page.$(selector)`          | `page.locator(selector)`                    |
| `page.$$(selector)`         | `page.locator(selector).all()`              |
| `page.$eval(sel, fn)`       | `page.locator(sel).evaluate(fn)`            |
| `page.click(selector)`      | `await page.locator(selector).click()`      |
| `page.type(sel, text)`      | `await page.locator(sel).fill(text)`        |
| `page.waitForSelector(sel)` | `await page.locator(sel).waitFor()`         |
| `page.waitForXPath(xpath)`  | `await page.locator('xpath=...').waitFor()` |
| `page.waitForNavigation()`  | `await page.waitForURL(pattern)`            |
| `page.setViewport(v)`       | `await page.setViewportSize(v)`             |
| `page.evaluate(fn)`         | `await page.evaluate(fn)`                   |
| `page.screenshot(opts)`     | `await page.screenshot(opts)`               |

### Appium to Playwright

| Appium                               | Playwright                                     |
| ------------------------------------ | ---------------------------------------------- |
| `MobileBy.AccessibilityId("x")`      | `page.getByLabel('x')`                         |
| `AppiumBy.accessibilityId("x")`      | `page.getByLabel('x')`                         |
| `AppiumBy.id("com.app:id/btn")`      | `page.locator('#com.app:id/btn')`              |
| `driver.findElementById("x")`        | `page.locator('#x')`                           |
| `driver.findElementByXPath("//x")`   | `page.locator('xpath=//x')`                    |
| `driver.findElementByClassName("x")` | `page.locator('.x')`                           |
| `new TouchAction(driver).tap(el)`    | `// [automigrate] Use page.touchscreen`        |
| `driver.context("WEBVIEW")`          | `// [automigrate] Playwright handles natively` |
| `driver.setLocation(lat, lon)`       | `await context.setGeolocation({...})`          |

200+ transformation rules are included across all frameworks. Each rule includes confidence scoring and flags low-confidence transforms for manual review.

## Plugin API

Create custom plugins to extend automigrate with framework-specific parsers, additional transformation rules, or custom code generators.

```typescript
import type { AutomigratePlugin } from 'automigrate';

const myPlugin: AutomigratePlugin = {
  name: 'my-custom-plugin',
  version: '1.0.0',

  // Scope to a specific source framework (optional)
  sourceFramework: 'selenium',

  // Add custom transformation rules
  transformationRules: [
    {
      id: 'custom-login',
      name: 'Login Helper',
      description: 'Convert custom login utility to Playwright fixture',
      sourceFramework: 'selenium',
      sourcePattern: /LoginHelper\.login\((\w+),\s*(\w+)\)/,
      targetTemplate: 'await login($1, $2)',
      confidence: 'high',
      category: 'custom',
      requiresManualReview: false,
      examples: [
        {
          input: 'LoginHelper.login(user, pass)',
          output: 'await login(user, pass)',
          language: 'java',
        },
      ],
    },
  ],

  // Lifecycle hooks
  async beforeMigration(config) {
    console.log(`Starting migration of ${config.sourceDir}`);
  },

  async afterMigration(report) {
    console.log(`Migrated ${report.summary.totalFiles} files`);
  },
};

export default myPlugin;
```

## Examples

### Selenium (Java) to Playwright (TypeScript)

**Before:**

```java
@Test
public void testLogin() {
    driver.get("https://example.com/login");
    driver.findElement(By.id("username")).sendKeys("admin");
    driver.findElement(By.id("password")).sendKeys("secret");
    driver.findElement(By.cssSelector("button[type='submit']")).click();

    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("dashboard")));

    String title = driver.getTitle();
    assertEquals("Dashboard", title);
}
```

**After:**

```typescript
import { test, expect } from '@playwright/test';

test('testLogin', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('secret');
  await page.locator("button[type='submit']").click();

  await page.locator('#dashboard').waitFor({ state: 'visible' });

  await expect(page).toHaveTitle('Dashboard');
});
```

### WebdriverIO to Playwright

**Before:**

```javascript
describe('Login', () => {
  it('should login with valid credentials', async () => {
    await browser.url('/login');
    await $('#username').setValue('admin');
    await $('#password').setValue('secret');
    await $('button[type="submit"]').click();
    await expect($('.welcome')).toBeDisplayed();
    await expect($('.welcome')).toHaveTextContaining('Welcome');
  });
});
```

**After:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('secret');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(page.locator('.welcome')).toContainText('Welcome');
  });
});
```

### Cypress to Playwright

**Before:**

```javascript
describe('Search', () => {
  it('should return results', () => {
    cy.visit('/search');
    cy.get('[data-testid="search-input"]').type('playwright');
    cy.get('[data-testid="search-button"]').click();
    cy.get('.results-list').should('be.visible');
    cy.get('.results-list li').should('have.length.greaterThan', 0);
  });
});
```

**After:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('should return results', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('search-input').fill('playwright');
    await page.getByTestId('search-button').click();
    await expect(page.locator('.results-list')).toBeVisible();
    await expect(page.locator('.results-list li')).not.toHaveCount(0);
  });
});
```

## Roadmap

- [x] Selenium (Java/JS) to Playwright
- [x] Cypress to Playwright
- [x] Puppeteer to Playwright
- [x] WebdriverIO to Playwright
- [x] Appium mobile test transformations
- [x] Robot Framework support
- [x] Watch mode for incremental migration
- [ ] Interactive mode with per-transformation approval
- [ ] VS Code extension for inline migration suggestions
- [ ] Migration progress dashboard
- [ ] C# parser (NUnit/xUnit with Selenium WebDriver)

## Contributing

```bash
# Clone the repository
git clone https://github.com/vazidmansuri005/automigrate.git
cd automigrate

# Install dependencies
npm install

# Run the dev build (watch mode)
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint
npm run lint:fix

# Type check
npm run typecheck

# Format
npm run format

# Run the CLI locally
npm run cli -- analyze ./path/to/tests
```

### Project Structure

```
src/
  cli/              CLI commands (commander)
  config/           Configuration loading and defaults
  core/
    transformers/   Transformation engine (200+ regex rules + smart patterns)
    parsers/        Language-specific parsers (Java, JS/TS, Gherkin, Python)
    generators/     Playwright code generators
    analyzers/      Framework detection and structure analysis
    reporters/      Migration report formatters
  mappings/         Framework-to-Playwright API mapping tables
  types/            TypeScript type definitions
  utils/            Shared utilities (diff, logging)
tests/
  unit/             386 unit tests (vitest)
  fixtures/         Test fixtures for all supported frameworks
  e2e/              End-to-end integration tests
```

## License

[MIT](LICENSE)
