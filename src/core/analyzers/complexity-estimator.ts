/**
 * Pre-migration complexity estimation.
 * Analyzes parsed files to estimate migration difficulty and identify manual interventions.
 */

import type {
  ParsedFile,
  MigrationSummary,
  SourceFramework,
  SourceLanguage,
  TransformCategory,
  ManualIntervention,
  AnalyzedFile,
  Recommendation,
  TransformationRule,
} from '../../types/index.js';

export function estimateComplexity(
  parsedFiles: ParsedFile[],
  _rules: TransformationRule[],
): MigrationSummary {
  const frameworkBreakdown = {} as Record<SourceFramework, number>;
  const languageBreakdown = {} as Record<SourceLanguage, number>;
  const categoryBreakdown = {} as Record<TransformCategory, number>;

  let totalTransformations = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let manualInterventions = 0;

  for (const parsed of parsedFiles) {
    const fw = parsed.source.framework;
    const lang = parsed.source.language;
    frameworkBreakdown[fw] = (frameworkBreakdown[fw] ?? 0) + 1;
    languageBreakdown[lang] = (languageBreakdown[lang] ?? 0) + 1;

    // Count transformable items
    const items = [
      { category: 'selector' as TransformCategory, count: parsed.selectors.length },
      { category: 'wait' as TransformCategory, count: parsed.waits.length },
      { category: 'assertion' as TransformCategory, count: parsed.assertions.length },
      { category: 'hook' as TransformCategory, count: parsed.hooks.length },
      { category: 'import' as TransformCategory, count: parsed.imports.length },
    ];

    for (const { category, count } of items) {
      categoryBreakdown[category] = (categoryBreakdown[category] ?? 0) + count;
      totalTransformations += count;
    }

    // Estimate confidence from rule coverage
    for (const selector of parsed.selectors) {
      if (selector.confidence >= 0.8) highConfidence++;
      else if (selector.confidence >= 0.5) mediumConfidence++;
      else lowConfidence++;
    }

    // Identify manual interventions
    manualInterventions += identifyManualInterventions(parsed).length;
  }

  const estimatedCompletionPercentage =
    totalTransformations > 0
      ? Math.round(((highConfidence + mediumConfidence * 0.7) / totalTransformations) * 100)
      : 0;

  return {
    totalFiles: parsedFiles.length,
    totalTransformations,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    manualInterventions,
    estimatedCompletionPercentage,
    frameworkBreakdown,
    languageBreakdown,
    categoryBreakdown,
  };
}

export function analyzeFile(parsed: ParsedFile, _rules: TransformationRule[]): AnalyzedFile {
  const interventions = identifyManualInterventions(parsed);
  const selectorCount = parsed.selectors.length;
  const waitCount = parsed.waits.length;
  const assertionCount = parsed.assertions.length;

  const totalItems = selectorCount + waitCount + assertionCount;
  const complexity: 'low' | 'medium' | 'high' =
    totalItems > 50 || interventions.length > 10
      ? 'high'
      : totalItems > 15 || interventions.length > 3
        ? 'medium'
        : 'low';

  const highConfItems = parsed.selectors.filter((s) => s.confidence >= 0.8).length;
  const estimatedMigrationConfidence =
    totalItems > 0 ? Math.round((highConfItems / totalItems) * 100) / 100 : 1;

  return {
    path: parsed.source.relativePath,
    framework: parsed.source.framework,
    language: parsed.source.language,
    detectionConfidence: 0.9,
    testCount: parsed.testCases.length,
    pageObjectCount: parsed.pageObjects.length,
    selectorCount,
    waitCount,
    assertionCount,
    hookCount: parsed.hooks.length,
    complexity,
    estimatedMigrationConfidence,
    manualInterventions: interventions,
  };
}

