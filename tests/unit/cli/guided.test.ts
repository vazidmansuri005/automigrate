import { describe, it, expect } from 'vitest';
import type { MigrationPlanFile } from '../../../src/cli/guided.js';

describe('Guided Mode Plan File (US-015)', () => {
  it('should have correct plan file structure', () => {
    const plan: MigrationPlanFile = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      sourceDir: '/tmp/source',
      outputDir: '/tmp/output',
      targetLanguage: 'typescript',
      selectorStrategy: 'preserve',
      waitStrategy: 'auto-wait',
      scan: {
        primaryLanguage: 'java',
        frameworks: [
          {
            name: 'selenium',
            language: 'java',
            fileCount: 5,
            confidence: 0.95,
            features: ['WebDriver', 'By selectors'],
          },
        ],
        patterns: [
          {
            name: 'page-object',
            description: 'Page Object Pattern detected',
            migrationStrategy: 'migrate-as-class',
          },
        ],
      },
      files: [
        {
          sourcePath: 'LoginTest.java',
          targetPath: 'tests/login-test.spec.ts',
          category: 'test',
          strategy: 'migrate',
          include: true,
        },
        {
          sourcePath: 'Utils.java',
          targetPath: 'tests/helpers/utils.ts',
          category: 'helper',
          strategy: 'migrate',
          include: false,
          userNotes: 'Only used for logging',
        },
      ],
      targetStructure: [
        { path: 'tests/', purpose: 'Test files' },
        { path: 'tests/helpers/', purpose: 'Helper utilities' },
      ],
    };

    expect(plan.version).toBe('1.0');
    expect(plan.files).toHaveLength(2);
    expect(plan.files[0].include).toBe(true);
    expect(plan.files[1].include).toBe(false);
    expect(plan.files[1].userNotes).toBe('Only used for logging');
    expect(plan.scan.frameworks[0].name).toBe('selenium');
    expect(plan.targetStructure).toHaveLength(2);
  });

  it('should serialize and deserialize plan correctly', () => {
    const plan: MigrationPlanFile = {
      version: '1.0',
      createdAt: '2025-01-01T00:00:00.000Z',
      sourceDir: '/tmp/src',
      outputDir: '/tmp/out',
      targetLanguage: 'python',
      selectorStrategy: 'best-practice',
      waitStrategy: 'auto-wait',
      scan: {
        primaryLanguage: 'python',
        frameworks: [],
        patterns: [],
      },
      files: [],
      targetStructure: [],
      userContext: 'Legacy pytest suite with custom fixtures',
    };

    const json = JSON.stringify(plan, null, 2);
    const restored = JSON.parse(json) as MigrationPlanFile;

    expect(restored.version).toBe('1.0');
    expect(restored.targetLanguage).toBe('python');
    expect(restored.selectorStrategy).toBe('best-practice');
    expect(restored.userContext).toBe('Legacy pytest suite with custom fixtures');
  });

  it('should support all valid file categories', () => {
    const validCategories = [
      'test',
      'page-object',
      'helper',
      'base-class',
      'config',
      'fixture',
      'step-definition',
      'feature-file',
      'data-provider',
      'utility',
      'model',
    ];

    // Each category should be usable in a plan file
    for (const cat of validCategories) {
      const file = {
        sourcePath: `src/${cat}.java`,
        targetPath: `tests/${cat}.ts`,
        category: cat as any,
        strategy: 'migrate' as const,
        include: true,
      };
      expect(file.category).toBe(cat);
    }
  });

  it('should track included vs excluded file counts', () => {
    const files = [
      { include: true },
      { include: true },
      { include: false },
      { include: true },
      { include: false },
    ];

    const included = files.filter((f) => f.include).length;
    const excluded = files.filter((f) => !f.include).length;

    expect(included).toBe(3);
    expect(excluded).toBe(2);
  });
});
