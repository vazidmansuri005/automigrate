/**
 * CI Pipeline Generator.
 * Detects source CI configs and generates equivalent Playwright CI pipelines.
 */

export type CIProvider =
  | 'github-actions'
  | 'gitlab-ci'
  | 'jenkins'
  | 'circleci'
  | 'azure-pipelines';

export interface CIDetectionResult {
  provider: CIProvider;
  configPath: string;
}

export interface CIGeneratorOptions {
  targetLanguage: 'typescript' | 'javascript' | 'python';
  testCommand?: string;
  installCommand?: string;
}

/**
 * Detect which CI provider is used based on file patterns.
 */
export function detectCIProvider(files: string[]): CIDetectionResult | null {
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');

    if (normalized.includes('.github/workflows/') && normalized.endsWith('.yml')) {
      return { provider: 'github-actions', configPath: file };
    }
    if (normalized.endsWith('.gitlab-ci.yml')) {
      return { provider: 'gitlab-ci', configPath: file };
    }
    if (normalized.endsWith('Jenkinsfile')) {
      return { provider: 'jenkins', configPath: file };
    }
    if (normalized.includes('.circleci/config.yml')) {
      return { provider: 'circleci', configPath: file };
    }
    if (normalized.endsWith('azure-pipelines.yml')) {
      return { provider: 'azure-pipelines', configPath: file };
    }
  }
  return null;
}

/**
 * Generate a CI pipeline config for the detected or default provider.
 */
export function generateCIPipeline(
  provider: CIProvider,
  options: CIGeneratorOptions = { targetLanguage: 'typescript' },
): { path: string; content: string } {
  switch (provider) {
    case 'github-actions':
      return generateGitHubActions(options);
    case 'gitlab-ci':
      return generateGitLabCI(options);
    case 'jenkins':
      return generateJenkinsfile(options);
    case 'circleci':
      return generateCircleCI(options);
    case 'azure-pipelines':
      return generateAzurePipelines(options);
    default:
      return generateGitHubActions(options);
  }
}

function getTestCommand(options: CIGeneratorOptions): string {
  if (options.testCommand) return options.testCommand;
  return options.targetLanguage === 'python' ? 'pytest --browser chromium' : 'npx playwright test';
}

function getInstallCommand(options: CIGeneratorOptions): string {
  if (options.installCommand) return options.installCommand;
  return options.targetLanguage === 'python'
    ? 'pip install -r requirements.txt && playwright install --with-deps chromium'
    : 'npm ci && npx playwright install --with-deps';
}

function generateGitHubActions(options: CIGeneratorOptions): { path: string; content: string } {
  const testCmd = getTestCommand(options);
  const installCmd = getInstallCommand(options);
  const isPython = options.targetLanguage === 'python';

  const content = `name: Playwright Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest${
      isPython
        ? ''
        : `
    container:
      image: mcr.microsoft.com/playwright:v1.49.0-jammy`
    }

    steps:
      - uses: actions/checkout@v4
${
  isPython
    ? `
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
`
    : `
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
`
}
      - name: Install dependencies
        run: ${installCmd}

      - name: Run Playwright tests
        run: ${testCmd}

      - uses: actions/upload-artifact@v4
        if: \${{ !cancelled() }}
        with:
          name: playwright-report
          path: ${isPython ? 'test-results/' : 'playwright-report/'}
          retention-days: 30

      - uses: actions/upload-artifact@v4
        if: \${{ !cancelled() }}
        with:
          name: test-traces
          path: test-results/
          retention-days: 7
`;

  return { path: '.github/workflows/playwright.yml', content };
}

function generateGitLabCI(options: CIGeneratorOptions): { path: string; content: string } {
  const testCmd = getTestCommand(options);
  const installCmd = getInstallCommand(options);
  const isPython = options.targetLanguage === 'python';

  const content = `stages:
  - test

playwright-tests:
  stage: test
  image: ${isPython ? 'python:3.11' : 'mcr.microsoft.com/playwright:v1.49.0-jammy'}
  script:
    - ${installCmd}
    - ${testCmd}
  artifacts:
    when: always
    paths:
      - ${isPython ? 'test-results/' : 'playwright-report/'}
      - test-results/
    expire_in: 30 days
`;

  return { path: '.gitlab-ci.yml', content };
}

function generateJenkinsfile(options: CIGeneratorOptions): { path: string; content: string } {
  const testCmd = getTestCommand(options);
  const installCmd = getInstallCommand(options);
  const isPython = options.targetLanguage === 'python';

  const content = `pipeline {
    agent {
        docker {
            image '${isPython ? 'python:3.11' : 'mcr.microsoft.com/playwright:v1.49.0-jammy'}'
        }
    }

    stages {
        stage('Install') {
            steps {
                sh '${installCmd}'
            }
        }
        stage('Test') {
            steps {
                sh '${testCmd}'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: '${isPython ? 'test-results/**' : 'playwright-report/**'}, test-results/**', allowEmptyArchive: true
            publishHTML([
                reportDir: '${isPython ? 'test-results' : 'playwright-report'}',
                reportFiles: 'index.html',
                reportName: 'Playwright Report'
            ])
        }
    }
}
`;

  return { path: 'Jenkinsfile', content };
}

function generateCircleCI(options: CIGeneratorOptions): { path: string; content: string } {
  const testCmd = getTestCommand(options);
  const installCmd = getInstallCommand(options);
  const isPython = options.targetLanguage === 'python';

  const content = `version: 2.1

jobs:
  playwright-tests:
    docker:
      - image: ${isPython ? 'cimg/python:3.11' : 'mcr.microsoft.com/playwright:v1.49.0-jammy'}
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: ${installCmd}
      - run:
          name: Run Playwright tests
          command: ${testCmd}
      - store_artifacts:
          path: ${isPython ? 'test-results' : 'playwright-report'}
          destination: playwright-report
      - store_artifacts:
          path: test-results
          destination: test-traces

workflows:
  test:
    jobs:
      - playwright-tests
`;

  return { path: '.circleci/config.yml', content };
}

function generateAzurePipelines(options: CIGeneratorOptions): { path: string; content: string } {
  const testCmd = getTestCommand(options);
  const installCmd = getInstallCommand(options);
  const isPython = options.targetLanguage === 'python';

  const content = `trigger:
  - main
  - master

pool:
  vmImage: ubuntu-latest

${
  isPython
    ? `steps:
  - task: UsePythonVersion@0
    inputs:
      versionSpec: "3.11"
`
    : `container:
  image: mcr.microsoft.com/playwright:v1.49.0-jammy

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "20.x"
`
}
  - script: ${installCmd}
    displayName: Install dependencies

  - script: ${testCmd}
    displayName: Run Playwright tests

  - task: PublishTestResults@2
    condition: succeededOrFailed()
    inputs:
      testResultsFormat: JUnit
      testResultsFiles: test-results/results.xml

  - task: PublishPipelineArtifact@1
    condition: succeededOrFailed()
    inputs:
      targetPath: ${isPython ? 'test-results' : 'playwright-report'}
      artifact: playwright-report
`;

  return { path: 'azure-pipelines.yml', content };
}
