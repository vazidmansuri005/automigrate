import { describe, it, expect } from 'vitest';
import { detectCIProvider, generateCIPipeline } from '../../../src/core/generators/ci-generator.js';

describe('CI Provider Detection (US-012)', () => {
  it('should detect GitHub Actions from workflow files', () => {
    const result = detectCIProvider(['src/test.ts', '.github/workflows/test.yml', 'package.json']);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('github-actions');
  });

  it('should detect GitLab CI', () => {
    const result = detectCIProvider(['.gitlab-ci.yml', 'src/main.py']);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('gitlab-ci');
  });

  it('should detect Jenkins from Jenkinsfile', () => {
    const result = detectCIProvider(['Jenkinsfile', 'pom.xml']);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('jenkins');
  });

  it('should detect CircleCI', () => {
    const result = detectCIProvider(['.circleci/config.yml']);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('circleci');
  });

  it('should detect Azure Pipelines', () => {
    const result = detectCIProvider(['azure-pipelines.yml']);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('azure-pipelines');
  });

  it('should return null when no CI config found', () => {
    const result = detectCIProvider(['src/test.ts', 'package.json']);
    expect(result).toBeNull();
  });
});

describe('CI Pipeline Generation (US-012)', () => {
  it('should generate GitHub Actions for TypeScript', () => {
    const { path, content } = generateCIPipeline('github-actions', {
      targetLanguage: 'typescript',
    });
    expect(path).toBe('.github/workflows/playwright.yml');
    expect(content).toContain('npx playwright test');
    expect(content).toContain('npx playwright install --with-deps');
    expect(content).toContain('mcr.microsoft.com/playwright');
    expect(content).toContain('playwright-report');
    expect(content).toContain('actions/upload-artifact');
  });

  it('should generate GitHub Actions for Python', () => {
    const { content } = generateCIPipeline('github-actions', {
      targetLanguage: 'python',
    });
    expect(content).toContain('pytest --browser chromium');
    expect(content).toContain('pip install -r requirements.txt');
    expect(content).toContain('playwright install --with-deps chromium');
    expect(content).toContain('setup-python');
  });

  it('should generate GitLab CI config', () => {
    const { path, content } = generateCIPipeline('gitlab-ci', {
      targetLanguage: 'typescript',
    });
    expect(path).toBe('.gitlab-ci.yml');
    expect(content).toContain('stages:');
    expect(content).toContain('npx playwright test');
    expect(content).toContain('artifacts:');
    expect(content).toContain('expire_in: 30 days');
  });

  it('should generate Jenkinsfile', () => {
    const { path, content } = generateCIPipeline('jenkins', {
      targetLanguage: 'typescript',
    });
    expect(path).toBe('Jenkinsfile');
    expect(content).toContain('pipeline {');
    expect(content).toContain('npx playwright test');
    expect(content).toContain('publishHTML');
  });

  it('should generate CircleCI config', () => {
    const { path, content } = generateCIPipeline('circleci', {
      targetLanguage: 'typescript',
    });
    expect(path).toBe('.circleci/config.yml');
    expect(content).toContain('version: 2.1');
    expect(content).toContain('npx playwright test');
    expect(content).toContain('store_artifacts');
  });

  it('should generate Azure Pipelines config', () => {
    const { path, content } = generateCIPipeline('azure-pipelines', {
      targetLanguage: 'typescript',
    });
    expect(path).toBe('azure-pipelines.yml');
    expect(content).toContain('trigger:');
    expect(content).toContain('npx playwright test');
    expect(content).toContain('PublishPipelineArtifact');
  });

  it('should use custom test command when provided', () => {
    const { content } = generateCIPipeline('github-actions', {
      targetLanguage: 'typescript',
      testCommand: 'npm run test:e2e',
    });
    expect(content).toContain('npm run test:e2e');
  });
});
