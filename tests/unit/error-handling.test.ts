import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { MigrationEngine } from '../../src/core/migration-engine.js';
import { scanProject } from '../../src/core/analyzers/framework-detector.js';
import { DependencyGraphBuilder } from '../../src/core/analyzers/dependency-graph.js';
import type { MigrationConfig } from '../../src/types/index.js';

const TEMP_DIR = resolve(__dirname, '../__error_handling_fixtures__');
const OUTPUT_DIR = resolve(__dirname, '../__error_handling_output__');

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: TEMP_DIR,
    outputDir: OUTPUT_DIR,
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java', '**/*.js', '**/*.ts', '**/*.py', '**/*.bin'],
    excludePatterns: ['**/node_modules/**'],
    selectorStrategy: 'preserve',
    waitStrategy: 'auto-wait',
    assertionStyle: 'expect',
    parallel: false,
    maxConcurrency: 1,
    verbose: false,
    ...overrides,
  };
}

beforeAll(() => {
  // Create temp fixture directory with various edge-case files
  mkdirSync(TEMP_DIR, { recursive: true });

  // 1. Binary file (PNG-like header with null bytes)
  const binaryContent = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  writeFileSync(join(TEMP_DIR, 'image.java'), binaryContent);

  // 2. Valid Selenium Java test
  writeFileSync(
    join(TEMP_DIR, 'ValidTest.java'),
    `import org.openqa.selenium.WebDriver;
import org.openqa.selenium.By;

public class ValidTest {
  public void testLogin() {
    driver.findElement(By.id("username")).sendKeys("admin");
    driver.findElement(By.id("password")).sendKeys("pass");
    driver.findElement(By.id("login")).click();
  }
}
`,
  );

  // 3. A file with syntax that will be parseable but has odd content
  writeFileSync(
    join(TEMP_DIR, 'EmptyTest.java'),
    `import org.openqa.selenium.WebDriver;

public class EmptyTest {
}
`,
  );

  // 4. File with null byte embedded in text (should be detected as binary)
  const mixedContent = Buffer.from(
    'import org.openqa.selenium.WebDriver;\x00\npublic class Broken {}',
  );
  writeFileSync(join(TEMP_DIR, 'MixedBinary.java'), mixedContent);
});

afterAll(() => {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe('Error Handling (US-017)', () => {
  it('should skip binary files silently during scan', async () => {
    const config = makeConfig();
    const files = await scanProject(config);

    const filePaths = files.map((f) => f.relativePath);
    // Binary files (image.java and MixedBinary.java) should be excluded
    expect(filePaths).not.toContain('image.java');
    expect(filePaths).not.toContain('MixedBinary.java');
    // Valid test should still be included
    expect(filePaths).toContain('ValidTest.java');
  });

  it('should not crash when source files fail to parse', async () => {
    const engine = new MigrationEngine(makeConfig());
    // This should complete without throwing even if some files have issues
    const report = await engine.migrate();
    expect(report).toBeDefined();
    expect(report.results).toBeDefined();
  });

  it('should detect circular inheritance and break the cycle', () => {
    const builder = new DependencyGraphBuilder();
    const graph = builder.buildFromFiles([
      {
        path: 'A.java',
        content: `
public class A extends B {
  public void doSomething() {
    driver.findElement(By.id("test"));
  }
}`,
      },
      {
        path: 'B.java',
        content: `
public class B extends C {
  public void doOther() {}
}`,
      },
      {
        path: 'C.java',
        content: `
public class C extends A {
  public void doMore() {}
}`,
      },
    ]);

    // Should not crash and should have all three classes
    expect(graph.classes.size).toBe(3);
    // Inheritance chains should exist but be finite (cycle broken)
    const chainA = graph.inheritanceChains.get('A');
    expect(chainA).toBeDefined();
    // The chain should contain A, B, C but NOT loop infinitely
    expect(chainA!.length).toBeLessThanOrEqual(3);
  });

  it('should handle empty source directory gracefully', async () => {
    const emptyDir = join(TEMP_DIR, 'empty_subdir');
    mkdirSync(emptyDir, { recursive: true });

    const engine = new MigrationEngine(makeConfig({ sourceDir: emptyDir }));
    const result = await engine.analyze();
    expect(result).toBeDefined();
    expect(result.files).toHaveLength(0);
    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].message).toContain('No test files found');
  });

  it('should report failed transforms without crashing the entire migration', async () => {
    const engine = new MigrationEngine(makeConfig());
    const report = await engine.migrate();

    // The engine should produce a report with results for processable files
    expect(report).toBeDefined();
    expect(report.summary).toBeDefined();
    // Total files in report should be > 0 (at least ValidTest.java)
    expect(report.results.length).toBeGreaterThan(0);
  });

  it('should provide user-friendly error for safety violation', () => {
    expect(() => {
      new MigrationEngine(makeConfig({ sourceDir: '/tmp/same', outputDir: '/tmp/same' }));
    }).toThrow(/Safety error.*outputDir.*must be different.*sourceDir/);
  });

  it('should handle non-existent source directory without raw stack trace', async () => {
    const engine = new MigrationEngine(
      makeConfig({ sourceDir: '/tmp/nonexistent_automigrate_test_dir' }),
    );
    // Should not throw raw stack trace — should return empty result
    const result = await engine.analyze();
    expect(result).toBeDefined();
    expect(result.files).toHaveLength(0);
  });
});
