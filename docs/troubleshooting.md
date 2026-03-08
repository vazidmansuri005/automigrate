# Troubleshooting

## "No framework detected"

**Symptom:** automigrate reports 0 test files found or assigns very low confidence to files that contain valid tests.

**Cause:** The framework detector relies on import statements and API usage patterns to identify which framework a file belongs to. If a file does not contain recognizable imports (e.g., `import org.openqa.selenium`, `cy.get(`, `from selenium`), the detector cannot classify it.

**Solutions:**

- Verify that your test files have standard framework imports at the top of the file.
- Check that your `includePatterns` in the config cover the right file extensions. The defaults include `**/*.java`, `**/*.js`, `**/*.ts`, `**/*.py`, `**/*.cs`, `**/*.feature`, `**/*.robot`, and `**/*.resource`.
- If your tests use re-exported or wrapped imports (e.g., importing Selenium through a custom utility module), set `sourceFramework` explicitly in your config:
  ```typescript
  // .automigrate.config.ts
  export default {
    sourceFramework: 'selenium',
    sourceLanguage: 'java',
  };
  ```

## Parse errors

**Symptom:** Errors like `SyntaxError`, `Unexpected token`, or `Parse error` in the console output.

**Cause:** The source file has a syntax error that prevents the parser from building an AST. automigrate does not attempt to fix syntax errors in source files.

**Solutions:**

- Open the reported file and fix the syntax error. The error message includes the file path and often the line number.
- Verify the file compiles or runs successfully with its original framework before migrating.
- If the file uses language features that the parser does not support (e.g., very new ECMAScript proposals), consider transpiling it first or excluding it with `excludePatterns`.

## Binary files skipped

**Symptom:** Some files in your source directory are silently skipped.

**Explanation:** This is expected behavior. automigrate checks the first 8KB of each file for null bytes. If null bytes are found, the file is classified as binary and skipped. Common binary files that get skipped include images, compiled `.class` files, `.jar` archives, and `.pyc` bytecode.

No action is needed. Binary files are not test source code and cannot be migrated.

## Large file warnings

**Symptom:** Warning messages like `Large file detected: path/to/file.java (12,000 lines). Processing may be slow.`

**Explanation:** Files exceeding 10,000 lines trigger a warning because parsing and transformation take significantly longer. Files over 500 lines also receive lower readiness/confidence scores in the analysis report because large test files tend to have more complex patterns that require manual review.

**Solutions:**

- Consider splitting large test files into smaller, focused test suites before migrating.
- Use `--filter` or `includePatterns` to migrate large files separately from the rest of the project.
- Increase `maxConcurrency` in your config if you have available CPU cores (default is 4).

## Config file not found

**Symptom:** automigrate uses default settings instead of your custom configuration.

**Cause:** The config loader uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), which searches for configuration in the following locations (in order):

1. `automigrate` property in `package.json`
2. `.automigrate.config.ts`
3. `.automigrate.config.js`
4. `.automigrate.config.mjs`
5. `.automigrate.config.cjs`
6. `.automigrate.config.json`
7. `.automigrate.config.yaml`

**Solutions:**

- Ensure your config file is in the project root (the directory where you run `automigrate`).
- Check the file name matches one of the supported formats above.
- Use `--config <path>` on the CLI to explicitly specify the config file location.
- Verify the config file exports a valid object. For TypeScript configs:
  ```typescript
  // .automigrate.config.ts
  import type { MigrationConfig } from 'automigrate';
  export default {
    sourceDir: './tests',
    outputDir: './playwright-tests',
    targetLanguage: 'typescript',
  } satisfies Partial<MigrationConfig>;
  ```

## "0 files migrated"

**Symptom:** The migration completes but reports 0 files processed.

**Cause:** No files matched the combination of `includePatterns`, `excludePatterns`, and framework detection.

**Solutions:**

- Run `automigrate analyze` first to see what the tool detects in your source directory.
- Check `sourceDir` points to the correct directory. It should be the root of your test source code.
- Review `includePatterns` -- the defaults cover standard extensions, but if your tests use unusual extensions (e.g., `.spec.mjs`), add them explicitly.
- Review `excludePatterns` -- make sure they are not excluding your test directory. The defaults exclude `node_modules`, `dist`, `build`, `target`, `__pycache__`, and `.git`.
- If your tests do not import the framework directly (e.g., they rely on global variables injected by a test runner), set `sourceFramework` explicitly in the config.

## Memory issues with large repos

**Symptom:** Node.js crashes with `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory` or the process hangs.

**Cause:** Processing thousands of files simultaneously or very large individual files can exceed the default Node.js heap limit (typically 1.5-4 GB depending on the platform).

**Solutions:**

- Use `--filter` or narrow `includePatterns` to migrate a subset of files at a time:
  ```bash
  automigrate migrate --filter "src/tests/login/**"
  automigrate migrate --filter "src/tests/checkout/**"
  ```
- Reduce `maxConcurrency` to lower parallel parsing load:
  ```typescript
  // .automigrate.config.ts
  export default {
    maxConcurrency: 2,
  };
  ```
- Increase the Node.js heap size:
  ```bash
  NODE_OPTIONS="--max-old-space-size=8192" automigrate migrate
  ```
- Exclude non-test files that may have been accidentally included. Large utility libraries or generated code should be in `excludePatterns`.

## Transformation confidence is low

**Symptom:** Most files are reported as "partial" or "failed" with low confidence scores.

**Explanation:** Confidence reflects how many API calls in the file had matching transformation rules. Common reasons for low confidence:

- **Custom framework wrappers:** If your tests call Selenium/Cypress through a custom abstraction layer, the transformation rules will not match the wrapper methods.
- **Dynamic selectors:** Selectors built at runtime (e.g., `By.xpath(buildXpath(param))`) cannot be statically transformed.
- **Framework-specific features:** Some features (e.g., Cypress interceptors, Appium touch actions) have Playwright equivalents but require non-trivial restructuring.

**Solutions:**

- Write custom transformation rules via the plugin system for your wrapper methods.
- Review the `manualInterventions` in the report -- each one includes a suggestion for what to change.
- Use `automigrate diff` to preview changes before committing to a full migration.

## Diff output is empty

**Symptom:** Running `automigrate diff` produces no output.

**Cause:** Either no files were detected (see "0 files migrated" above) or the transformations produced identical output to the source (unlikely but possible if the source already uses Playwright-compatible patterns).

**Solutions:**

- Run `automigrate analyze` to confirm files are being detected.
- Check that `sourceFramework` is not set to a framework that does not match your files.
