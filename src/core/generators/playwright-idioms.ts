/**
 * Playwright Idiom Post-Processor
 *
 * This is the intelligence layer that transforms naive line-by-line migration output
 * into idiomatic Playwright code. It runs AFTER the line-level transforms and AFTER
 * the code generator wraps tests in the right structure.
 *
 * It handles patterns that no regex can catch at the line level because they require
 * understanding Playwright's API semantics, not just syntax.
 *
 * Design principle: Framework-agnostic. Any source framework's output passes through
 * these same idiom fixups. The upstream transforms do the framework-specific heavy
 * lifting; this layer ensures the result is valid, idiomatic Playwright.
 */

export interface IdiomFixup {
  name: string;
  description: string;
  apply: (code: string) => string;
}

/**
 * Apply all Playwright idiom fixups to generated code.
 * Order matters — some fixups depend on earlier ones.
 */
export function applyPlaywrightIdioms(code: string): string {
  for (const fixup of IDIOM_FIXUPS) {
    code = fixup.apply(code);
  }
  return code;
}

const IDIOM_FIXUPS: IdiomFixup[] = [
  // ─── Locator API Idioms ───────────────────────────────────────────────────

  {
    name: 'locator-count-not-length',
    description: 'page.locator() returns Locator, not array — .length → .count()',
    apply(code) {
      // Pattern: const results = page.locator('...') → later results.length should be await results.count()
      // Match: locatorVar.length where locatorVar was assigned from page.locator()
      return code.replace(/(\w+)\.length\b/g, (match, varName) => {
        // Check if this variable was assigned from page.locator() in the same code
        const locatorAssign = new RegExp(
          `(?:const|let|var)\\s+${varName}\\s*=\\s*(?:await\\s+)?page\\.locator\\(`,
        );
        if (locatorAssign.test(code)) {
          return `await ${varName}.count()`;
        }
        return match;
      });
    },
  },

  {
    name: 'evaluate-textContent-shorthand',
    description: '.evaluate(el => el.textContent) → .textContent()',
    apply(code) {
      // page.locator('...').evaluate(el => el.textContent) → page.locator('...').textContent()
      return code.replace(
        /\.evaluate\s*\(\s*(?:el|e|element|node)\s*=>\s*(?:el|e|element|node)\.textContent\s*\)/g,
        '.textContent()',
      );
    },
  },

  {
    name: 'evaluate-innerText-shorthand',
    description: '.evaluate(el => el.innerText) → .innerText()',
    apply(code) {
      return code.replace(
        /\.evaluate\s*\(\s*(?:el|e|element|node)\s*=>\s*(?:el|e|element|node)\.innerText\s*\)/g,
        '.innerText()',
      );
    },
  },

  {
    name: 'evaluate-innerHTML-shorthand',
    description: '.evaluate(el => el.innerHTML) → .innerHTML()',
    apply(code) {
      return code.replace(
        /\.evaluate\s*\(\s*(?:el|e|element|node)\s*=>\s*(?:el|e|element|node)\.innerHTML\s*\)/g,
        '.innerHTML()',
      );
    },
  },

  {
    name: 'evaluate-value-shorthand',
    description: '.evaluate(el => el.value) → .inputValue()',
    apply(code) {
      return code.replace(
        /\.evaluate\s*\(\s*(?:el|e|element|node)\s*=>\s*(?:el|e|element|node)\.value\s*\)/g,
        '.inputValue()',
      );
    },
  },

  // ─── Assertion Idioms ─────────────────────────────────────────────────────

  {
    name: 'not-null-to-attached',
    description: 'expect(locator).not.toBeNull() → expect(locator).toBeAttached()',
    apply(code) {
      return code.replace(/expect\s*\(\s*(\w+)\s*\)\.not\.toBeNull\s*\(\)/g, (match, varName) => {
        const locatorAssign = new RegExp(
          `(?:const|let|var)\\s+${varName}\\s*=\\s*(?:await\\s+)?page\\.locator\\(`,
        );
        if (locatorAssign.test(code)) {
          return `await expect(${varName}).toBeAttached()`;
        }
        return match;
      });
    },
  },

  {
    name: 'truthy-locator-to-visible',
    description: 'expect(locator).toBeTruthy() → expect(locator).toBeVisible() when locator',
    apply(code) {
      return code.replace(/expect\s*\(\s*(\w+)\s*\)\.toBeTruthy\s*\(\)/g, (match, varName) => {
        const locatorAssign = new RegExp(
          `(?:const|let|var)\\s+${varName}\\s*=\\s*(?:await\\s+)?page\\.locator\\(`,
        );
        if (locatorAssign.test(code)) {
          return `await expect(${varName}).toBeVisible()`;
        }
        return match;
      });
    },
  },

  {
    name: 'expect-missing-await',
    description: 'Add await to expect() assertions on locators that are missing it',
    apply(code) {
      // Fix: expect(page.locator(...)) without await → add await
      return code.replace(
        /^(\s*)(?!await\s)expect\s*\(\s*page\.(?:locator|getByRole|getByText|getByLabel|getByTestId)\s*\(/gm,
        '$1await expect(page.',
      );
    },
  },

  // ─── Lifecycle & Structure Idioms ──────────────────────────────────────────

  {
    name: 'remove-empty-hooks',
    description: 'Remove hooks that only contain automigrate comments (no actual code)',
    apply(code) {
      // Remove test.beforeAll/afterAll/etc. blocks that contain only comments or whitespace
      return code.replace(
        /\s*test\.(?:beforeAll|afterAll|beforeEach|afterEach)\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{[\s//*[\]a-zA-Z.()— ]*\}\s*\)\s*;?\n?/g,
        (match) => {
          // Check if the block has any non-comment, non-whitespace content
          const body = match
            .replace(/test\.\w+\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{/, '')
            .replace(/\}\s*\)\s*;?\s*$/, '');
          const hasCode = body.split('\n').some((line) => {
            const trimmed = line.trim();
            return (
              trimmed !== '' &&
              !trimmed.startsWith('//') &&
              !trimmed.startsWith('/*') &&
              !trimmed.startsWith('*')
            );
          });
          return hasCode ? match : '\n';
        },
      );
    },
  },

  {
    name: 'remove-let-browser-page',
    description: 'Remove leftover `let browser;` / `let page;` declarations',
    apply(code) {
      return code
        .replace(/^\s*(?:let|var)\s+browser\s*;?\s*$/gm, '')
        .replace(/^\s*(?:let|var)\s+page\s*;?\s*$/gm, '');
    },
  },

  // ─── waitForNavigation → smarter patterns ──────────────────────────────────

  {
    name: 'click-then-wait-navigation',
    description: 'click() followed by waitForNavigation → Promise.all pattern or just click',
    apply(code) {
      // Simple case: just remove waitForNavigation after click since Playwright auto-waits
      return code.replace(
        /(await\s+page\.locator\([^)]+\)\.click\(\)\s*;?\s*\n\s*)await\s+page\.waitForURL\s*\(\s*['"]\*\*\/\*['"]\s*\)\s*;?/g,
        '$1',
      );
    },
  },

  // ─── $$eval idiom ─────────────────────────────────────────────────────────

  {
    name: 'evaluateAll-to-allTextContents',
    description:
      'locator.evaluateAll(els => els.map(el => el.textContent)) → locator.allTextContents()',
    apply(code) {
      return code.replace(
        /\.evaluateAll\s*\(\s*(?:els|elements|nodes)\s*=>\s*\n?\s*(?:els|elements|nodes)\.map\s*\(\s*(?:el|e|element|node)\s*=>\s*(?:el|e|element|node)\.textContent\s*\)\s*\)/g,
        '.allTextContents()',
      );
    },
  },

  // ─── Semicolons (normalize) ─────────────────────────────────────────────

  {
    name: 'add-missing-semicolons',
    description: 'Add missing semicolons to statement lines in TS/JS output',
    apply(code) {
      return code.replace(/^(\s*(?:await\s+)?(?:page|expect|const|let|var)\b.+[^{;,\s])$/gm, '$1;');
    },
  },

  // ─── Clean up consecutive blank lines ────────────────────────────────────

  {
    name: 'collapse-blank-lines',
    description: 'Collapse 3+ consecutive blank lines to 2',
    apply(code) {
      return code.replace(/\n{4,}/g, '\n\n\n');
    },
  },
];
