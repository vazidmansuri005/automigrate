# Contributing to automigrate

Thank you for your interest in contributing to automigrate. This guide will help you get started.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.x
- **Git**

## Development Setup

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/<your-username>/automigrate.git
cd automigrate
```

2. Install dependencies:

```bash
npm install
```

3. Start the development build (watches for changes):

```bash
npm run dev
```

4. Run the CLI locally:

```bash
npm run cli -- --help
```

## Project Structure

```
src/
  cli/                    # CLI entry point, interactive prompts, file watcher
    index.ts              # Main CLI entry (commander-based)
    interactive.ts        # Interactive migration wizard
    guided.ts             # Guided migration flow
    watcher.ts            # File watcher for incremental migration
  core/
    analyzers/            # Source code analysis
      framework-detector.ts   # Detects source framework (Selenium, Cypress, etc.)
      complexity-estimator.ts # Estimates migration complexity
      structure-analyzer.ts   # Analyzes test suite structure
      dependency-graph.ts     # Maps dependencies between test files
    parsers/              # Language-specific AST parsers
      base-parser.ts      # Abstract parser interface
      javascript-parser.ts
      java-parser.ts
      python-parser.ts
      csharp-parser.ts
      robot-parser.ts
      gherkin-parser.ts
    transformers/         # Code transformation logic
      transformer.ts      # Core transformation engine
    generators/           # Output generation
      code-generator.ts       # Generates Playwright test code
      config-generator.ts     # Generates playwright.config.ts
      dependency-generator.ts # Generates package.json updates
      ci-generator.ts         # Generates CI/CD config (GitHub Actions, etc.)
      guide-generator.ts      # Generates migration guide docs
      playwright-idioms.ts    # Playwright best-practice patterns
    reporters/            # Migration reporting
      migration-reporter.ts   # Progress and summary reports
    migration-engine.ts   # Orchestrates the full migration pipeline
  mappings/               # Framework-to-Playwright API mappings
    selenium-to-playwright.ts
    cypress-to-playwright.ts
    puppeteer-to-playwright.ts
    appium-to-playwright.ts
    webdriverio-to-playwright.ts
    robot-to-playwright.ts
  config/                 # Configuration loading
    loader.ts             # Cosmiconfig-based config resolution
    defaults.ts           # Default configuration values
  utils/                  # Shared utilities
    logger.ts             # Winston-based logging
    diff-generator.ts     # Generates before/after diffs
  types/
    index.ts              # Shared TypeScript type definitions
  index.ts                # Public API entry point
tests/                    # Test suites (mirrors src/ structure)
```

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage report
npm run test:coverage

# Run end-to-end tests
npm run test:e2e
```

## Linting and Formatting

```bash
# Check for lint errors
npm run lint

# Auto-fix lint errors
npm run lint:fix

# Format code with Prettier
npm run format

# Type-check without emitting
npm run typecheck
```

## Commit Message Format

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must be structured as:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:**

| Type       | When to use                                        |
| ---------- | -------------------------------------------------- |
| `feat`     | A new feature or capability                        |
| `fix`      | A bug fix                                          |
| `docs`     | Documentation-only changes                         |
| `refactor` | Code restructuring without behavior change         |
| `test`     | Adding or updating tests                           |
| `chore`    | Build process, dependency updates, tooling changes |
| `perf`     | Performance improvements                           |

**Scope** (optional but encouraged): `cli`, `parser`, `mapping`, `transformer`, `generator`, `config`

**Examples:**

```
feat(mapping): add WebdriverIO element interaction mappings
fix(parser): handle async arrow functions in JavaScript parser
docs: update CONTRIBUTING with commit message guidelines
test(transformer): add edge case tests for chained locators
```

## Pull Request Process

1. **Fork and branch.** Create a feature branch from `main`:

   ```bash
   git checkout -b feat/my-feature main
   ```

2. **Keep PRs focused.** One logical change per PR. If your change touches multiple concerns, split it into separate PRs.

3. **Write tests.** All new features and bug fixes must include tests. Aim to maintain or improve code coverage.

4. **Run the full check suite before pushing:**

   ```bash
   npm run lint && npm run typecheck && npm run test:run
   ```

5. **Open your PR against `main`.** Fill out the PR template completely.

6. **Respond to review feedback.** Maintainers may request changes -- please address them or discuss alternatives.

## Adding New Framework Support

To add support for migrating from a new framework (e.g., TestCafe), follow this pattern:

### 1. Create the API mapping

Add `src/mappings/<framework>-to-playwright.ts`. This file defines the mapping between the source framework's API and Playwright equivalents. Use an existing mapping file as a reference.

### 2. Add or extend a parser

If the framework uses a language not yet supported, add a new parser in `src/core/parsers/`. All parsers must extend `BaseParser` from `base-parser.ts`.

If the framework uses an already-supported language (e.g., JavaScript), you may only need to update the framework detector.

### 3. Update the framework detector

Edit `src/core/analyzers/framework-detector.ts` to recognize the new framework's imports, configuration files, and dependency patterns.

### 4. Update the transformer

Extend `src/core/transformers/transformer.ts` to handle any framework-specific transformation logic that cannot be expressed purely through API mappings.

### 5. Write tests

- Unit tests for the new mapping
- Parser tests with real-world code samples
- Integration tests running a full migration on a sample project

### 6. Update documentation

Add the framework to the README's supported frameworks list.

## Code Review Expectations

- **Correctness**: Does the code do what it claims? Are edge cases handled?
- **Tests**: Are there sufficient tests? Do they cover failure modes?
- **Readability**: Is the code clear without excessive comments? Are names descriptive?
- **Consistency**: Does it follow the patterns established in the codebase?
- **No regressions**: Do existing tests still pass? Does the change affect other frameworks?

Reviewers will approve, request changes, or leave comments. All feedback is intended to improve the project and is not personal.

## Questions?

Open a [GitHub Discussion](https://github.com/automigrate-tool/automigrate/discussions) or file an issue. We are happy to help you get started.
