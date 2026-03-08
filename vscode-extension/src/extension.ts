import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { AutomigrateDiagnostics } from './diagnostics';
import { AutomigrateCodeLensProvider } from './codelens';
import { AutomigrateStatusBar } from './statusbar';

const execAsync = promisify(exec);

let outputChannel: vscode.OutputChannel;
let diagnosticsProvider: AutomigrateDiagnostics;
let statusBar: AutomigrateStatusBar;

export function activate(context: vscode.ExtensionContext): void {
  // Check if this workspace has test framework dependencies
  if (!shouldActivate()) {
    return;
  }

  outputChannel = vscode.window.createOutputChannel('Automigrate');

  diagnosticsProvider = new AutomigrateDiagnostics(context);
  statusBar = new AutomigrateStatusBar();

  const codeLensProvider = new AutomigrateCodeLensProvider();
  const codeLensRegistration = vscode.languages.registerCodeLensProvider(
    [
      { language: 'javascript' },
      { language: 'typescript' },
      { language: 'java' },
      { language: 'python' },
      { language: 'csharp' },
    ],
    codeLensProvider,
  );

  context.subscriptions.push(
    outputChannel,
    codeLensRegistration,
    statusBar,
    vscode.commands.registerCommand('automigrate.analyzeFile', analyzeFile),
    vscode.commands.registerCommand('automigrate.migrateFile', migrateFile),
    vscode.commands.registerCommand('automigrate.migrateFolder', migrateFolder),
    vscode.commands.registerCommand('automigrate.migrateProject', migrateProject),
    vscode.commands.registerCommand('automigrate.previewDiff', previewDiff),
    vscode.commands.registerCommand('automigrate.interactive', interactive),
    vscode.commands.registerCommand('automigrate.migrateLine', migrateLine),
  );

  // Load .automigrate.config.ts settings if present
  loadConfigFile();

  outputChannel.appendLine('Automigrate extension activated.');
}

export function deactivate(): void {
  if (diagnosticsProvider) {
    diagnosticsProvider.dispose();
  }
  if (statusBar) {
    statusBar.dispose();
  }
}

function getConfig(): {
  targetLanguage: string;
  selectorStrategy: string;
  waitStrategy: string;
  outputDir: string;
  dryRun: boolean;
} {
  const config = vscode.workspace.getConfiguration('automigrate');
  return {
    targetLanguage: config.get<string>('targetLanguage', 'typescript'),
    selectorStrategy: config.get<string>('selectorStrategy', 'preserve'),
    waitStrategy: config.get<string>('waitStrategy', 'auto-wait'),
    outputDir: config.get<string>('outputDir', './playwright-tests'),
    dryRun: config.get<boolean>('dryRun', true),
  };
}

function buildCliArgs(): string {
  const config = getConfig();
  const args: string[] = [];
  args.push(`--target-language ${config.targetLanguage}`);
  args.push(`--selector-strategy ${config.selectorStrategy}`);
  args.push(`--wait-strategy ${config.waitStrategy}`);
  args.push(`--output-dir ${config.outputDir}`);
  if (config.dryRun) {
    args.push('--dry-run');
  }
  return args.join(' ');
}

