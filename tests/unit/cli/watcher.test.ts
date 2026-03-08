import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { MigrationWatcher } from '../../../src/cli/watcher.js';
import type { MigrationConfig } from '../../../src/types/index.js';
import type { WatchEvent } from '../../../src/cli/watcher.js';

const TEMP_DIR = resolve(__dirname, '../../__watcher_fixtures__');
const OUTPUT_DIR = resolve(__dirname, '../../__watcher_output__');

function makeConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    sourceDir: TEMP_DIR,
    outputDir: OUTPUT_DIR,
    targetLanguage: 'typescript',
    dryRun: true,
    preserveOriginal: true,
    generatePageObjects: false,
    generateFixtures: false,
    includePatterns: ['**/*.java'],
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
  mkdirSync(TEMP_DIR, { recursive: true });
  writeFileSync(
    join(TEMP_DIR, 'LoginTest.java'),
    `import org.openqa.selenium.WebDriver;
import org.openqa.selenium.By;

public class LoginTest {
  public void testLogin() {
    driver.findElement(By.id("username")).sendKeys("admin");
  }
}
`,
  );
});

afterAll(() => {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
});

describe('MigrationWatcher (US-014)', () => {
  it('should initialize with correct default state', () => {
    const watcher = new MigrationWatcher({ config: makeConfig() });
    const state = watcher.getState();

    expect(state.isRunning).toBe(false);
    expect(state.filesWatched).toBe(0);
    expect(state.lastChange).toBeNull();
    expect(state.pendingFiles).toEqual([]);
    expect(state.migrationsRun).toBe(0);
  });

  it('should start and stop cleanly', async () => {
    const watcher = new MigrationWatcher({ config: makeConfig() });

    await watcher.start();
    const runningState = watcher.getState();
    expect(runningState.isRunning).toBe(true);

    await watcher.stop();
    const stoppedState = watcher.getState();
    expect(stoppedState.isRunning).toBe(false);
  });

  it('should detect file changes and emit events', async () => {
    const events: WatchEvent[] = [];

    const watcher = new MigrationWatcher({
      config: makeConfig(),
      onFileChange: (event) => {
        events.push(event);
      },
    });

    await watcher.start();

    // Wait for watcher to be ready
    await new Promise((r) => setTimeout(r, 500));

    // Modify a file
    writeFileSync(
      join(TEMP_DIR, 'LoginTest.java'),
      `import org.openqa.selenium.WebDriver;
import org.openqa.selenium.By;

public class LoginTest {
  public void testLogin() {
    driver.findElement(By.id("username")).sendKeys("updated");
  }
}
`,
    );

    // Wait for debounce to process
    await new Promise((r) => setTimeout(r, 1500));

    await watcher.stop();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe('change');
    expect(events[0].relativePath).toContain('LoginTest.java');
  });

  it('should detect new file additions', async () => {
    const events: WatchEvent[] = [];

    const watcher = new MigrationWatcher({
      config: makeConfig(),
      onFileChange: (event) => {
        events.push(event);
      },
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 500));

    // Add a new file
    const newFile = join(TEMP_DIR, 'NewTest.java');
    writeFileSync(
      newFile,
      `import org.openqa.selenium.By;
public class NewTest {
  public void test() {
    driver.findElement(By.id("btn")).click();
  }
}
`,
    );

    await new Promise((r) => setTimeout(r, 1500));
    await watcher.stop();

    // Cleanup
    if (existsSync(newFile)) unlinkSync(newFile);

    const addEvents = events.filter((e) => e.type === 'add');
    expect(addEvents.length).toBeGreaterThanOrEqual(1);
    expect(addEvents[0].relativePath).toContain('NewTest.java');
  });

  it('should track migration count in state', async () => {
    const watcher = new MigrationWatcher({
      config: makeConfig(),
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 500));

    // Trigger a change
    writeFileSync(
      join(TEMP_DIR, 'LoginTest.java'),
      `import org.openqa.selenium.WebDriver;
import org.openqa.selenium.By;
public class LoginTest {
  public void testLogin() {
    driver.findElement(By.id("username")).sendKeys("count test");
  }
}
`,
    );

    // Wait for debounced migration to complete
    await new Promise((r) => setTimeout(r, 2000));

    await watcher.stop();

    const state = watcher.getState();
    expect(state.migrationsRun).toBeGreaterThanOrEqual(1);
    expect(state.lastChange).not.toBeNull();
  });
});
