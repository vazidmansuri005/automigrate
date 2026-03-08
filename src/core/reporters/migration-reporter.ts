/**
 * Migration report generation.
 * Formats MigrationReport for console output and JSON export.
 */

import type { MigrationReport, AnalysisResult } from '../../types/index.js';
import type { ProjectStructure } from '../analyzers/structure-analyzer.js';

export function formatAnalysisReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  AUTOMIGRATE - Analysis Report');
  lines.push('  ' + '='.repeat(50));
  lines.push('');
  lines.push(`  Source: ${result.sourceDir}`);
  lines.push(`  Files found: ${result.files.length}`);
  lines.push('');

  // Framework breakdown
  lines.push('  Frameworks detected:');
  const fwCounts = new Map<string, number>();
  for (const f of result.files) {
    fwCounts.set(f.framework, (fwCounts.get(f.framework) ?? 0) + 1);
  }
  for (const [fw, count] of fwCounts) {
    lines.push(`    ${fw}: ${count} files`);
  }
  lines.push('');

  // Language breakdown
  lines.push('  Languages:');
  const langCounts = new Map<string, number>();
  for (const f of result.files) {
    langCounts.set(f.language, (langCounts.get(f.language) ?? 0) + 1);
  }
  for (const [lang, count] of langCounts) {
    lines.push(`    ${lang}: ${count} files`);
  }
  lines.push('');

  // Complexity
  const complexityCounts = { low: 0, medium: 0, high: 0 };
  for (const f of result.files) {
    complexityCounts[f.complexity]++;
  }
  lines.push('  Complexity distribution:');
  lines.push(`    Low:    ${complexityCounts.low} files`);
  lines.push(`    Medium: ${complexityCounts.medium} files`);
  lines.push(`    High:   ${complexityCounts.high} files`);
  lines.push('');

  // Summary stats
  lines.push('  Summary:');
  lines.push(`    Total tests:      ${result.summary.totalTransformations}`);
  lines.push(`    High confidence:  ${result.summary.highConfidence}`);
  lines.push(`    Medium:           ${result.summary.mediumConfidence}`);
  lines.push(`    Low:              ${result.summary.lowConfidence}`);
  lines.push(`    Manual review:    ${result.summary.manualInterventions}`);
  lines.push(`    Est. completion:  ${result.summary.estimatedCompletionPercentage}%`);
  lines.push('');

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('  Recommendations:');
    for (const rec of result.recommendations) {
      const icon = rec.type === 'warning' ? '!' : rec.type === 'suggestion' ? '>' : 'i';
      lines.push(`    [${icon}] ${rec.message}`);
    }
    lines.push('');
  }

  lines.push('  ' + '='.repeat(50));
  lines.push('');

  return lines.join('\n');
}

export function formatMigrationReport(report: MigrationReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push('');
  lines.push('  AUTOMIGRATE - Migration Report');
  lines.push('  ' + '='.repeat(50));
  lines.push('');
  lines.push(`  Duration: ${(report.duration / 1000).toFixed(1)}s`);
  lines.push(`  Timestamp: ${report.timestamp}`);
  lines.push('');

  lines.push('  Results:');
  lines.push(`    Files processed:  ${summary.totalFiles}`);
  lines.push(`    Successful:       ${summary.filesSuccessful}`);
  lines.push(`    Partial:          ${summary.filesPartial}`);
  lines.push(`    Failed:           ${summary.filesFailed}`);
  lines.push(`    Skipped:          ${summary.filesSkipped}`);
  lines.push(`    Success rate:     ${Math.round(summary.successRate * 100)}%`);
  lines.push('');

  lines.push('  Transformations:');
  lines.push(`    Total:            ${summary.totalTransformations}`);
  lines.push(`    High confidence:  ${summary.highConfidence}`);
  lines.push(`    Medium:           ${summary.mediumConfidence}`);
  lines.push(`    Low:              ${summary.lowConfidence}`);
  lines.push(`    Manual review:    ${summary.manualInterventions}`);
  lines.push('');

  // Top issues
  if (summary.topIssues.length > 0) {
    lines.push('  Top issues:');
    for (const issue of summary.topIssues.slice(0, 5)) {
      lines.push(`    ${issue.description} (${issue.count} occurrences)`);
    }
    lines.push('');
  }

  // Per-file results (brief)
  lines.push('  Per-file results:');
  for (const result of report.results) {
    const status =
      result.status === 'success'
        ? '[OK]'
        : result.status === 'partial'
          ? '[!!]'
          : result.status === 'failed'
            ? '[FAIL]'
            : '[SKIP]';
    const review =
      result.manualInterventionsRequired > 0
        ? ` (${result.manualInterventionsRequired} need review)`
        : '';
    lines.push(`    ${status} ${result.sourcePath} -> ${result.targetPath}${review}`);
  }
  lines.push('');

  lines.push('  ' + '='.repeat(50));
  lines.push('');

  return lines.join('\n');
}