async function runCli(command: string, cwd: string): Promise<string> {
  const fullCommand = `npx automigrate ${command}`;
  outputChannel.appendLine(`> ${fullCommand}`);
  outputChannel.appendLine(`  cwd: ${cwd}`);
  outputChannel.show(true);

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr) {
      outputChannel.appendLine(`[stderr] ${stderr}`);
    }

    outputChannel.appendLine(stdout);
    return stdout;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[error] ${message}`);
    throw error;
  }
}

function getActiveFilePath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active file open.');
    return undefined;
  }
  return editor.document.uri.fsPath;
}

function getWorkspaceFolder(filePath: string): string {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  return folder ? folder.uri.fsPath : path.dirname(filePath);
}

async function analyzeFile(): Promise<void> {
  const filePath = getActiveFilePath();
  if (!filePath) {
    return;
  }

  const cwd = getWorkspaceFolder(filePath);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Automigrate: Analyzing file...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await runCli(`analyze "${filePath}" ${buildCliArgs()}`, cwd);

        outputChannel.appendLine('\n--- Analysis Complete ---');
        outputChannel.appendLine(result);
        outputChannel.show(true);

        vscode.window.showInformationMessage(
          'Analysis complete. See Automigrate output for details.',
        );
      } catch {
        vscode.window.showErrorMessage(
          'Analysis failed. Check the Automigrate output channel for details.',
        );
      }
    },
  );
}

async function migrateFile(): Promise<void> {
  const filePath = getActiveFilePath();
  if (!filePath) {
    return;
  }

  const cwd = getWorkspaceFolder(filePath);
  const config = getConfig();

  if (!config.dryRun) {
    const confirm = await vscode.window.showWarningMessage(
      `This will write migrated files to "${config.outputDir}". Continue?`,
      'Yes',
      'No',
    );
    if (confirm !== 'Yes') {
      return;
    }
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Automigrate: Migrating file...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await runCli(`migrate "${filePath}" ${buildCliArgs()}`, cwd);

        outputChannel.appendLine('\n--- Migration Complete ---');
        outputChannel.appendLine(result);
        outputChannel.show(true);

        if (config.dryRun) {
          // Show the diff in a new editor tab
          const doc = await vscode.workspace.openTextDocument({
            content: result,
            language: 'diff',
          });
          await vscode.window.showTextDocument(doc, { preview: true });
        } else {
          vscode.window.showInformationMessage(
            `Migration complete. Output written to ${config.outputDir}.`,
          );
        }
      } catch {
        vscode.window.showErrorMessage(
          'Migration failed. Check the Automigrate output channel for details.',
        );
      }
    },
  );
}

async function migrateFolder(): Promise<void> {
  const folders = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Select folder to migrate',
  });

  if (!folders || folders.length === 0) {
    return;
  }

  const folderPath = folders[0].fsPath;
  const cwd = getWorkspaceFolder(folderPath);
  const config = getConfig();

  if (!config.dryRun) {
    const confirm = await vscode.window.showWarningMessage(
      `This will migrate all test files in "${folderPath}" to "${config.outputDir}". Continue?`,
      'Yes',
      'No',
    );
    if (confirm !== 'Yes') {
      return;
    }
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Automigrate: Migrating folder...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await runCli(`migrate "${folderPath}" ${buildCliArgs()}`, cwd);

        outputChannel.appendLine('\n--- Folder Migration Complete ---');
        outputChannel.appendLine(result);
        outputChannel.show(true);

        vscode.window.showInformationMessage(
          `Folder migration complete. See Automigrate output for details.`,
        );
      } catch {
        vscode.window.showErrorMessage(
          'Folder migration failed. Check the Automigrate output channel for details.',
        );
      }
    },
  );
}

async function previewDiff(): Promise<void> {
  const filePath = getActiveFilePath();
  if (!filePath) {
    return;
  }

  const cwd = getWorkspaceFolder(filePath);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Automigrate: Generating migration diff...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await runCli(`diff "${filePath}" ${buildCliArgs()}`, cwd);

        const originalUri = vscode.Uri.file(filePath);
        const migratedDoc = await vscode.workspace.openTextDocument({
          content: result,
          language: path.extname(filePath).replace('.', ''),
        });
        const migratedUri = migratedDoc.uri;

        const fileName = path.basename(filePath);
        await vscode.commands.executeCommand(
          'vscode.diff',
          originalUri,
          migratedUri,
          `${fileName} - Migration Preview`,
        );
      } catch {
        vscode.window.showErrorMessage(
          'Diff generation failed. Check the Automigrate output channel for details.',
        );
      }
    },
  );
}

async function interactive(): Promise<void> {
  const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Automigrate');

  terminal.show();
  terminal.sendText('npx automigrate interactive');
}

async function migrateProject(): Promise<void> {
  const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Automigrate');

  terminal.show();

  const config = getConfig();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';

  terminal.sendText(
    `npx automigrate migrate "${workspaceFolder}" ` +
      `--output "${config.outputDir}" ` +
      `--language ${config.targetLanguage} ` +
      `--selector-strategy ${config.selectorStrategy} ` +
      `--wait-strategy ${config.waitStrategy} ` +
      `--no-dry-run`,
  );
}

async function migrateLine(filePath: string, lineNumber: number): Promise<void> {
  const cwd = getWorkspaceFolder(filePath);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Automigrate: Migrating line ${lineNumber + 1}...`,
      cancellable: false,
    },
    async () => {
      try {
        const result = await runCli(
          `migrate "${filePath}" --line ${lineNumber + 1} ${buildCliArgs()}`,
          cwd,
        );

        const doc = await vscode.workspace.openTextDocument({
          content: result,
          language: 'diff',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        vscode.window.showErrorMessage(
          'Line migration failed. Check the Automigrate output channel for details.',
        );
      }
    },
  );
}

