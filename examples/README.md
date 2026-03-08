# automigrate Examples

Before/after migration showcases for each supported framework. Each pair demonstrates a realistic test scenario in the original framework alongside the Playwright equivalent that automigrate produces.

## Examples

| Directory                              | Source Framework                   | Target                  | Scenario                                                                                       | Key Patterns                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`selenium-js/`](selenium-js/)         | Selenium WebDriver (JS/Mocha/Chai) | Playwright (TypeScript) | E-commerce shopping cart: search, add items, update quantity, apply coupon, checkout           | `By.*` to `page.locator()`, `sendKeys` to `fill()`/`press()`, `WebDriverWait` to auto-wait, Chai to Playwright `expect`, `switchTo().alert()` to `page.on('dialog')`, cookie management                                                            |
| [`selenium-java/`](selenium-java/)     | Selenium WebDriver (Java/JUnit 5)  | Playwright (Java)       | E-commerce shopping cart: search, hover quick-add, coupon, checkout with shipping form         | `findElement(By.*)` to `page.locator()`, `Actions.moveToElement` to `hover()`, `Select` dropdown to `selectOption()`, `isSelected()` to `isChecked()`, `scrollToElement` to `scrollIntoViewIfNeeded()`, screenshot API                             |
| [`cypress/`](cypress/)                 | Cypress                            | Playwright (TypeScript) | User profile settings: update name/bio, upload avatar, change password, network error handling | `cy.get('[data-testid]')` to `getByTestId()`, `.type()` to `fill()`, `.should()` chains to `expect()` assertions, `cy.intercept` to `page.route()`, `.attachFile` to `setInputFiles()`, `.check()`/`.uncheck()`, `cy.request` to `request` fixture |
| [`puppeteer/`](puppeteer/)             | Puppeteer (Jest)                   | Playwright (TypeScript) | Product search and filter: type search, apply filters, verify price range, sort, paginate      | `page.$()` to `page.locator()`, `page.type()` to `pressSequentially()`, `page.$eval`/`$$eval` to `locator.evaluate`/`evaluateAll`, `waitForSelector` to `waitFor()`, `waitForNavigation` to `waitForLoadState`, `networkidle0` to `networkidle`    |
| [`python-selenium/`](python-selenium/) | Selenium WebDriver (Python/pytest) | Playwright (Python)     | Contact form: fill fields, validate, submit, character counter, tooltip hover                  | `find_element(By.ID)` to `page.locator("#id")`, `send_keys` to `fill()`, `Select` to `select_option()`, `ActionChains.move_to_element` to `hover()`, `is_displayed()` to `is_visible()`, pytest fixtures to Playwright `page` fixture              |

## What to Look For

Each example demonstrates these transformation categories:

### Selectors

- `By.id("x")` / `By.css("x")` / `By.name("x")` become `page.locator('#x')` / `page.locator('x')` / `page.locator('[name="x"]')`
- `By.linkText("x")` becomes `page.getByRole('link', { name: 'x' })`
- `cy.get('[data-testid="x"]')` becomes `page.getByTestId('x')`
- `page.$()` / `page.$$()` become `page.locator()`

### Actions

- `element.sendKeys("text")` / `.type("text")` become `locator.fill("text")` (replaces content) or `locator.pressSequentially("text")` (key-by-key)
- `element.sendKeys(Keys.ENTER)` / `.type('{enter}')` become `locator.press('Enter')`
- `Select(el).selectByVisibleText("x")` becomes `locator.selectOption({ label: 'x' })`
- `Actions.moveToElement(el)` / `.trigger('mouseover')` become `locator.hover()`
- `input.sendKeys("/path/to/file")` / `.attachFile()` become `locator.setInputFiles()`

### Waits

- `WebDriverWait` + `ExpectedConditions` are replaced by Playwright's built-in auto-wait
- `driver.sleep()` / `page.waitForTimeout()` are removed where possible
- `page.waitForNavigation()` becomes `page.waitForLoadState()` or `page.waitForURL()`
- Explicit waits become auto-retrying `expect()` assertions

### Assertions

- Chai/JUnit/pytest `assert` become Playwright `expect()` with auto-retrying matchers
- `.should('be.visible')` becomes `await expect(locator).toBeVisible()`
- `assertEquals(text, el.getText())` becomes `await expect(locator).toHaveText(text)`
- `assertTrue(el.isDisplayed())` becomes `await expect(locator).toBeVisible()`

### Test Structure

- Selenium: manual `driver = new Builder()` / `driver.quit()` become Playwright test fixtures
- Cypress: `describe`/`it` become `test.describe`/`test` with `async ({ page })`
- Puppeteer: manual `puppeteer.launch()` / `browser.close()` become test fixtures
- Python: `@pytest.fixture` driver setup becomes the built-in `page` fixture

## Running These Examples

These files are for reference only and target a fictional `demo-store.example.com`. To see automigrate in action on your own tests:

```bash
# Analyze your test suite
npx automigrate analyze ./your-tests

# Preview the migration
npx automigrate migrate ./your-tests --output ./playwright-tests

# Write the migrated files
npx automigrate migrate ./your-tests --output ./playwright-tests --no-dry-run
```
