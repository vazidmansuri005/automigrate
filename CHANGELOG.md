# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-03-07

### Added

- **Framework Detection** — Auto-detects Selenium (Java/JS/Python/C#), Cypress, Puppeteer, Appium, WebdriverIO, and Robot Framework test files
- **Selenium Migration** — Transforms Selenium WebDriver API calls (findElement, By selectors, Actions chains, Select class, WebDriverWait, alerts, multi-window) to Playwright equivalents
- **Cypress Migration** — Converts cy.visit, cy.get, cy.intercept, cy.contains, cy.wait, and Cypress-specific patterns to Playwright
- **Puppeteer Migration** — Maps puppeteer.launch, page.$, page.evaluate, page.waitForSelector, and other Puppeteer APIs to Playwright
- **WebdriverIO Migration** — Translates browser.url, $(), $$(), browser.keys, setValue, addValue, page objects, and WDIO-specific patterns
- **Robot Framework Migration** — Converts SeleniumLibrary/AppiumLibrary keywords (Open Browser, Click Element, Input Text, Wait Until, etc.) to Playwright Python
- **Appium Migration** — Transforms mobile automation APIs (touch actions, gestures, hybrid app contexts) to Playwright
- **Selector Best-Practice Upgrades** — Automatically converts data-testid, role, aria-label, placeholder, alt, and title attribute selectors to Playwright's recommended getByTestId/getByRole/getByLabel/getByPlaceholder/getByAltText/getByTitle locators
- **Wait Strategy Optimization** — Converts explicit sleeps and framework-specific waits to Playwright's auto-wait patterns
- **Config Generation** — Parses source configs (wdio.conf.js, cypress.config.js, testng.xml) and generates playwright.config.ts with proper browser projects, timeouts, retries, viewport, and video settings
- **Dependency Generation** — Generates package.json (JS/TS) or requirements.txt (Python) with Playwright dependencies, excluding source framework packages
- **Structure Analysis** — Analyzes test suite structure including page objects, fixtures, helpers, and custom commands
- **Complexity Estimation** — Estimates migration complexity per file with confidence scores
- **CLI Interface** — `npx automigrate` guided flow: Scan → Plan → Refine → Migrate
- **Multi-language Support** — Java, JavaScript, TypeScript, Python, C#, and Robot Framework

### Frameworks Supported

| Source Framework | Languages               | Status        |
| ---------------- | ----------------------- | ------------- |
| Selenium         | Java, JS/TS, Python, C# | Full support  |
| Cypress          | JS/TS                   | Full support  |
| Puppeteer        | JS/TS                   | Full support  |
| WebdriverIO      | JS/TS                   | Full support  |
| Robot Framework  | .robot/.resource        | Full support  |
| Appium           | Java, JS/TS             | Basic support |
