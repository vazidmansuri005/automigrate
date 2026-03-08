/**
 * Diff generation utilities.
 * Produces unified diffs comparing source to generated Playwright code.
 */

import { createTwoFilesPatch, structuredPatch } from 'diff';
import type { DiffResult } from '../types/index.js';

export function generateDiff(
  sourcePath: string,
  targetPath: string,
  sourceContent: string,
  targetContent: string,
  contextLines = 3,
): DiffResult {
  const patch = structuredPatch(
    sourcePath,
    targetPath,
    sourceContent,
    targetContent,
    'original',
    'playwright',
    { context: contextLines },
  );

  let additions = 0;
  let deletions = 0;

  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) additions++;
      else if (line.startsWith('-')) deletions++;
    }
  }

  const sourceLines = sourceContent.split('\n').length;
  const unchanged = sourceLines - deletions;

  const diff = createTwoFilesPatch(
    sourcePath,
    targetPath,
    sourceContent,
    targetContent,
    'original',
    'playwright',
    { context: contextLines },
  );

  return {
    sourcePath,
    targetPath,
    diff,
    additions,
    deletions,
    unchanged: Math.max(0, unchanged),
  };
}

export function formatDiffForTerminal(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) {
        return `\x1b[1m${line}\x1b[0m`; // bold
      }
      if (line.startsWith('@@')) {
        return `\x1b[36m${line}\x1b[0m`; // cyan
      }
      if (line.startsWith('+')) {
        return `\x1b[32m${line}\x1b[0m`; // green
      }
      if (line.startsWith('-')) {
        return `\x1b[31m${line}\x1b[0m`; // red
      }
      return line;
    })
    .join('\n');
}
