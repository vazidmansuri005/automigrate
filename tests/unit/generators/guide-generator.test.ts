import { describe, it, expect } from 'vitest';
import { generateMigrationGuide } from '../../../src/core/generators/guide-generator.js';
import type { MigrationReport } from '../../../src/types/index.js';

function makeReport(overrides: Partial<MigrationReport> = {}): MigrationReport {
  return {
    results: [
      {
        sourceFile: 'LoginTest.java',
        targetFile: 'login-test.spec.ts',
        status: 'success',
        confidence: 'high',
        manualInterventions: [],
        generatedCode: '',
      },
      {
        sourceFile: 'CheckoutTest.java',
        targetFile: 'checkout-test.spec.ts',
        status: 'partial',
        confidence: 'medium',
        manualInterventions: [
          {
            type: 'selector',
            message: 'Complex XPath selector needs review',
            line: 42,
            original: 'driver.findElement(By.xpath(...))',
            suggestion: "page.locator('...')",
          },
          {
            type: 'wait',
            message: 'Custom wait condition',
            line: 55,
            original: 'new WebDriverWait(...)',
            suggestion: 'await page.waitForSelector(...)',
          },
          {
            type: 'action',
            message: 'Drag and drop needs review',
            line: 67,
            original: 'new Actions(driver).dragAndDrop(...)',
            suggestion: 'await page.dragAndDrop(...)',
          },
        ],
        generatedCode: '',
      },
      {
        sourceFile: 'HelperUtils.java',
        targetFile: null as any,
        status: 'failed',
        confidence: 'low',
        manualInterventions: [],
        generatedCode: '',
      },
    ] as any,
    summary: {
      overallConfidence: 'medium',
    } as any,
    ...overrides,
  };
}

describe('Migration Guide Generator (US-013)', () => {
  it('should generate a complete guide with all 9 sections', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });

    expect(guide).toContain('## 1. Summary');
    expect(guide).toContain('## 2. Per-File Migration Notes');
    expect(guide).toContain('## 3. Before/After Examples');
    expect(guide).toContain('## 4. Manual Review Required');
    expect(guide).toContain('## 5. Risk Areas');
    expect(guide).toContain('## 6. Recommended Test Validation Order');
    expect(guide).toContain('## 7. Playwright Best Practices');
    expect(guide).toContain('## 8. CI Setup Guide');
    expect(guide).toContain('## 9. Team Training Notes');
  });

  it('should include summary stats', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });

    expect(guide).toContain('selenium');
    expect(guide).toContain('java');
    expect(guide).toContain('typescript');
    expect(guide).toContain('Total Files | 3');
    expect(guide).toContain('Fully Migrated | 1');
    expect(guide).toContain('Failed | 1');
  });

  it('should list per-file notes in a table', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });

    expect(guide).toContain('LoginTest.java');
    expect(guide).toContain('login-test.spec.ts');
    expect(guide).toContain('CheckoutTest.java');
  });

  it('should generate before/after examples from interventions', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });

    expect(guide).toContain('**Before:**');
    expect(guide).toContain('**After:**');
    expect(guide).toContain('Complex XPath selector');
  });

  it('should group manual review items by category', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });

    expect(guide).toContain('### selector');
    expect(guide).toContain('### wait');
    expect(guide).toContain('### action');
  });

  it('should identify risk areas from low-confidence files', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });

    // CheckoutTest has 3 interventions (> 2 threshold)
    expect(guide).toContain('CheckoutTest.java');
    expect(guide).toContain('3 manual interventions');
  });

  it('should include framework-specific training notes', () => {
    const seleniumGuide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
    });
    expect(seleniumGuide).toContain('WebDriverWait');

    const cypressGuide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'cypress',
      sourceLanguage: 'javascript',
      targetLanguage: 'typescript',
    });
    expect(cypressGuide).toContain('cy.visit');
    expect(cypressGuide).toContain('async/await');
  });

  it('should include CI setup instructions', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'java',
      targetLanguage: 'typescript',
      ciProvider: 'github-actions',
    });

    expect(guide).toContain('npx playwright install');
    expect(guide).toContain('npx playwright test');
    expect(guide).toContain('github-actions');
  });

  it('should include Python CI instructions for Python target', () => {
    const guide = generateMigrationGuide(makeReport(), {
      sourceFramework: 'selenium',
      sourceLanguage: 'python',
      targetLanguage: 'python',
    });

    expect(guide).toContain('pip install');
    expect(guide).toContain('pytest');
  });
});
