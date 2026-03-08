# Automigrate - Playwright Migration Tool

A VS Code extension that integrates with the `automigrate` CLI to migrate Selenium, Cypress, Puppeteer, and Appium tests to Playwright.

## Features

### Inline Diagnostics

The extension scans your test files and highlights patterns from Selenium, Cypress, Puppeteer, and Appium that can be automatically migrated to Playwright. Diagnostics appear as informational squiggles with details about the Playwright equivalent.

<!-- ![Diagnostics Screenshot](images/diagnostics.png) -->

### CodeLens Integration

"Migrate to Playwright" and "Preview Migration" lenses appear above test blocks (`describe`, `it`, `@Test`, `def test_`, etc.) so you can migrate individual tests or entire files with a single click.

<!-- ![CodeLens Screenshot](images/codelens.png) -->

### Migration Diff Preview

Preview exactly what changes the migration will make before writing any files. The diff opens in a side-by-side editor view.

<!-- ![Diff Preview Screenshot](images/diff-preview.png) -->

### Interactive Migration Wizard

Launch the full interactive migration wizard directly in the VS Code integrated terminal.

<!-- ![Interactive Wizard Screenshot](images/interactive.png) -->

## Requirements

- **Node.js** 18 or later
- **automigrate** CLI installed globally or available via `npx`

  ```bash
  npm install -g automigrate
  ```

## Installation

### From VSIX

1. Download the `.vsix` file from the [Releases](https://github.com/user/automigrate/releases) page.
2. In VS Code, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. Run **Extensions: Install from VSIX...** and select the downloaded file.

### From Source

```bash
cd vscode-extension
npm install
npm run compile
# Then press F5 in VS Code to launch the Extension Development Host
```

## Commands

| Command                                     | Description                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Automigrate: Analyze Current File`         | Analyze the current file for migratable patterns and display a report in the output channel.               |
| `Automigrate: Migrate Current File`         | Migrate the current test file to Playwright. In dry-run mode, shows the diff; otherwise writes the output. |
| `Automigrate: Migrate Folder`               | Select a folder and migrate all test files within it.                                                      |
| `Automigrate: Preview Migration Diff`       | Generate and display a side-by-side diff of the current file vs. its migrated version.                     |
| `Automigrate: Interactive Migration Wizard` | Open the integrated terminal and launch the interactive migration wizard.                                  |

## Configuration

All settings are under the `automigrate.*` namespace.

| Setting                        | Type    | Default              | Description                                                                                          |
| ------------------------------ | ------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `automigrate.targetLanguage`   | string  | `typescript`         | Target language for migrated tests. Options: `typescript`, `javascript`, `python`, `csharp`, `java`. |
| `automigrate.selectorStrategy` | string  | `preserve`           | Selector conversion strategy. Options: `preserve`, `data-testid`, `role`, `text`, `css`.             |
| `automigrate.waitStrategy`     | string  | `auto-wait`          | Wait handling strategy. Options: `auto-wait`, `explicit`, `preserve`.                                |
| `automigrate.outputDir`        | string  | `./playwright-tests` | Output directory for migrated test files.                                                            |
| `automigrate.dryRun`           | boolean | `true`               | When enabled, shows migration preview without writing files.                                         |

## Supported Frameworks

The extension detects and offers migration for test files using:

- **Selenium WebDriver** (Java, JavaScript, TypeScript, Python, C#)
- **Cypress** (JavaScript, TypeScript)
- **Puppeteer** (JavaScript, TypeScript)
- **Appium** (Java, JavaScript, TypeScript, Python)

## Context Menu

Right-click a file or folder in the Explorer to access migration commands directly from the context menu.

## How It Works

1. The extension detects test files from supported frameworks by scanning for framework-specific imports and patterns.
2. Diagnostics highlight individual patterns that have Playwright equivalents.
3. CodeLens buttons appear above test blocks for one-click migration.
4. Quick Fix actions in the lightbulb menu offer "Migrate this line" or "Migrate this file".
5. All migration operations delegate to the `automigrate` CLI, which handles the actual code transformation.

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Package as VSIX
npm run package
```

## License

MIT