export function generateRecommendations(analyzedFiles: AnalyzedFile[]): Recommendation[] {
  const recs: Recommendation[] = [];

  // Check for mixed frameworks
  const frameworks = new Set(analyzedFiles.map((f) => f.framework));
  if (frameworks.size > 1) {
    recs.push({
      type: 'warning',
      message: `Mixed frameworks detected (${[...frameworks].join(', ')}). Consider migrating one framework at a time using --framework flag.`,
    });
  }

  // Check for high-complexity files
  const highComplexity = analyzedFiles.filter((f) => f.complexity === 'high');
  if (highComplexity.length > 0) {
    recs.push({
      type: 'warning',
      message: `${highComplexity.length} high-complexity files detected. These will need manual review after migration.`,
      affectedFiles: highComplexity.map((f) => f.path),
    });
  }

  // Check for files with many manual interventions
  const manualHeavy = analyzedFiles.filter((f) => f.manualInterventions.length > 5);
  if (manualHeavy.length > 0) {
    recs.push({
      type: 'suggestion',
      message: `${manualHeavy.length} files have >5 patterns requiring manual review. Consider starting migration with simpler files.`,
      affectedFiles: manualHeavy.map((f) => f.path),
    });
  }

  // Check for page objects
  const withPageObjects = analyzedFiles.filter((f) => f.pageObjectCount > 0);
  if (withPageObjects.length > 0) {
    recs.push({
      type: 'suggestion',
      message: `${withPageObjects.length} files contain page objects. Use --page-objects flag to auto-generate Playwright Page Object classes.`,
    });
  }

  // Success message
  const avgConfidence =
    analyzedFiles.reduce((sum, f) => sum + f.estimatedMigrationConfidence, 0) /
    (analyzedFiles.length || 1);
  if (avgConfidence > 0.8) {
    recs.push({
      type: 'info',
      message: `Average migration confidence: ${Math.round(avgConfidence * 100)}%. Most patterns have high-confidence mappings.`,
    });
  }

  return recs;
}

// ─── Manual Intervention Detection ──────────────────────────────────────────

function identifyManualInterventions(parsed: ParsedFile): ManualIntervention[] {
  const interventions: ManualIntervention[] = [];

  // Check for iframes
  for (const selector of parsed.selectors) {
    if (
      selector.raw.includes('switchTo().frame') ||
      selector.raw.includes('frameLocator') ||
      selector.raw.includes('.frame(')
    ) {
      interventions.push({
        line: selector.line,
        type: 'iframe',
        description: 'iframe interaction detected',
        suggestion:
          'Use page.frameLocator() in Playwright. Frame interaction model differs significantly.',
        severity: 'warning',
      });
    }
  }

  // Check for shadow DOM
  for (const selector of parsed.selectors) {
    if (
      selector.raw.includes('shadowRoot') ||
      selector.raw.includes('shadow-root') ||
      selector.raw.includes('deep combinator')
    ) {
      interventions.push({
        line: selector.line,
        type: 'shadow-dom',
        description: 'Shadow DOM interaction detected',
        suggestion: 'Playwright pierces shadow DOM by default. Remove shadow DOM traversal code.',
        severity: 'info',
      });
    }
  }

  // Check for file uploads
  for (const tc of parsed.testCases) {
    for (const action of tc.actions) {
      if (
        action.type === 'upload' ||
        (action.raw.includes('sendKeys') && action.raw.includes('file')) ||
        action.raw.includes('attachFile') ||
        action.raw.includes('selectFile')
      ) {
        interventions.push({
          line: action.line,
          type: 'file-upload',
          description: 'File upload detected',
          suggestion: 'Use locator.setInputFiles() in Playwright.',
          severity: 'info',
        });
      }
    }
  }

  // Check for custom/complex waits
  for (const wait of parsed.waits) {
    if (wait.type === 'custom') {
      interventions.push({
        line: wait.line,
        type: 'custom-wait',
        description: 'Custom wait pattern detected',
        suggestion:
          'Review this wait. Playwright auto-waits for most conditions. Use page.waitForFunction() for custom conditions.',
        severity: 'warning',
      });
    }
  }

  // Check for authentication patterns
  for (const cap of parsed.capabilities) {
    if (
      cap.key.toLowerCase().includes('auth') ||
      cap.key.toLowerCase().includes('credential') ||
      cap.key.toLowerCase().includes('token')
    ) {
      interventions.push({
        line: cap.line,
        type: 'authentication',
        description: 'Authentication capability detected',
        suggestion:
          "Use Playwright's storageState for auth persistence. See: https://playwright.dev/docs/auth",
        severity: 'warning',
      });
    }
  }

  // Check for mobile-specific patterns (Appium)
  if (parsed.source.framework === 'appium') {
    for (const selector of parsed.selectors) {
      if (
        selector.raw.includes('AndroidUIAutomator') ||
        selector.raw.includes('iOSClassChain') ||
        selector.raw.includes('iOSNsPredicateString') ||
        selector.raw.includes('accessibilityId')
      ) {
        interventions.push({
          line: selector.line,
          type: 'mobile-specific',
          description: 'Appium mobile-specific selector',
          suggestion:
            'Playwright does not support native mobile testing. Consider using Playwright for web/PWA testing only, or keep Appium for native mobile.',
          severity: 'error',
        });
      }
    }
  }

  return interventions;
}