/**
 * Check if extension should activate based on workspace dependencies.
 * Looks for test framework dependencies in package.json, pom.xml, requirements.txt, etc.
 */
function shouldActivate(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return false;

  for (const folder of workspaceFolders) {
    const root = folder.uri.fsPath;

    // Check package.json for JS/TS frameworks
    const packageJsonPath = path.join(root, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        const frameworkDeps = [
          'selenium-webdriver',
          'cypress',
          'puppeteer',
          'puppeteer-core',
          'appium',
          'webdriverio',
          '@wdio/cli',
          '@wdio/globals',
        ];
        if (frameworkDeps.some((dep) => dep in allDeps)) {
          return true;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check pom.xml for Java Selenium/Appium
    if (fs.existsSync(path.join(root, 'pom.xml'))) {
      try {
        const pomContent = fs.readFileSync(path.join(root, 'pom.xml'), 'utf-8');
        if (/selenium|appium|cucumber/i.test(pomContent)) {
          return true;
        }
      } catch {
        // Ignore
      }
    }

    // Check requirements.txt for Python Selenium
    const requirementsPath = path.join(root, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      try {
        const reqContent = fs.readFileSync(requirementsPath, 'utf-8');
        if (/selenium|appium|behave/i.test(reqContent)) {
          return true;
        }
      } catch {
        // Ignore
      }
    }

    // Check for wdio.conf or cypress.config
    if (
      fs.existsSync(path.join(root, 'wdio.conf.js')) ||
      fs.existsSync(path.join(root, 'wdio.conf.ts')) ||
      fs.existsSync(path.join(root, 'cypress.config.js')) ||
      fs.existsSync(path.join(root, 'cypress.config.ts'))
    ) {
      return true;
    }

    // Check for .automigrate.config.ts (explicit opt-in)
    if (
      fs.existsSync(path.join(root, '.automigrate.config.ts')) ||
      fs.existsSync(path.join(root, '.automigrate.config.js'))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Load settings from .automigrate.config.ts if present.
 * Falls back to VS Code settings.
 */
function loadConfigFile(): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return;

  const configFiles = [
    '.automigrate.config.ts',
    '.automigrate.config.js',
    '.automigrate.config.json',
  ];

  for (const configFile of configFiles) {
    const configPath = path.join(workspaceFolder, configFile);
    if (fs.existsSync(configPath)) {
      outputChannel.appendLine(`Found config: ${configPath}`);

      // For JSON configs, load directly
      if (configFile.endsWith('.json')) {
        try {
          const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          applyConfigOverrides(fileConfig);
        } catch (err) {
          outputChannel.appendLine(`Failed to parse ${configFile}: ${err}`);
        }
      } else {
        outputChannel.appendLine(
          `Note: ${configFile} detected. TS/JS configs are used by the CLI; ` +
            `VS Code settings are used for extension preferences.`,
        );
      }
      return;
    }
  }
}

function applyConfigOverrides(fileConfig: Record<string, unknown>): void {
  const vsConfig = vscode.workspace.getConfiguration('automigrate');

  if (fileConfig.targetLanguage && typeof fileConfig.targetLanguage === 'string') {
    vsConfig.update(
      'targetLanguage',
      fileConfig.targetLanguage,
      vscode.ConfigurationTarget.Workspace,
    );
  }
  if (fileConfig.selectorStrategy && typeof fileConfig.selectorStrategy === 'string') {
    vsConfig.update(
      'selectorStrategy',
      fileConfig.selectorStrategy,
      vscode.ConfigurationTarget.Workspace,
    );
  }
  if (fileConfig.waitStrategy && typeof fileConfig.waitStrategy === 'string') {
    vsConfig.update('waitStrategy', fileConfig.waitStrategy, vscode.ConfigurationTarget.Workspace);
  }
  if (fileConfig.outputDir && typeof fileConfig.outputDir === 'string') {
    vsConfig.update('outputDir', fileConfig.outputDir, vscode.ConfigurationTarget.Workspace);
  }
}