export function formatScanReport(structure: ProjectStructure): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  AUTOMIGRATE - Project Scan Report');
  lines.push('  ' + '='.repeat(50));
  lines.push('');
  lines.push(`  Source: ${structure.sourceDir}`);
  lines.push(`  Primary language: ${structure.primaryLanguage}`);
  lines.push('');

  // Test frameworks
  if (structure.testFrameworks.length > 0) {
    lines.push('  Test frameworks detected:');
    for (const fw of structure.testFrameworks) {
      const conf = Math.round(fw.confidence * 100);
      lines.push(`    ${fw.name} (${fw.language}) — ${fw.fileCount} files, ${conf}% confidence`);
      if (fw.features.length > 0) {
        lines.push(`      Features: ${fw.features.join(', ')}`);
      }
    }
    lines.push('');
  }

  // File categories
  lines.push('  File categories:');
  for (const cat of structure.fileCategories) {
    lines.push(`    ${cat.category}: ${cat.files.length} files`);
    if (cat.files.length <= 5) {
      for (const f of cat.files) {
        lines.push(`      - ${f}`);
      }
    } else {
      for (const f of cat.files.slice(0, 3)) {
        lines.push(`      - ${f}`);
      }
      lines.push(`      ... and ${cat.files.length - 3} more`);
    }
  }
  lines.push('');

  // Patterns
  if (structure.patterns.length > 0) {
    lines.push('  Detected patterns:');
    for (const p of structure.patterns) {
      lines.push(`    ${p.name} (${p.fileCount} occurrences)`);
      lines.push(`      ${p.description}`);
      lines.push(`      Strategy: ${p.migrationStrategy}`);
    }
    lines.push('');
  }

  // Blueprint
  const bp = structure.blueprint;
  lines.push(`  Migration complexity: ${bp.complexity}`);
  lines.push('');

  lines.push('  Target structure:');
  for (const folder of bp.targetStructure) {
    lines.push(`    ${folder.path} — ${folder.purpose}`);
  }
  lines.push('');

  lines.push(`  Files to migrate: ${bp.filePlans.length}`);
  const strategies = new Map<string, number>();
  for (const plan of bp.filePlans) {
    strategies.set(plan.strategy, (strategies.get(plan.strategy) ?? 0) + 1);
  }
  for (const [strategy, count] of strategies) {
    lines.push(`    ${strategy}: ${count} files`);
  }
  lines.push('');

  if (bp.sharedResources.length > 0) {
    lines.push('  Shared resources to generate:');
    for (const res of bp.sharedResources) {
      lines.push(`    ${res.path} — ${res.description}`);
    }
    lines.push('');
  }

  lines.push('  ' + '='.repeat(50));
  lines.push('');

  return lines.join('\n');
}

export function toJSON(report: MigrationReport): string {
  return JSON.stringify(report, null, 2);
}
