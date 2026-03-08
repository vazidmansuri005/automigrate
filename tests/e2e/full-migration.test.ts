import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MigrationEngine } from '../../src/core/migration-engine.js';

const SAMPLE_SELENIUM_JAVA = `
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.junit.Test;
import org.junit.After;
import org.junit.Before;

public class LoginTest {
    private WebDriver driver;

    @Before
    public void setUp() {
        driver = new ChromeDriver();
        driver.get("https://example.com/login");
    }

    @Test
    public void testLoginWithValidCredentials() {
        WebElement username = driver.findElement(By.id("username"));
        username.sendKeys("testuser");

        WebElement password = driver.findElement(By.id("password"));
        password.sendKeys("password123");

        WebElement loginButton = driver.findElement(By.cssSelector("button[type='submit']"));
        loginButton.click();

        WebElement welcome = driver.findElement(By.className("welcome-message"));
        String text = welcome.getText();
        assert text.contains("Welcome");
    }

    @After
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
`;

describe('Full Migration E2E', () => {
  let sourceDir: string;
  let outputDir: string;

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'automigrate-e2e-src-'));
    outputDir = await mkdtemp(join(tmpdir(), 'automigrate-e2e-out-'));
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it('should migrate a Selenium Java test to Playwright TypeScript', async () => {
    // Write a sample Selenium Java test file
    await writeFile(join(sourceDir, 'LoginTest.java'), SAMPLE_SELENIUM_JAVA, 'utf-8');

    const engine = new MigrationEngine({
      sourceDir,
      outputDir,
      targetLanguage: 'typescript',
      dryRun: false,
      preserveOriginal: true,
      generatePageObjects: false,
      generateFixtures: false,
      includePatterns: ['**/*.java'],
      excludePatterns: [],
      selectorStrategy: 'modernize',
      waitStrategy: 'auto-wait',
      assertionStyle: 'expect',
      parallel: false,
      maxConcurrency: 1,
      verbose: false,
    });

    const report = await engine.migrate();

    // The engine should have processed the file
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.duration).toBeGreaterThan(0);
    expect(report.timestamp).toBeTruthy();

    // At least one result should not be failed
    const nonFailed = report.results.filter((r) => r.status !== 'failed');
    expect(nonFailed.length).toBeGreaterThan(0);

    // Check that output files were written
    const outputFiles = await readdir(outputDir, { recursive: true });
    expect(outputFiles.length).toBeGreaterThan(0);

    // Find a generated TypeScript file and verify it contains Playwright patterns
    const tsFiles = outputFiles.filter((f) => String(f).endsWith('.ts'));
    expect(tsFiles.length).toBeGreaterThan(0);

    const generatedContent = await readFile(join(outputDir, String(tsFiles[0])), 'utf-8');
    // Should contain Playwright imports or patterns
    expect(generatedContent).toMatch(/playwright|page\.|locator|getBy/i);
  });

  it('should produce a report in dry-run mode without writing files', async () => {
    await writeFile(join(sourceDir, 'LoginTest.java'), SAMPLE_SELENIUM_JAVA, 'utf-8');

    const engine = new MigrationEngine({
      sourceDir,
      outputDir,
      targetLanguage: 'typescript',
      dryRun: true,
      preserveOriginal: true,
      generatePageObjects: false,
      generateFixtures: false,
      includePatterns: ['**/*.java'],
      excludePatterns: [],
      selectorStrategy: 'preserve',
      waitStrategy: 'auto-wait',
      assertionStyle: 'expect',
      parallel: false,
      maxConcurrency: 1,
      verbose: false,
    });

    const report = await engine.migrate();

    expect(report.results.length).toBeGreaterThan(0);

    // Output directory should be empty (dry-run)
    const outputFiles = await readdir(outputDir);
    expect(outputFiles.length).toBe(0);

    // But the report should still contain generated code
    const withCode = report.results.filter((r) => r.generatedCode);
    expect(withCode.length).toBeGreaterThan(0);
  });

  it('should throw when sourceDir equals outputDir', () => {
    expect(() => {
      new MigrationEngine({
        sourceDir,
        outputDir: sourceDir,
        targetLanguage: 'typescript',
        dryRun: true,
        preserveOriginal: true,
        generatePageObjects: false,
        generateFixtures: false,
        includePatterns: ['**/*.java'],
        excludePatterns: [],
        selectorStrategy: 'preserve',
        waitStrategy: 'auto-wait',
        assertionStyle: 'expect',
        parallel: false,
        maxConcurrency: 1,
        verbose: false,
      });
    }).toThrow(/outputDir.*must be different.*sourceDir/);
  });
});
