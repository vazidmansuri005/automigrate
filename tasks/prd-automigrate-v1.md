# PRD: automigrate — Universal Test Migration Tool v1.0

## Overview

automigrate is a universal test migration tool that converts any test automation framework (Selenium, Cypress, Puppeteer, Appium, WebdriverIO, Robot Framework, Cucumber/BDD) written in any language (Java, Python, JavaScript, TypeScript, C#, Ruby) to idiomatic Playwright tests. It outputs both TypeScript/JavaScript and Python Playwright code, generates full project scaffolding (config, dependencies, CI), and produces a comprehensive migration guide document per project.

The tool already has a working foundation: parsers for 5 languages, transformation mappings for 4 frameworks, a plugin system, guided CLI, and a VSCode extension skeleton. This PRD covers the push to product-readiness: expanding framework/language coverage, improving migration accuracy, adding Python Playwright output, full project migration, migration guide generation, watch mode, and polish.

## Goals

- Support migration from **any major test framework** to Playwright (Selenium, Cypress, Puppeteer, Appium, WebdriverIO, Robot Framework, custom)
- Generate idiomatic **TypeScript, JavaScript, or Python** Playwright output (user-selectable)
- Achieve **>85% high-confidence** transformation rate on real-world test suites
- Produce **full project output**: tests + config + dependencies + CI + migration guide
- Provide a polished **CLI experience** (guided mode + watch mode) and **VSCode extension**
- Fix all existing test failures and ensure robust error handling across all code paths

## Quality Gates

These commands must pass for every user story:

- `npm run typecheck` — TypeScript type checking
- `npm test` — Vitest unit + integration tests

## User Stories

### US-001: Fix Existing E2E Test Failures

**Description:** As a maintainer, I want all existing tests to pass so that we have a reliable baseline before adding new features.

**Acceptance Criteria:**

- [ ] Fix the 2 failing tests in `tests/e2e/ltqa-migration.test.ts` (helper file parsing, driver helper output)
- [ ] All 171 tests pass (169 currently passing + 2 fixed)
- [ ] No test is skipped or commented out

### US-002: WebdriverIO Parser

**Description:** As a user with WebdriverIO tests, I want automigrate to parse my WDIO test files so that they can be migrated to Playwright.

**Acceptance Criteria:**

- [ ] New `src/core/parsers/webdriverio-parser.ts` parses WDIO JS/TS test files
- [ ] Detects `browser.*`, `$()`, `$$()`, `expect()` (WDIO expect) patterns
- [ ] Parses `wdio.conf.js/ts` for capabilities and config
- [ ] Handles WDIO page objects (`get` keyword pattern)
- [ ] Handles `describe/it` and standalone WDIO test patterns
- [ ] Test fixtures added at `tests/fixtures/webdriverio/`
- [ ] Unit tests in `tests/unit/parsers/webdriverio-parser.test.ts` with >=10 test cases

### US-003: WebdriverIO Transformation Mappings

**Description:** As a user migrating from WebdriverIO, I want accurate API-to-API mappings so that my tests produce correct Playwright code.

**Acceptance Criteria:**

- [ ] New `src/mappings/webdriverio-to-playwright.ts` with >=40 transformation rules
- [ ] Covers: `browser.url()`, `$()`, `$$()`, `.click()`, `.setValue()`, `.getText()`, `.waitForDisplayed()`, `.isDisplayed()`, `.moveTo()`, `.keys()`, `.execute()`, `.pause()`, `.switchToFrame()`, `.newWindow()`, `.setCookies()`, `.deleteCookies()`, `.saveScreenshot()`
- [ ] Covers WDIO-specific assertions: `expect(el).toBeDisplayed()`, `toHaveText()`, `toHaveValue()`, `toBeClickable()`, `toExist()`
- [ ] `SourceFramework` type updated to include `"webdriverio"`
- [ ] Framework detector identifies WDIO projects by `wdio.conf`, `@wdio/` imports
- [ ] Unit tests with >=20 transform cases in `tests/unit/transformers/webdriverio.test.ts`

### US-004: Robot Framework Parser

**Description:** As a user with Robot Framework tests, I want automigrate to parse `.robot` files, resource files, and custom keyword libraries so that they can be migrated.

**Acceptance Criteria:**

- [ ] New `src/core/parsers/robot-parser.ts` handles `.robot` and `.resource` files
- [ ] Parses `*** Settings ***`, `*** Variables ***`, `*** Test Cases ***`, `*** Keywords ***` sections
- [ ] Resolves `Resource` and `Library` imports to build dependency chain
- [ ] Extracts SeleniumLibrary and AppiumLibrary keyword calls
- [ ] Handles custom keyword definitions with arguments and return values
- [ ] Fully parses variable files (`.py`, `.yaml`) referenced in settings — resolves variable values for use in transformations
- [ ] `SourceLanguage` type updated to include `"robot"`
- [ ] Test fixtures at `tests/fixtures/robot/` (basic test, resource file, custom keywords, variable file)
- [ ] Unit tests with >=12 test cases

### US-005: Robot Framework Transformation Mappings

**Description:** As a user migrating Robot Framework tests, I want SeleniumLibrary/AppiumLibrary keywords mapped to Playwright equivalents.

**Acceptance Criteria:**

- [ ] New `src/mappings/robot-to-playwright.ts` with >=30 transformation rules
- [ ] Covers SeleniumLibrary keywords: `Open Browser`, `Go To`, `Click Element`, `Input Text`, `Get Text`, `Element Should Be Visible`, `Wait Until Element Is Visible`, `Select From List By Value`, `Close Browser`, `Capture Page Screenshot`, `Execute JavaScript`, `Switch Window`, `Select Frame`
- [ ] Covers AppiumLibrary keywords: `Open Application`, `Click Element`, `Input Text`, `Swipe`, `Get Element Attribute`
- [ ] Custom keywords are converted to Playwright helper functions or fixtures
- [ ] Resource files are converted to importable modules
- [ ] `SourceFramework` type updated to include `"robot"`
- [ ] Framework detector identifies Robot projects by `.robot` extension and `*** Settings ***` pattern
- [ ] Unit tests with >=15 transform cases

### US-006: Improve Java Selenium Transformation Accuracy

**Description:** As a user migrating Java Selenium tests, I want better handling of real-world patterns like base class inheritance, helper methods, and TestNG/JUnit annotations.

**Acceptance Criteria:**

- [ ] Base class methods (`WebMethodsHelper`, `BaseHelper` patterns) are resolved via dependency graph and inlined or converted to Playwright helpers
- [ ] TestNG annotations (`@Test`, `@BeforeMethod`, `@AfterMethod`, `@DataProvider`, `@BeforeClass`, `@AfterClass`) mapped to Playwright equivalents (`test()`, `test.beforeEach()`, `test.afterEach()`, parameterized tests, `test.beforeAll()`, `test.afterAll()`)
- [ ] JUnit 5 annotations (`@Test`, `@BeforeEach`, `@AfterEach`, `@ParameterizedTest`, `@ValueSource`) mapped similarly
- [ ] `WebDriverWait` + `ExpectedConditions` patterns converted to Playwright auto-wait or explicit `waitFor()`
- [ ] `Actions` class chains (`new Actions(driver).moveToElement().click().build().perform()`) converted to Playwright equivalents
- [ ] `Select` class usage converted to `selectOption()`
- [ ] Multi-window/tab handling (`driver.getWindowHandles()`) converted to Playwright `context.pages()` pattern
- [ ] Existing Java test fixtures updated with more complex real-world examples
- [ ] > =10 new unit tests for improved transforms

### US-007: Improve Appium Transformation Accuracy

**Description:** As a user migrating Appium tests, I want mobile-specific patterns properly converted to Playwright mobile testing equivalents.

**Acceptance Criteria:**

- [ ] Touch actions (`TouchAction`, `MultiTouchAction`, `W3C Actions`) converted to Playwright touch equivalents or marked for manual review with suggestions
- [ ] Mobile gestures (swipe, scroll, pinch, zoom, long press) mapped to Playwright `page.touchscreen` or custom helpers
- [ ] Device capabilities (`platformName`, `deviceName`, `app`, `automationName`) converted to Playwright `devices` config or `playwright.config.ts` projects
- [ ] `AppiumDriver` / `IOSDriver` / `AndroidDriver` specifics handled (context switching, orientation, GPS)
- [ ] Hybrid app patterns (`driver.context()` switching between NATIVE_APP and WEBVIEW) handled with TODO markers and suggestions
- [ ] > =8 new unit tests for mobile transforms
- [ ] Updated Appium fixtures with touch gesture and hybrid app examples

### US-008: Improve Cucumber/BDD Migration

**Description:** As a user migrating Cucumber/BDD tests, I want feature files converted to Playwright BDD structure with step definitions properly mapped.

**Acceptance Criteria:**

- [ ] Feature files (`.feature`) parsed with full Gherkin support (Scenario, Scenario Outline, Background, Examples, Tags, Data Tables, Doc Strings)
- [ ] Step definitions (Java, JS, Python) parsed and matched to feature steps
- [ ] Output option A: Playwright test per scenario (inline steps)
- [ ] Output option B: Playwright + `@playwright/test` BDD adapter (preserve Given/When/Then structure)
- [ ] Tags converted to Playwright `test.describe` annotations or `grep` filters
- [ ] Data tables converted to parameterized test data
- [ ] Scenario Outline + Examples converted to parameterized Playwright tests
- [ ] Background steps converted to `test.beforeEach()`
- [ ] Config option `bddStyle: "inline" | "preserve"` added to `MigrationConfig`
- [ ] > =10 new unit tests covering Gherkin edge cases

### US-009: Python Playwright Code Generator

**Description:** As a user who wants Python output, I want automigrate to generate idiomatic pytest-playwright or unittest+Playwright code instead of only JS/TS.

**Acceptance Criteria:**

- [ ] New generator mode in `CodeGenerator` for `targetLanguage: "python"`
- [ ] When target is Python, generates `pytest-playwright` code by default (uses `page` fixture, `expect` from `playwright.sync_api`)
- [ ] Config option `pythonTestRunner: "pytest" | "unittest"` added to `MigrationConfig`
- [ ] When `unittest` is selected, generates `unittest.TestCase` subclass with `playwright.sync_api` setup/teardown
- [ ] Generated Python code follows PEP 8 (snake_case, proper imports, type hints)
- [ ] Page objects generated as Python classes with `@property` decorators for locators
- [ ] Fixtures generated as `conftest.py` files for pytest
- [ ] > =10 unit tests for Python generation (both pytest and unittest variants)
- [ ] Example added at `examples/python-output/`

### US-010: Full Project Scaffolding — Config Generation

**Description:** As a user, I want automigrate to generate a complete `playwright.config.ts` (or `conftest.py` for Python) from my source project's configuration.

**Acceptance Criteria:**

- [ ] Parse source configs: `wdio.conf.js`, `cypress.config.js`, `pytest.ini`, `testng.xml`, `pom.xml` (Selenium deps), `robot.yaml`
- [ ] Generate `playwright.config.ts` with: `baseURL`, `testDir`, `timeout`, `retries`, `reporter`, `projects` (browser matrix), `use` (viewport, screenshot, video, trace)
- [ ] For Python target, generate `conftest.py` + `pyproject.toml` with playwright dependencies
- [ ] Map source browser configs to Playwright browser channels
- [ ] Map source environment variables to Playwright env handling
- [ ] If source has parallel execution config, map to Playwright `workers`
- [ ] > =5 unit tests

### US-011: Full Project Scaffolding — Dependency Migration

**Description:** As a user, I want automigrate to generate the correct dependency files for my new Playwright project.

**Acceptance Criteria:**

- [ ] For JS/TS target: generate `package.json` with `@playwright/test`, `typescript`, and any helper deps
- [ ] For Python target: generate `requirements.txt` or `pyproject.toml` with `playwright`, `pytest-playwright`
- [ ] Detect and exclude source framework deps (selenium, cypress, wdio, etc.)
- [ ] Carry over non-framework deps that are still needed (test data libs, faker, dotenv, etc.)
- [ ] Generate `.gitignore` with Playwright-specific entries (`test-results/`, `playwright-report/`)
- [ ] > =5 unit tests

### US-012: Full Project Scaffolding — CI Pipeline Migration

**Description:** As a user, I want automigrate to generate CI pipeline configs for running Playwright tests from my existing CI setup.

**Acceptance Criteria:**

- [ ] Detect source CI config: `.github/workflows/*.yml`, `Jenkinsfile`, `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`
- [ ] Generate equivalent Playwright CI config (same provider)
- [ ] Include: Playwright browser install step, test run command, artifact upload (report, traces, screenshots)
- [ ] For GitHub Actions: use `mcr.microsoft.com/playwright` container or install action
- [ ] For unknown CI or no CI detected: generate GitHub Actions as default
- [ ] > =3 unit tests

### US-013: Migration Guide Document Generator

**Description:** As a user, I want a comprehensive migration guide generated alongside my migrated tests so that my team can onboard to Playwright confidently.

**Acceptance Criteria:**

- [ ] Generate `MIGRATION_GUIDE.md` in the output directory
- [ ] **Section 1 — Summary**: source framework, language, file count, overall confidence, migration date
- [ ] **Section 2 — Per-file notes**: table of every migrated file with: source path, target path, confidence score, number of manual interventions, key changes
- [ ] **Section 3 — Before/After examples**: top 5 most representative transformations shown side-by-side with explanations
- [ ] **Section 4 — Manual review required**: list of all low-confidence transforms and `TODO` markers grouped by category, with suggested fixes
- [ ] **Section 5 — Risk areas**: files with complex patterns (dynamic locators, custom waits, framework-specific APIs) that need extra testing
- [ ] **Section 6 — Recommended test order**: suggested order to validate migrated tests (start with simplest, work up to complex)
- [ ] **Section 7 — Playwright best practices**: auto-wait, locator strategies, test isolation, parallel execution, fixtures, POM pattern
- [ ] **Section 8 — CI setup guide**: step-by-step instructions for running Playwright in CI (based on detected or generated CI config)
- [ ] **Section 9 — Team training notes**: key differences from source framework, common pitfalls, recommended Playwright docs/videos
- [ ] > =5 unit tests for guide generation

### US-014: Watch Mode for Incremental Migration

**Description:** As a user actively migrating, I want a `--watch` mode that re-runs migration on changed source files so I can iterate quickly.

**Acceptance Criteria:**

- [ ] `automigrate migrate --watch` watches the source directory for file changes
- [ ] On file change: re-parse only changed files, re-transform, re-generate output for those files
- [ ] On file add: detect framework, parse, transform, generate
- [ ] On file delete: optionally remove corresponding output file (with confirmation)
- [ ] Supports `--filter <glob>` flag to only watch specific file patterns (e.g., `--filter "**/*.java"`)
- [ ] Terminal shows live status: files watched, last change, files pending
- [ ] `Ctrl+C` cleanly exits watch mode
- [ ] Uses `chokidar` for cross-platform file watching
- [ ] > =3 unit tests for the watcher logic

### US-015: Guided Mode Improvements

**Description:** As a user running `npx automigrate` for the first time, I want the guided mode to be clear, informative, and handle edge cases gracefully.

**Acceptance Criteria:**

- [ ] Step 1: Ask for source directory (with auto-detection of test dirs)
- [ ] Step 2: Show scan results — detected frameworks, languages, file count, estimated complexity
- [ ] Step 3: Ask for target language (TypeScript / JavaScript / Python) with recommendation based on source
- [ ] Step 4: Ask for output directory (suggest sensible default)
- [ ] Step 5: Show migration plan with confidence breakdown and estimated manual review count
- [ ] Step 6: Allow user to refine (exclude files, change strategies, adjust selector/wait strategies)
- [ ] Step 7: Run migration with progress bar (listr2)
- [ ] Step 8: Show summary report with next steps
- [ ] Handle empty directories, unsupported files, and mixed-framework projects gracefully with clear error messages
- [ ] Save migration plan to `.automigrate-plan.json` for `--plan` resume

### US-016: Framework Detector Improvements

**Description:** As a user with a mixed or unconventional project, I want the framework detector to accurately identify all test frameworks in my codebase.

**Acceptance Criteria:**

- [ ] Detect WebdriverIO by: `wdio.conf.js/ts`, `@wdio/*` imports, `browser.url()` patterns
- [ ] Detect Robot Framework by: `.robot` extension, `*** Settings ***` header, `SeleniumLibrary`/`AppiumLibrary` imports
- [ ] Handle mixed-framework projects (e.g., Selenium + Cucumber + some Cypress) — detect all and report per-file
- [ ] Improve detection confidence scoring — use import analysis + API usage patterns, not just file extension
- [ ] Detect test runner: TestNG, JUnit, pytest, Mocha, Jest, Jasmine, RSpec, Robot
- [ ] > =8 new unit tests for detector improvements

### US-017: Error Handling and Edge Cases

**Description:** As a user running automigrate on real-world codebases, I want clear error messages and graceful degradation when the tool encounters unexpected patterns.

**Acceptance Criteria:**

- [ ] Files that fail to parse don't crash the entire migration — log warning, skip file, report in summary
- [ ] Syntax errors in source files: report file + line + suggestion to fix source first
- [ ] Binary files, images, and non-text files in test dirs: silently skip
- [ ] Extremely large files (>10K lines): warn user, process with streaming if possible
- [ ] Circular imports in dependency graph: detect and break cycle with warning
- [ ] Missing dependencies (e.g., Tree-sitter native module build fails): fallback to regex-based parsing with degraded accuracy warning
- [ ] All error paths have user-friendly messages (no raw stack traces in non-verbose mode)
- [ ] > =5 unit tests for error handling paths

### US-018: VSCode Extension — Inline Migration Suggestions

**Description:** As a developer using VSCode, I want inline migration suggestions and one-click transforms directly in my editor.

**Acceptance Criteria:**

- [ ] CodeLens shows "Migrate to Playwright" above each test function/describe block
- [ ] Clicking CodeLens shows a preview diff in a split pane
- [ ] Diagnostics (yellow squiggles) on Selenium/Cypress/WDIO/Appium API calls with "Playwright equivalent: ..." hover info
- [ ] Quick Fix actions for each diagnostic: apply single transform
- [ ] "Migrate File" command in command palette: transforms entire file, shows diff, asks for confirmation
- [ ] "Migrate Project" command: spawns a terminal running `automigrate` CLI with full pipeline, output visible in integrated terminal
- [ ] Status bar shows: detected framework + migration readiness score
- [ ] Extension activates only when source framework dependencies are detected in `package.json` / `pom.xml` / `requirements.txt`
- [ ] Extension reads `.automigrate.config.ts` for settings

### US-019: Selector Strategy — Best Practice Upgrades

**Description:** As a user choosing `best-practice` selector strategy, I want automigrate to intelligently upgrade selectors to Playwright's recommended locators.

**Acceptance Criteria:**

- [ ] `#id` selectors -> `page.getByTestId('id')` when the id looks like a test identifier
- [ ] `[data-testid="x"]` selectors -> `page.getByTestId('x')`
- [ ] `[role="button"]` and similar -> `page.getByRole('button')`
- [ ] Text-based selectors -> `page.getByText('...')` or `page.getByLabel('...')`
- [ ] Form elements with labels -> `page.getByLabel('...')`
- [ ] Placeholder-based -> `page.getByPlaceholder('...')`
- [ ] Alt text on images -> `page.getByAltText('...')`
- [ ] Title attributes -> `page.getByTitle('...')`
- [ ] Complex CSS/XPath preserved with `page.locator()` and a TODO comment suggesting upgrade
- [ ] Confidence scoring per selector: high (role/testid), medium (text/label), low (css/xpath preserved)
- [ ] > =10 unit tests for selector upgrades

### US-020: npm Package Publishing Readiness

**Description:** As a maintainer, I want automigrate ready for npm publish with proper packaging, docs, and CI.

**Acceptance Criteria:**

- [ ] `package.json` metadata complete: description, keywords, repository, homepage, bugs, license, engines
- [ ] `tsup` build produces clean ESM + CJS bundles with type declarations
- [ ] `bin` entry works: `npx automigrate --help` shows usage
- [ ] `README.md` updated with all new features (WebdriverIO, Robot Framework, Python output, watch mode, project scaffolding)
- [ ] `CHANGELOG.md` created with v0.1.0 initial release notes
- [ ] `LICENSE` file (MIT) present
- [ ] `.npmignore` or `files` field ensures only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md` are published
- [ ] `prepublishOnly` script runs build + typecheck + tests
- [ ] GitHub Actions CI workflow: lint, typecheck, test on Node 18/20/22
- [ ] Package size is reasonable (<5MB published)

## Functional Requirements

- FR-1: The tool must auto-detect the source framework and language from project files without user intervention
- FR-2: The tool must support `--framework` and `--language` flags to override auto-detection
- FR-3: The tool must never modify source files — all output goes to the specified output directory
- FR-4: Dry-run must be the default mode; `--no-dry-run` required to write files
- FR-5: Every transformation must have a confidence score (high/medium/low) attached
- FR-6: Low-confidence transformations must include `// TODO: automigrate` comments with migration suggestions
- FR-7: The tool must handle mixed-framework projects (different frameworks in different subdirectories)
- FR-8: The tool must support custom transformation rules via the plugin API
- FR-9: The tool must generate valid, runnable Playwright code — no syntax errors in output
- FR-10: The migration guide must be generated alongside the migrated code in every non-dry-run migration
- FR-11: Watch mode must only re-process changed files, not the entire project
- FR-12: Watch mode must support `--filter <glob>` to scope watched files
- FR-13: The VSCode extension must not activate in projects without detectable test frameworks
- FR-14: The VSCode "Migrate Project" command must spawn a terminal with `automigrate` CLI
- FR-15: Python output must follow PEP 8 conventions and include type hints
- FR-16: Robot Framework variable files (`.py`, `.yaml`) must be fully parsed and variable values resolved for use in transformations

## Non-Goals (Out of Scope)

- **Runtime test execution** — automigrate does not run or validate migrated tests; it generates code only
- **Visual regression testing migration** — tools like Percy, Applitools, BackstopJS are not covered
- **Performance/load testing migration** — JMeter, Gatling, k6 are not covered
- **API testing migration** — REST Assured, Postman, Karate are not covered
- **Mobile native app testing** — XCUITest, Espresso direct (non-Appium) are not covered
- **Ruby/Capybara support** — deferred to future release
- **Kotlin parser** — deferred to future release
- **Web dashboard UI** — CLI and VSCode extension only for v1.0
- **Docker image packaging** — deferred to future release
- **Paid/SaaS features** — this is an open-source CLI tool
- **Automatic test validation** — the tool does not run Playwright tests to verify correctness

## Technical Considerations

- **Tree-sitter** is used for Java, Python, C# parsing; **Babel** for JS/TS. Robot Framework will need a custom parser (no Tree-sitter grammar available — use regex-based section parsing)
- **Dependency graph** (`dependency-graph.ts`) already exists for class hierarchy resolution — extend it for Robot Framework resource file chains and variable file resolution
- **Code generator** currently assumes JS/TS output — needs refactoring to support Python output without duplicating all generation logic (strategy pattern or template-based)
- **Watch mode** should use `chokidar` (proven cross-platform file watcher) rather than `node:fs.watch` (inconsistent across OSes)
- **VSCode extension** at `vscode-extension/` has codelens and diagnostics started — extend, don't rewrite. "Migrate Project" uses `vscode.window.createTerminal()` to spawn CLI
- **Plugin API** (`AutomigratePlugin`) may need new hooks: `beforeFileTransform`, `afterFileTransform` for per-file customization
- **Performance**: large projects (1000+ test files) should complete analysis in <30s. Use streaming and worker threads if needed
- **Tree-sitter native modules** may fail on some platforms — provide fallback regex parsing with degraded accuracy

## Success Metrics

- All 20 user stories implemented and passing quality gates
- > =200 unit tests total (currently 171, adding ~80+ new)
- Zero failing tests in CI
- Successfully migrates the `tests/fixtures/` samples from all 6+ source frameworks
- Migration guide generated for every test run contains all 9 sections
- `npx automigrate --help` works after `npm publish` to registry
- VSCode extension installs and activates correctly in a sample project

## Open Questions

- For Python Playwright output with pytest, should we generate `conftest.py` fixtures for every page object or use a simpler class-based import pattern?
- Should the CI pipeline migration attempt to detect and migrate environment-specific configs (staging URLs, credentials handling) or just generate a template?
