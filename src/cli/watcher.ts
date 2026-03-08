/**
 * Watch mode for incremental migration (US-014).
 * Watches source directory for changes and re-migrates affected files.
 */

import chokidar from 'chokidar';
import { resolve, relative } from 'node:path';
import { MigrationEngine } from '../core/migration-engine.js';
import type { MigrationConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('watcher');

export interface WatcherOptions {
  config: MigrationConfig;
  filter?: string;
  onFileChange?: (event: WatchEvent) => void;
  onError?: (error: Error) => void;
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  relativePath: string;
  timestamp: Date;
}

export interface WatcherState {
  isRunning: boolean;
  filesWatched: number;
  lastChange: Date | null;
  pendingFiles: string[];
  migrationsRun: number;
}

export class MigrationWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private state: WatcherState = {
    isRunning: false,
    filesWatched: 0,
    lastChange: null,
    pendingFiles: [],
    migrationsRun: 0,
  };
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private options: WatcherOptions;

  constructor(options: WatcherOptions) {
    this.options = options;
  }

  getState(): WatcherState {
    return { ...this.state };
  }

  async start(): Promise<void> {
    if (this.state.isRunning) {
      log.warn('Watcher is already running');
      return;
    }

    const { config, filter } = this.options;
    const sourceDir = resolve(config.sourceDir);

    const watchGlob = filter ?? config.includePatterns.map((p) => `${sourceDir}/${p}`);

    log.info(`Watching ${sourceDir} for changes...`);

    this.watcher = chokidar.watch(watchGlob, {
      cwd: sourceDir,
      ignored: config.excludePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    await new Promise<void>((resolveReady, reject) => {
      this.watcher!.on('add', (path) => this.handleEvent('add', path))
        .on('change', (path) => this.handleEvent('change', path))
        .on('unlink', (path) => this.handleEvent('unlink', path))
        .on('error', (error) => {
          log.error(`Watcher error: ${error.message}`);
          this.options.onError?.(error);
          reject(error);
        })
        .on('ready', () => {
          const watched = this.watcher!.getWatched();
          this.state.filesWatched = Object.values(watched).reduce(
            (sum, files) => sum + files.length,
            0,
          );
          this.state.isRunning = true;
          log.info(`Watching ${this.state.filesWatched} files. Press Ctrl+C to stop.`);
          resolveReady();
        });
    });
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.state.isRunning = false;
    log.info('Watcher stopped');
  }

  private handleEvent(type: WatchEvent['type'], filePath: string): void {
    const sourceDir = resolve(this.options.config.sourceDir);
    const relativePath = relative(sourceDir, resolve(sourceDir, filePath));

    const event: WatchEvent = {
      type,
      path: filePath,
      relativePath,
      timestamp: new Date(),
    };

    this.state.lastChange = event.timestamp;
    this.options.onFileChange?.(event);

    if (type === 'unlink') {
      log.info(`File deleted: ${relativePath}`);
      return;
    }

    // Debounce: collect changes and run migration after 500ms of inactivity
    if (!this.state.pendingFiles.includes(relativePath)) {
      this.state.pendingFiles.push(relativePath);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.runMigration();
    }, 500);
  }

  private async runMigration(): Promise<void> {
    const pending = [...this.state.pendingFiles];
    this.state.pendingFiles = [];

    if (pending.length === 0) return;

    log.info(`Migrating ${pending.length} changed file(s): ${pending.join(', ')}`);

    try {
      const engine = new MigrationEngine(this.options.config);
      const report = await engine.migrate();
      this.state.migrationsRun++;

      const succeeded = report.results.filter((r) => r.status === 'success').length;
      const failed = report.results.filter((r) => r.status === 'failed').length;

      log.info(
        `Migration #${this.state.migrationsRun} complete: ` +
          `${succeeded} succeeded, ${failed} failed`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Migration failed: ${msg}`);
      this.options.onError?.(err instanceof Error ? err : new Error(msg));
    }
  }
}
