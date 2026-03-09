/**
 * Core transformation engine.
 * Takes ParsedFile + TransformationRule[] → TransformFileResult.
 *
 * Uses a hybrid approach:
 * - Structural transforms (imports, test wrapping, hooks) based on parsed AST
 * - Line-level API transforms using smart regex patterns with capture groups
 * - Fallback TODO markers for unrecognized patterns
 */

import type {
  ParsedFile,
  TransformationRule,
  TransformResult,
  TransformFileResult,
  TransformedLine,
  ManualIntervention,
  MigrationConfig,
  SmartPattern,
  SourceFramework,
  SourceLanguage,
  TransformConfidence,
  TransformCategory,
} from '../../types/index.js';
import { generateSeleniumRules } from '../../mappings/selenium-to-playwright.js';
import { generateCypressRules } from '../../mappings/cypress-to-playwright.js';
import { generatePuppeteerRules } from '../../mappings/puppeteer-to-playwright.js';
import { generateAppiumRules } from '../../mappings/appium-to-playwright.js';
import { generateWebdriverioRules } from '../../mappings/webdriverio-to-playwright.js';
import { createLogger } from '../../utils/logger.js';

const _log = createLogger('transformer');

// ─── Smart Pattern Builder ──────────────────────────────────────────────────
// Converts descriptive API strings like "driver.get(url)" into regex with
// capture groups like /driver\.get\s*\(\s*(.+?)\s*\)/ and templates like
// "await page.goto($1)"

export function buildSmartPattern(sourceDesc: string, targetDesc: string): SmartPattern {
  const captureNames: string[] = [];
  let regexStr = '';
  let template = targetDesc;

  // Parse the source description character by character
  let i = 0;
  let captureIndex = 0;

  while (i < sourceDesc.length) {
    const char = sourceDesc[i];

    if (char === '(') {
      // Start of parameter group — find the matching close paren
      const closeIdx = findMatchingParen(sourceDesc, i);
      const paramContent = sourceDesc.substring(i + 1, closeIdx);

      // Split params by comma
      const params = paramContent.split(',').map((p) => p.trim());

      regexStr += '\\s*\\(\\s*';

      for (let p = 0; p < params.length; p++) {
        const paramName = params[p];
        captureNames.push(paramName);
        captureIndex++;

        // Capture anything (non-greedy for single param, greedy for last)
        if (p === params.length - 1) {
          regexStr += '(.+?)';
        } else {
          regexStr += '(.+?)\\s*,\\s*';
        }

        // Replace param name in template with capture ref
        template = template.replace(
          new RegExp(`\\b${escapeRegex(paramName)}\\b`),
          `$${captureIndex}`,
        );
      }

      regexStr += '\\s*\\)';
      i = closeIdx + 1;
    } else if (char === '.') {
      regexStr += '\\.';
      i++;
    } else if (char === ' ') {
      regexStr += '\\s*';
      i++;
    } else if (/[a-zA-Z0-9_$]/.test(char)) {
      // Collect word
      let word = '';
      while (i < sourceDesc.length && /[a-zA-Z0-9_$]/.test(sourceDesc[i])) {
        word += sourceDesc[i];
        i++;
      }
      regexStr += word;
    } else {
      regexStr += escapeRegex(char);
      i++;
    }
  }

  return {
    regex: new RegExp(regexStr, 'g'),
    template,
    captureNames,
  };
}

function findMatchingParen(str: string, openIdx: number): number {
  let depth = 1;
  for (let i = openIdx + 1; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return str.length - 1;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Rule Loading ───────────────────────────────────────────────────────────

export function getRulesForFramework(
  framework: SourceFramework,
  customRules?: TransformationRule[],
): TransformationRule[] {
  const builtinRules =
    framework === 'selenium'
      ? generateSeleniumRules()
      : framework === 'appium'
        ? [...generateAppiumRules(), ...generateSeleniumRules()]
        : framework === 'cypress'
          ? generateCypressRules()
          : framework === 'puppeteer'
            ? generatePuppeteerRules()
            : framework === 'webdriverio'
              ? [] // WDIO transforms handled entirely by direct rules
              : framework === 'robot'
                ? [] // Robot transforms handled entirely by direct rules
                : generateSeleniumRules();

  // Custom rules take priority (prepended)
  return [...(customRules ?? []), ...builtinRules];
}

// ─── Direct Regex Rules ────────────────────────────────────────────────────
// These match actual code patterns (not mapping descriptions).
// They're framework-specific and handle compound expressions like
// driver.findElement(By.id("username")).sendKeys("text")

interface DirectRule {
  regex: RegExp;
  replacement: string | ((match: RegExpMatchArray, indent: string) => string);
  confidence: TransformConfidence;
  category: TransformCategory;
  description: string;
  requiresManualReview?: boolean;
}

function getDirectRulesForFramework(
  framework: SourceFramework,
  language?: SourceLanguage,
): DirectRule[] {
  if (framework === 'appium') {
    if (language === 'csharp') {
      return [...getAppiumDirectRules(), ...getCSharpDirectRules()];
    }
    if (language === 'python') {
      return [...getAppiumDirectRules(), ...getPythonSeleniumDirectRules()];
    }
    return [...getAppiumDirectRules(), ...getSeleniumDirectRules()];
  }
  if (framework === 'selenium') {
    if (language === 'csharp') {
      return getCSharpDirectRules();
    }
    if (language === 'python') {
      return getPythonSeleniumDirectRules();
    }
    return getSeleniumDirectRules();
  }
  if (framework === 'cypress') {
    return getCypressDirectRules();
  }
  if (framework === 'puppeteer') {
    return getPuppeteerDirectRules();
  }
  if (framework === 'webdriverio') {
    return getWebdriverioDirectRules();
  }
  if (framework === 'robot') {
    return getRobotDirectRules();
  }
  return [];
}

function getSeleniumDirectRules(): DirectRule[] {
  return [
    // ── Assertions (MUST come first — they wrap other patterns like driver.getTitle) ──
    {
      regex: /assertTrue\s*\(\s*(.+?)\.isDisplayed\s*\(\)\s*(?:,\s*"([^"]*)"\s*)?\)/,
      replacement: 'await expect($1).toBeVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'assertTrue(isDisplayed) → expect.toBeVisible',
    },
    {
      regex: /assertFalse\s*\(\s*(.+?)\.isDisplayed\s*\(\)\s*\)/,
      replacement: 'await expect($1).toBeHidden()',
      confidence: 'high',
      category: 'assertion',
      description: 'assertFalse(isDisplayed) → expect.toBeHidden',
    },
    {
      regex: /assertTrue\s*\(\s*(.+?)\.getText\s*\(\)\.contains\s*\(\s*"([^"]+)"\s*\)\s*\)/,
      replacement: 'await expect($1).toContainText("$2")',
      confidence: 'high',
      category: 'assertion',
      description: 'assertTrue(getText.contains) → expect.toContainText',
    },
    {
      regex: /assertTrue\s*\(\s*(.+?)\.getText\s*\(\)\.contains\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'await expect($1).toContainText($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'assertTrue(getText.contains) → expect.toContainText',
    },
    {
      regex: /assertTrue\s*\(\s*(.+?)\.isEnabled\s*\(\)\s*\)/,
      replacement: 'await expect($1).toBeEnabled()',
      confidence: 'high',
      category: 'assertion',
      description: 'assertTrue(isEnabled) → expect.toBeEnabled',
    },
    {
      regex: /assertEquals\s*\(\s*(.+?)\s*,\s*driver\.getTitle\s*\(\)\s*\)/,
      replacement: 'await expect(page).toHaveTitle($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'assertEquals(getTitle) → expect.toHaveTitle',
    },
    {
      regex: /assertEquals\s*\(\s*driver\.getTitle\s*\(\)\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveTitle($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'assertEquals(getTitle) → expect.toHaveTitle',
    },
    {
      regex: /assertEquals\s*\(\s*(.+?)\s*,\s*driver\.getCurrentUrl\s*\(\)\s*\)/,
      replacement: 'await expect(page).toHaveURL($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'assertEquals(getCurrentUrl) → expect.toHaveURL',
    },
    {
      regex: /assertNotNull\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect($1).toBeAttached()',
      confidence: 'high',
      category: 'assertion',
      description: 'assertNotNull → expect.toBeAttached',
    },

    // ── JS assertions (assert.strictEqual, assert.ok) ──
    {
      regex: /assert\.strictEqual\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBe($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert.strictEqual → expect.toBe',
    },
    {
      regex: /assert\.ok\s*\(\s*(.+?)\.includes\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'expect($1).toContain($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert.ok(includes) → expect.toContain',
    },
    {
      regex: /assert\.ok\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeTruthy()',
      confidence: 'high',
      category: 'assertion',
      description: 'assert.ok → expect.toBeTruthy',
    },

    // ── JS Selenium wait patterns ──
    {
      regex:
        /(?:await\s+)?driver\.wait\s*\(\s*until\.elementLocated\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*(?:,\s*\d+)?\s*\)/,
      replacement: "await page.locator('#$1').waitFor()",
      confidence: 'high',
      category: 'wait',
      description: 'driver.wait(until.elementLocated) → locator.waitFor',
    },
    {
      regex:
        /(?:await\s+)?driver\.wait\s*\(\s*until\.urlContains\s*\(\s*(.+?)\s*\)\s*(?:,\s*\d+)?\s*\)/,
      replacement: 'await expect(page).toHaveURL(new RegExp($1))',
      confidence: 'high',
      category: 'wait',
      description: 'driver.wait(until.urlContains) → expect.toHaveURL',
    },
    {
      regex: /(?:await\s+)?driver\.sleep\s*\(\s*(\d+)\s*\)/,
      replacement: '// [automigrate] Removed driver.sleep($1) — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'driver.sleep → auto-wait',
    },

    // ── JS Selenium Builder (skip) ──
    {
      regex: /(?:const|let|var)\s+driver\s*=\s*(?:await\s+)?new\s+Builder\(\).*\.build\(\)/,
      replacement: '// [automigrate] Playwright test provides page fixture automatically',
      confidence: 'high',
      category: 'navigation',
      description: 'Builder.build → test fixture',
    },
    {
      regex: /(?:const|let|var)\s+\{.*\}\s*=\s*require\s*\(\s*['"]selenium-webdriver['"]\s*\)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip selenium-webdriver require',
    },
    {
      regex: /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]assert['"]\s*\)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip assert require',
    },
    {
      regex: /(?:await\s+)?driver\.quit\s*\(\)/,
      replacement: '// [automigrate] Playwright handles browser cleanup',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.quit → handled by Playwright',
    },

    // ── Navigation ──
    {
      regex: /driver\.get\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.get → page.goto',
    },
    {
      regex: /driver\.navigate\(\)\.to\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'navigate().to → page.goto',
    },
    {
      regex: /driver\.navigate\(\)\.back\s*\(\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'navigate().back → page.goBack',
    },
    {
      regex: /driver\.navigate\(\)\.forward\s*\(\)/,
      replacement: 'await page.goForward()',
      confidence: 'high',
      category: 'navigation',
      description: 'navigate().forward → page.goForward',
    },
    {
      regex: /driver\.navigate\(\)\.refresh\s*\(\)/,
      replacement: 'await page.reload()',
      confidence: 'high',
      category: 'navigation',
      description: 'navigate().refresh → page.reload',
    },
    {
      regex: /driver\.getCurrentUrl\s*\(\)/,
      replacement: 'page.url()',
      confidence: 'high',
      category: 'navigation',
      description: 'getCurrentUrl → page.url',
    },
    {
      regex: /driver\.getTitle\s*\(\)/,
      replacement: 'await page.title()',
      confidence: 'high',
      category: 'navigation',
      description: 'getTitle → page.title',
    },
    {
      regex: /driver\.getPageSource\s*\(\)/,
      replacement: 'await page.content()',
      confidence: 'high',
      category: 'navigation',
      description: 'getPageSource → page.content',
    },

    // ── Compound: findElement + action (single-line chained) ──
    // Support both double and single quotes for Java and JS
    {
      regex:
        /driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.id).sendKeys → locator.fill',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.css).sendKeys → locator.fill',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.css\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.css).sendKeys → locator.fill',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.className\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('.$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.className).sendKeys → locator.fill',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator(\'[name="$1"]\').fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.name).sendKeys → locator.fill',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.xpath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('xpath=$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.xpath).sendKeys → locator.fill',
    },

    {
      regex: /driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('#$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.id).click → locator.click',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.css).click → locator.click',
    },
    {
      regex: /driver\.findElement\s*\(\s*By\.css\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.css).click → locator.click',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.className\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('.$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.className).click → locator.click',
    },
    {
      regex: /driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: 'await page.locator(\'[name="$1"]\').click()',
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.name).click → locator.click',
    },
    {
      regex: /driver\.findElement\s*\(\s*By\.xpath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('xpath=$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.xpath).click → locator.click',
    },

    {
      regex:
        /driver\.findElement\s*\(\s*By\.linkText\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.getByRole('link', { name: '$1' }).click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.linkText).click → getByRole.click',
    },

    {
      regex: /driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.clear\s*\(\)/,
      replacement: "await page.locator('#$1').clear()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.id).clear → locator.clear',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.clear\s*\(\)/,
      replacement: "await page.locator('$1').clear()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.css).clear → locator.clear',
    },
    {
      regex: /driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.clear\s*\(\)/,
      replacement: 'await page.locator(\'[name="$1"]\').clear()',
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.name).clear → locator.clear',
    },

    // ── Compound: findElement + state queries ──
    {
      regex: /driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.getText\s*\(\)/,
      replacement: "await page.locator('#$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.id).getText → locator.textContent',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.isDisplayed\s*\(\)/,
      replacement: "await page.locator('#$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.id).isDisplayed → locator.isVisible',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.className\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.isDisplayed\s*\(\)/,
      replacement: "await page.locator('.$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.className).isDisplayed → locator.isVisible',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.className\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.getText\s*\(\)/,
      replacement: "await page.locator('.$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.className).getText → locator.textContent',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.xpath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.isDisplayed\s*\(\)/,
      replacement: "await page.locator('xpath=$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.xpath).isDisplayed → locator.isVisible',
    },
    {
      regex: /driver\.findElement\s*\(\s*By\.css\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.getText\s*\(\)/,
      replacement: "await page.locator('$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.css).getText → locator.textContent',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.getText\s*\(\)/,
      replacement: "await page.locator('$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.cssSelector).getText → locator.textContent',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.isDisplayed\s*\(\)/,
      replacement: "await page.locator('$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.cssSelector).isDisplayed → locator.isVisible',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.getText\s*\(\)/,
      replacement: 'await page.locator(\'[name="$1"]\').textContent()',
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.name).getText → locator.textContent',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.isDisplayed\s*\(\)/,
      replacement: 'await page.locator(\'[name="$1"]\').isVisible()',
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.name).isDisplayed → locator.isVisible',
    },
    {
      regex:
        /driver\.findElement\s*\(\s*By\.xpath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.getText\s*\(\)/,
      replacement: "await page.locator('xpath=$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.xpath).getText → locator.textContent',
    },
    {
      regex: /driver\.findElement\s*\(\s*By\.xpath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('xpath=$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'findElement(By.xpath).click → locator.click',
    },

    // ── Select dropdowns ──
    {
      regex:
        /new\s+Select\s*\(\s*driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)\s*\.selectByVisibleText\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').selectOption({ label: $2 })",
      confidence: 'high',
      category: 'action',
      description: 'Select.selectByVisibleText → selectOption',
    },
    {
      regex:
        /new\s+Select\s*\(\s*driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)\s*\.selectByValue\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator(\'[name="$1"]\').selectOption($2)',
      confidence: 'high',
      category: 'action',
      description: 'Select.selectByValue → selectOption',
    },
    {
      regex:
        /new\s+Select\s*\(\s*driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)\s*\.selectByValue\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').selectOption($2)",
      confidence: 'high',
      category: 'action',
      description: 'Select.selectByValue → selectOption',
    },

    // ── Frames ──
    {
      regex: /driver\.switchTo\(\)\.frame\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      replacement:
        'const frame = page.frameLocator(\'[name="$1"]\') // TODO: [automigrate] Use frame.locator() for selectors inside this iframe',
      confidence: 'medium',
      category: 'action',
      description: 'switchTo.frame → frameLocator',
      requiresManualReview: true,
    },
    {
      regex: /driver\.switchTo\(\)\.defaultContent\s*\(\)/,
      replacement:
        '// [automigrate] Back to main frame — use page.locator() instead of frame.locator() from here',
      confidence: 'medium',
      category: 'action',
      description: 'switchTo.defaultContent → main frame',
      requiresManualReview: true,
    },

    // ── Alerts ──
    {
      regex: /(?:Alert\s+\w+\s*=\s*)?driver\.switchTo\(\)\.alert\s*\(\)/,
      replacement:
        "// TODO: [automigrate] Handle dialog: page.on('dialog', dialog => dialog.accept())",
      confidence: 'medium',
      category: 'action',
      description: 'switchTo.alert → page.on(dialog)',
      requiresManualReview: true,
    },

    // ── Window handles ──
    {
      regex: /driver\.getWindowHandle\s*\(\)/,
      replacement:
        "// TODO: [automigrate] Use const [newPage] = await Promise.all([context.waitForEvent('page'), clickAction])",
      confidence: 'medium',
      category: 'action',
      description: 'getWindowHandle → waitForEvent(page)',
      requiresManualReview: true,
    },
    {
      regex: /driver\.getWindowHandles\s*\(\)/,
      replacement: '// TODO: [automigrate] Use context.pages() to get all open pages',
      confidence: 'medium',
      category: 'action',
      description: 'getWindowHandles → context.pages()',
      requiresManualReview: true,
    },
    {
      regex: /driver\.switchTo\(\)\.window\s*\(\s*(.+?)\s*\)/,
      replacement:
        '// TODO: [automigrate] Switch to page: const page2 = context.pages().find(p => ...)',
      confidence: 'medium',
      category: 'action',
      description: 'switchTo.window → context.pages()',
      requiresManualReview: true,
    },

    // ── JavaScript execution ──
    {
      regex: /\(\(JavascriptExecutor\)\s*driver\)\.executeScript\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.evaluate($1)',
      confidence: 'high',
      category: 'action',
      description: 'JavascriptExecutor → page.evaluate',
    },

    // ── findElements (plural) ──
    {
      regex:
        /(?:List<WebElement>\s+)?(\w+)\s*=\s*driver\.findElements\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('$2')",
      confidence: 'high',
      category: 'selector',
      description: 'findElements(By.css) → locator (plural)',
    },
    {
      regex:
        /(?:List<WebElement>\s+)?(\w+)\s*=\s*driver\.findElements\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('#$2')",
      confidence: 'high',
      category: 'selector',
      description: 'findElements(By.id) → locator (plural)',
    },

    // ── URL waits ──
    {
      regex: /\w+\.until\s*\(\s*ExpectedConditions\.urlContains\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'await expect(page).toHaveURL(new RegExp($1))',
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(urlContains) → expect.toHaveURL',
    },
    {
      regex: /\w+\.until\s*\(\s*ExpectedConditions\.titleContains\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'await expect(page).toHaveTitle(new RegExp($1))',
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(titleContains) → expect.toHaveTitle',
    },
    {
      regex:
        /\w+\.until\s*\(\s*ExpectedConditions\.textToBePresentInElementLocated\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*,\s*(.+?)\s*\)\s*\)/,
      replacement: "await expect(page.locator('#$1')).toContainText($2)",
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(textPresent) → expect.toContainText',
    },
    {
      regex:
        /\w+\.until\s*\(\s*ExpectedConditions\.presenceOfAllElementsLocatedBy\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('$1').first().waitFor()",
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(presenceOfAll) → first().waitFor',
    },

    // ── Variable assignment: [WebElement|const|let|var] var = driver.findElement(...) ──
    {
      regex:
        /(?:(?:WebElement|const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?driver\.findElement\s*\(\s*By\.id\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('#$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = findElement(By.id) → const = locator',
    },
    {
      regex:
        /(?:(?:WebElement|const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?driver\.findElement\s*\(\s*By\.cssSelector\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = findElement(By.css) → const = locator',
    },
    {
      regex:
        /(?:(?:WebElement|const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?driver\.findElement\s*\(\s*By\.css\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = findElement(By.css) → const = locator',
    },
    {
      regex:
        /(?:(?:WebElement|const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?driver\.findElement\s*\(\s*By\.xpath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('xpath=$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = findElement(By.xpath) → const = locator',
    },
    {
      regex:
        /(?:(?:WebElement|const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?driver\.findElement\s*\(\s*By\.className\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "const $1 = page.locator('.$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = findElement(By.className) → const = locator',
    },
    {
      regex:
        /(?:(?:WebElement|const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?driver\.findElement\s*\(\s*By\.name\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: 'const $1 = page.locator(\'[name="$2"]\')',
      confidence: 'high',
      category: 'selector',
      description: 'var = findElement(By.name) → const = locator',
    },

    // ── Variable-based element actions (after assignment) ──
    {
      regex: /(\w+)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'element.sendKeys → locator.fill',
    },
    {
      regex: /(\w+)\.click\s*\(\)/,
      replacement: 'await $1.click()',
      confidence: 'high',
      category: 'action',
      description: 'element.click → locator.click',
    },
    {
      regex: /(\w+)\.clear\s*\(\)/,
      replacement: 'await $1.clear()',
      confidence: 'high',
      category: 'action',
      description: 'element.clear → locator.clear',
    },
    {
      regex: /(\w+)\.getText\s*\(\)/,
      replacement: 'await $1.textContent()',
      confidence: 'high',
      category: 'action',
      description: 'element.getText → locator.textContent',
    },
    {
      regex: /(\w+)\.isDisplayed\s*\(\)/,
      replacement: 'await $1.isVisible()',
      confidence: 'high',
      category: 'action',
      description: 'element.isDisplayed → locator.isVisible',
    },
    {
      regex: /(\w+)\.isEnabled\s*\(\)/,
      replacement: 'await $1.isEnabled()',
      confidence: 'high',
      category: 'action',
      description: 'element.isEnabled → locator.isEnabled',
    },
    {
      regex: /(\w+)\.getAttribute\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.getAttribute($2)',
      confidence: 'high',
      category: 'action',
      description: 'element.getAttribute → locator.getAttribute',
    },

    // ── Waits ──
    {
      regex: /Thread\.sleep\s*\(\s*(\d+)\s*\)/,
      replacement: '// [automigrate] Removed Thread.sleep($1) — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'Thread.sleep → auto-wait comment',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.visibilityOfElementLocated\s*\(\s*By\.id\s*\(\s*"([^"]+)"\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('#$1').waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait.until(visibility) → locator.waitFor',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.elementToBeClickable\s*\(.+?\)\s*\)/,
      replacement:
        '// [automigrate] Playwright auto-waits for actionability — no explicit wait needed',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait(clickable) → auto-wait',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.titleIs\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'await expect(page).toHaveTitle($1)',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait(titleIs) → toHaveTitle',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.urlContains\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'await expect(page).toHaveURL(new RegExp($1))',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait(urlContains) → toHaveURL',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.alertIsPresent\s*\(\s*\)\s*\)/,
      replacement: "const dialog = await page.waitForEvent('dialog')",
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait(alertIsPresent) → waitForEvent(dialog)',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.presenceOfElementLocated\s*\(.+?\)\s*\)/,
      replacement: '// [automigrate] Playwright auto-waits for element presence',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait(presenceOfElementLocated) → auto-wait',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.until\s*\(\s*ExpectedConditions\.invisibilityOfElementLocated\s*\(.+?\)\s*\)/,
      replacement: "// [automigrate] Use await page.locator(...).waitFor({ state: 'hidden' })",
      confidence: 'medium',
      category: 'wait',
      description: 'WebDriverWait(invisibilityOfElementLocated) → waitFor(hidden)',
    },

    // ── Wait (variable-based) ──
    {
      regex:
        /\w+\.until\s*\(\s*ExpectedConditions\.visibilityOfElementLocated\s*\(\s*By\.id\s*\(\s*"([^"]+)"\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('#$1').waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(visibility By.id) → locator.waitFor',
    },
    {
      regex:
        /\w+\.until\s*\(\s*ExpectedConditions\.visibilityOfElementLocated\s*\(\s*By\.cssSelector\s*\(\s*"([^"]+)"\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('$1').waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(visibility By.css) → locator.waitFor',
    },
    {
      regex: /\w+\.until\s*\(\s*ExpectedConditions\.elementToBeClickable\s*\(.+?\)\s*\)/,
      replacement: '// [automigrate] Playwright auto-waits for actionability',
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(clickable) → auto-wait',
    },
    {
      regex:
        /\w+\.until\s*\(\s*ExpectedConditions\.presenceOfElementLocated\s*\(\s*By\.id\s*\(\s*"([^"]+)"\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('#$1').waitFor({ state: 'attached' })",
      confidence: 'high',
      category: 'wait',
      description: 'wait.until(presence By.id) → locator.waitFor',
    },
    {
      regex: /new\s+WebDriverWait\s*\(.+?\)\s*;?$/,
      replacement: '// [automigrate] Playwright auto-waits — explicit WebDriverWait not needed',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait declaration → comment',
    },

    // ── Window ──
    {
      regex: /driver\.manage\(\)\.window\(\)\.maximize\(\)/,
      replacement:
        '// [automigrate] Set viewport in playwright.config.ts or use page.setViewportSize()',
      confidence: 'medium',
      category: 'navigation',
      description: 'window.maximize → config viewport',
      requiresManualReview: true,
    },
    {
      regex: /driver\.manage\(\)\.timeouts\(\)\.implicitlyWait\s*\(.+?\)/,
      replacement: '// [automigrate] Set actionTimeout in playwright.config.ts',
      confidence: 'medium',
      category: 'wait',
      description: 'implicitlyWait → config timeout',
      requiresManualReview: true,
    },

    // ── Lifecycle ──
    {
      regex: /driver\.quit\s*\(\)/,
      replacement:
        '// [automigrate] Playwright handles browser lifecycle automatically in test runner',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.quit → handled by Playwright',
    },
    {
      regex: /driver\.close\s*\(\)/,
      replacement: 'await page.close()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.close → page.close',
    },

    // ── JavaScript execution ──
    {
      regex: /driver\.executeScript\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.evaluate($1)',
      confidence: 'high',
      category: 'action',
      description: 'executeScript → page.evaluate',
    },

    // ── Screenshots ──
    {
      regex: /driver\.getScreenshotAs\s*\(.+?\)/,
      replacement: "await page.screenshot({ path: 'screenshot.png' })",
      confidence: 'high',
      category: 'action',
      description: 'getScreenshotAs → page.screenshot',
    },

    // ── Actions class chains ──
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.moveToElement\s*\(\s*(\w+)\s*\)\s*\.click\s*\(\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: 'await $1.click()',
      confidence: 'high',
      category: 'action',
      description: 'Actions.moveToElement.click → locator.click',
    },
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.moveToElement\s*\(\s*(\w+)\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: 'await $1.hover()',
      confidence: 'high',
      category: 'action',
      description: 'Actions.moveToElement → locator.hover',
    },
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.doubleClick\s*\(\s*(\w+)\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: 'await $1.dblclick()',
      confidence: 'high',
      category: 'action',
      description: 'Actions.doubleClick → locator.dblclick',
    },
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.contextClick\s*\(\s*(\w+)\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: "await $1.click({ button: 'right' })",
      confidence: 'high',
      category: 'action',
      description: 'Actions.contextClick → locator.click({right})',
    },
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.dragAndDrop\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: 'await $1.dragTo($2)',
      confidence: 'high',
      category: 'action',
      description: 'Actions.dragAndDrop → locator.dragTo',
    },
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.sendKeys\s*\(\s*(.+?)\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: 'await page.keyboard.press($1)',
      confidence: 'high',
      category: 'action',
      description: 'Actions.sendKeys → page.keyboard.press',
    },
    {
      regex:
        /new\s+Actions\s*\(\s*driver\s*\)\s*\.clickAndHold\s*\(\s*(\w+)\s*\)\s*\.moveToElement\s*\(\s*(\w+)\s*\)\s*\.release\s*\(\s*\)\s*\.(?:build|perform)\s*\(\s*\)\s*(?:\.perform\s*\(\s*\))?/,
      replacement: 'await $1.dragTo($2)',
      confidence: 'high',
      category: 'action',
      description: 'Actions.clickAndHold.moveToElement.release → dragTo',
    },

    // ── Select class (dropdown) ──
    {
      regex: /new\s+Select\s*\(\s*(\w+)\s*\)\s*\.selectByVisibleText\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.selectOption({ label: $2 })',
      confidence: 'high',
      category: 'action',
      description: 'Select.selectByVisibleText → selectOption({label})',
    },
    {
      regex: /new\s+Select\s*\(\s*(\w+)\s*\)\s*\.selectByValue\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.selectOption($2)',
      confidence: 'high',
      category: 'action',
      description: 'Select.selectByValue → selectOption',
    },
    {
      regex: /new\s+Select\s*\(\s*(\w+)\s*\)\s*\.selectByIndex\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.selectOption({ index: $2 })',
      confidence: 'high',
      category: 'action',
      description: 'Select.selectByIndex → selectOption({index})',
    },
    {
      regex: /new\s+Select\s*\(\s*(\w+)\s*\)\s*\.deselectAll\s*\(\s*\)/,
      replacement: 'await $1.selectOption([])',
      confidence: 'high',
      category: 'action',
      description: 'Select.deselectAll → selectOption([])',
    },
    {
      regex: /new\s+Select\s*\(\s*(\w+)\s*\)\s*\.getFirstSelectedOption\s*\(\s*\)\.getText\s*\(\)/,
      replacement: 'await $1.inputValue()',
      confidence: 'medium',
      category: 'action',
      description: 'Select.getFirstSelectedOption → inputValue',
    },
    {
      regex: /Select\s+\w+\s*=\s*new\s+Select\s*\(\s*(.+?)\s*\)\s*;?/,
      replacement: '// Select dropdown: use $1.selectOption() directly',
      confidence: 'medium',
      category: 'action',
      description: 'new Select() → use selectOption directly',
    },

    // ── Multi-window/tab handling ──
    {
      regex: /driver\.getWindowHandle\s*\(\s*\)/,
      replacement: 'page',
      confidence: 'high',
      category: 'navigation',
      description: 'getWindowHandle → page reference',
    },
    {
      regex: /driver\.getWindowHandles\s*\(\s*\)/,
      replacement: 'context.pages()',
      confidence: 'high',
      category: 'navigation',
      description: 'getWindowHandles → context.pages()',
    },
    {
      regex: /driver\.switchTo\(\)\.window\s*\(\s*(.+?)\s*\)/,
      replacement:
        '// [automigrate] switchTo().window($1) → use context.pages() to find the target page',
      confidence: 'medium',
      category: 'navigation',
      description: 'switchTo.window → context.pages',
    },
    {
      regex: /driver\.switchTo\(\)\.newWindow\s*\(\s*WindowType\.\w+\s*\)/,
      replacement: 'const newPage = await context.newPage()',
      confidence: 'high',
      category: 'navigation',
      description: 'switchTo.newWindow → context.newPage',
    },

    // ── Alert handling ──
    {
      regex: /driver\.switchTo\(\)\.alert\(\)\.accept\s*\(\)/,
      replacement: "page.on('dialog', dialog => dialog.accept())",
      confidence: 'high',
      category: 'action',
      description: 'alert.accept → dialog.accept',
    },
    {
      regex: /driver\.switchTo\(\)\.alert\(\)\.dismiss\s*\(\)/,
      replacement: "page.on('dialog', dialog => dialog.dismiss())",
      confidence: 'high',
      category: 'action',
      description: 'alert.dismiss → dialog.dismiss',
    },
    {
      regex: /driver\.switchTo\(\)\.alert\(\)\.getText\s*\(\)/,
      replacement: "// [automigrate] Use page.on('dialog', d => d.message()) to capture alert text",
      confidence: 'medium',
      category: 'action',
      description: 'alert.getText → dialog.message',
    },
    {
      regex: /driver\.switchTo\(\)\.alert\(\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "page.on('dialog', dialog => dialog.accept($1))",
      confidence: 'medium',
      category: 'action',
      description: 'alert.sendKeys → dialog.accept with text',
    },

    // ── Skip Java boilerplate ──
    {
      regex: /^(?:public\s+)?class\s+\w+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip class declaration',
    },
    {
      regex: /^\s*(?:WebDriver|ChromeDriver|FirefoxDriver)\s+\w+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver declaration',
    },
    {
      regex: /^\s*@(?:Before|After)(?:Method|Each|All|Class)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip annotations',
    },
    {
      regex: /^\s*@Test/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip @Test annotation',
    },
    {
      regex: /^\s*@(?:DataProvider|ParameterizedTest|ValueSource|CsvSource|MethodSource)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip parameterized test annotations',
    },
    {
      regex: /^\s*import\s+(?:org\.openqa\.selenium|org\.testng|org\.junit|io\.github\.bonigarcia)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Java test imports',
    },
    {
      regex:
        /^\s*(?:public|private|protected)?\s*(?:static\s+)?void\s+\w+\s*\(.*?\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*\{?\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Java method signatures',
    },
    {
      regex: /^\s*driver\s*=\s*new\s+(?:Chrome|Firefox|Edge|Safari)Driver/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver instantiation',
    },
    {
      regex: /^\s*if\s*\(\s*driver\s*!=\s*null\s*\)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver null check',
    },
    {
      regex: /^\s*(?:WebDriver|ChromeDriver|FirefoxDriver)\s+driver\s*;/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver field declaration',
    },
    {
      regex: /^\s*\}\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip closing braces',
    },
  ];
}

function getCSharpDirectRules(): DirectRule[] {
  return [
    // ── Assertions (MUST come first) ──
    {
      regex: /Assert\.That\s*\(\s*(.+?)\s*,\s*Is\.EqualTo\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'expect($1).toBe($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.That(Is.EqualTo) → expect.toBe',
    },
    {
      regex: /Assert\.That\s*\(\s*(.+?)\s*,\s*Does\.Contain\s*\(\s*(.+?)\s*\)\s*\)/,
      replacement: 'expect($1).toContain($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.That(Does.Contain) → expect.toContain',
    },
    {
      regex: /Assert\.That\s*\(\s*(.+?)\s*,\s*Is\.True\s*\)/,
      replacement: 'expect($1).toBeTruthy()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.That(Is.True) → expect.toBeTruthy',
    },
    {
      regex: /Assert\.That\s*\(\s*(.+?)\s*,\s*Is\.False\s*\)/,
      replacement: 'expect($1).toBeFalsy()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.That(Is.False) → expect.toBeFalsy',
    },
    {
      regex: /Assert\.That\s*\(\s*(.+?)\s*,\s*Is\.Not\.Null\s*\)/,
      replacement: 'expect($1).not.toBeNull()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.That(Is.Not.Null) → expect.not.toBeNull',
    },
    {
      regex: /Assert\.IsTrue\s*\(\s*(.+?)\.Displayed\s*\)/,
      replacement: 'await expect($1).toBeVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.IsTrue(Displayed) → expect.toBeVisible',
    },
    {
      regex: /Assert\.IsTrue\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeTruthy()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.IsTrue → expect.toBeTruthy',
    },
    {
      regex: /Assert\.IsFalse\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeFalsy()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.IsFalse → expect.toBeFalsy',
    },
    {
      regex: /Assert\.AreEqual\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($2).toBe($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.AreEqual → expect.toBe',
    },
    {
      regex: /Assert\.AreNotEqual\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($2).not.toBe($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.AreNotEqual → expect.not.toBe',
    },
    {
      regex: /Assert\.IsNotNull\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).not.toBeNull()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.IsNotNull → expect.not.toBeNull',
    },
    {
      regex: /Assert\.IsNull\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeNull()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.IsNull → expect.toBeNull',
    },
    // xUnit assertions
    {
      regex: /Assert\.Equal\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($2).toBe($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.Equal → expect.toBe',
    },
    {
      regex: /Assert\.NotEqual\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($2).not.toBe($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.NotEqual → expect.not.toBe',
    },
    {
      regex: /Assert\.True\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeTruthy()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.True → expect.toBeTruthy',
    },
    {
      regex: /Assert\.False\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeFalsy()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.False → expect.toBeFalsy',
    },
    {
      regex: /Assert\.Contains\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($2).toContain($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.Contains → expect.toContain',
    },
    {
      regex: /Assert\.NotNull\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).not.toBeNull()',
      confidence: 'high',
      category: 'assertion',
      description: 'Assert.NotNull → expect.not.toBeNull',
    },

    // ── Navigation ──
    {
      regex: /driver\.Navigate\(\)\.GoToUrl\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'Navigate().GoToUrl → page.goto',
    },
    {
      regex: /driver\.Url\s*=\s*(.+?)\s*;/,
      replacement: 'await page.goto($1);',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.Url = → page.goto',
    },
    {
      regex: /driver\.Navigate\(\)\.Back\s*\(\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'Navigate().Back → page.goBack',
    },
    {
      regex: /driver\.Navigate\(\)\.Forward\s*\(\)/,
      replacement: 'await page.goForward()',
      confidence: 'high',
      category: 'navigation',
      description: 'Navigate().Forward → page.goForward',
    },
    {
      regex: /driver\.Navigate\(\)\.Refresh\s*\(\)/,
      replacement: 'await page.reload()',
      confidence: 'high',
      category: 'navigation',
      description: 'Navigate().Refresh → page.reload',
    },
    {
      regex: /driver\.Url(?!\s*=)/,
      replacement: 'page.url()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.Url → page.url',
    },
    {
      regex: /driver\.Title/,
      replacement: 'await page.title()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.Title → page.title',
    },
    {
      regex: /driver\.PageSource/,
      replacement: 'await page.content()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.PageSource → page.content',
    },

    // ── Compound: FindElement + action (single-line chained) ──
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.SendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Id).SendKeys → locator.fill',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.CssSelector\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.SendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.CssSelector).SendKeys → locator.fill',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.ClassName\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.SendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('.$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.ClassName).SendKeys → locator.fill',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.Name\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.SendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator(\'[name="$1"]\').fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Name).SendKeys → locator.fill',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.XPath\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.SendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('xpath=$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.XPath).SendKeys → locator.fill',
    },

    {
      regex: /driver\.FindElement\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Click\s*\(\)/,
      replacement: "await page.locator('#$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Id).Click → locator.click',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.CssSelector\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Click\s*\(\)/,
      replacement: "await page.locator('$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.CssSelector).Click → locator.click',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.ClassName\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Click\s*\(\)/,
      replacement: "await page.locator('.$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.ClassName).Click → locator.click',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.LinkText\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Click\s*\(\)/,
      replacement: "await page.getByRole('link', { name: '$1' }).click()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.LinkText).Click → getByRole.click',
    },
    {
      regex: /driver\.FindElement\s*\(\s*By\.XPath\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Click\s*\(\)/,
      replacement: "await page.locator('xpath=$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.XPath).Click → locator.click',
    },
    {
      regex: /driver\.FindElement\s*\(\s*By\.Name\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Click\s*\(\)/,
      replacement: 'await page.locator(\'[name="$1"]\').click()',
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Name).Click → locator.click',
    },

    {
      regex: /driver\.FindElement\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Clear\s*\(\)/,
      replacement: "await page.locator('#$1').clear()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Id).Clear → locator.clear',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.CssSelector\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Clear\s*\(\)/,
      replacement: "await page.locator('$1').clear()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.CssSelector).Clear → locator.clear',
    },

    // ── Compound: FindElement + state queries ──
    {
      regex: /driver\.FindElement\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Text/,
      replacement: "await page.locator('#$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Id).Text → locator.textContent',
    },
    {
      regex: /driver\.FindElement\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Displayed/,
      replacement: "await page.locator('#$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.Id).Displayed → locator.isVisible',
    },
    {
      regex:
        /driver\.FindElement\s*\(\s*By\.ClassName\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Displayed/,
      replacement: "await page.locator('.$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.ClassName).Displayed → locator.isVisible',
    },
    {
      regex: /driver\.FindElement\s*\(\s*By\.ClassName\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Text/,
      replacement: "await page.locator('.$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.ClassName).Text → locator.textContent',
    },
    {
      regex: /driver\.FindElement\s*\(\s*By\.CssSelector\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Text/,
      replacement: "await page.locator('$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.CssSelector).Text → locator.textContent',
    },
    {
      regex: /driver\.FindElement\s*\(\s*By\.XPath\s*\(\s*["']([^"']+)["']\s*\)\s*\)\.Displayed/,
      replacement: "await page.locator('xpath=$1').isVisible()",
      confidence: 'high',
      category: 'action',
      description: 'FindElement(By.XPath).Displayed → locator.isVisible',
    },

    // ── Variable assignment: IWebElement var = driver.FindElement(...) ──
    {
      regex:
        /(?:(?:IWebElement|var)\s+)?(\w+)\s*=\s*driver\.FindElement\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "const $1 = page.locator('#$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = FindElement(By.Id) → const = locator',
    },
    {
      regex:
        /(?:(?:IWebElement|var)\s+)?(\w+)\s*=\s*driver\.FindElement\s*\(\s*By\.CssSelector\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "const $1 = page.locator('$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = FindElement(By.CssSelector) → const = locator',
    },
    {
      regex:
        /(?:(?:IWebElement|var)\s+)?(\w+)\s*=\s*driver\.FindElement\s*\(\s*By\.XPath\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "const $1 = page.locator('xpath=$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = FindElement(By.XPath) → const = locator',
    },
    {
      regex:
        /(?:(?:IWebElement|var)\s+)?(\w+)\s*=\s*driver\.FindElement\s*\(\s*By\.ClassName\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "const $1 = page.locator('.$2')",
      confidence: 'high',
      category: 'selector',
      description: 'var = FindElement(By.ClassName) → const = locator',
    },
    {
      regex:
        /(?:(?:IWebElement|var)\s+)?(\w+)\s*=\s*driver\.FindElement\s*\(\s*By\.Name\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: 'const $1 = page.locator(\'[name="$2"]\')',
      confidence: 'high',
      category: 'selector',
      description: 'var = FindElement(By.Name) → const = locator',
    },

    // ── FindElements (plural) ──
    {
      regex: /driver\.FindElements\s*\(\s*By\.CssSelector\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "page.locator('$1')",
      confidence: 'high',
      category: 'selector',
      description: 'FindElements(By.CssSelector) → page.locator',
    },
    {
      regex: /driver\.FindElements\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "page.locator('#$1')",
      confidence: 'high',
      category: 'selector',
      description: 'FindElements(By.Id) → page.locator',
    },
    {
      regex: /driver\.FindElements\s*\(\s*By\.ClassName\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
      replacement: "page.locator('.$1')",
      confidence: 'high',
      category: 'selector',
      description: 'FindElements(By.ClassName) → page.locator',
    },

    // ── Variable-based element actions ──
    {
      regex: /(\w+)\.SendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'element.SendKeys → locator.fill',
    },
    {
      regex: /(\w+)\.Click\s*\(\)/,
      replacement: 'await $1.click()',
      confidence: 'high',
      category: 'action',
      description: 'element.Click → locator.click',
    },
    {
      regex: /(\w+)\.Clear\s*\(\)/,
      replacement: 'await $1.clear()',
      confidence: 'high',
      category: 'action',
      description: 'element.Clear → locator.clear',
    },
    {
      regex: /(\w+)\.Text\b/,
      replacement: 'await $1.textContent()',
      confidence: 'high',
      category: 'action',
      description: 'element.Text → locator.textContent',
    },
    {
      regex: /(\w+)\.Displayed\b/,
      replacement: 'await $1.isVisible()',
      confidence: 'high',
      category: 'action',
      description: 'element.Displayed → locator.isVisible',
    },
    {
      regex: /(\w+)\.Enabled\b/,
      replacement: 'await $1.isEnabled()',
      confidence: 'high',
      category: 'action',
      description: 'element.Enabled → locator.isEnabled',
    },
    {
      regex: /(\w+)\.GetAttribute\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.getAttribute($2)',
      confidence: 'high',
      category: 'action',
      description: 'element.GetAttribute → locator.getAttribute',
    },

    // ── Waits ──
    {
      regex: /Thread\.Sleep\s*\(\s*(\d+)\s*\)/,
      replacement: '// [automigrate] Removed Thread.Sleep($1) — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'Thread.Sleep → auto-wait comment',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.Until\s*\(\s*ExpectedConditions\.ElementIsVisible\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('#$1').waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait.Until(ElementIsVisible) → locator.waitFor',
    },
    {
      regex:
        /new\s+WebDriverWait\s*\(.+?\)\.Until\s*\(\s*ExpectedConditions\.ElementToBeClickable\s*\(.+?\)\s*\)/,
      replacement:
        '// [automigrate] Playwright auto-waits for actionability — no explicit wait needed',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait(ElementToBeClickable) → auto-wait',
    },
    {
      regex:
        /\w+\.Until\s*\(\s*ExpectedConditions\.ElementIsVisible\s*\(\s*By\.Id\s*\(\s*["']([^"']+)["']\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('#$1').waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'wait.Until(ElementIsVisible By.Id) → locator.waitFor',
    },
    {
      regex: /\w+\.Until\s*\(\s*ExpectedConditions\.ElementToBeClickable\s*\(.+?\)\s*\)/,
      replacement: '// [automigrate] Playwright auto-waits for actionability',
      confidence: 'high',
      category: 'wait',
      description: 'wait.Until(ElementToBeClickable) → auto-wait',
    },
    {
      regex: /new\s+WebDriverWait\s*\(.+?\)\s*;?\s*$/,
      replacement: '// [automigrate] Playwright auto-waits — explicit WebDriverWait not needed',
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait declaration → comment',
    },
    {
      regex: /driver\.Manage\(\)\.Timeouts\(\)\.ImplicitWait\s*=\s*.+/,
      replacement: '// [automigrate] Set actionTimeout in playwright.config.ts',
      confidence: 'medium',
      category: 'wait',
      description: 'ImplicitWait → config timeout',
      requiresManualReview: true,
    },

    // ── Window ──
    {
      regex: /driver\.Manage\(\)\.Window\.Maximize\(\)/,
      replacement:
        '// [automigrate] Set viewport in playwright.config.ts or use page.setViewportSize()',
      confidence: 'medium',
      category: 'navigation',
      description: 'Window.Maximize → config viewport',
      requiresManualReview: true,
    },

    // ── Lifecycle ──
    {
      regex: /driver\.Quit\s*\(\)/,
      replacement:
        '// [automigrate] Playwright handles browser lifecycle automatically in test runner',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.Quit → handled by Playwright',
    },
    {
      regex: /driver\.Close\s*\(\)/,
      replacement: 'await page.close()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.Close → page.close',
    },
    {
      regex: /driver\.Dispose\s*\(\)/,
      replacement: '// [automigrate] Playwright handles browser cleanup',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.Dispose → handled by Playwright',
    },

    // ── JavaScript execution ──
    {
      regex: /driver\.ExecuteScript\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.evaluate($1)',
      confidence: 'high',
      category: 'action',
      description: 'ExecuteScript → page.evaluate',
    },

    // ── Screenshots ──
    {
      regex: /driver\.GetScreenshot\s*\(\)/,
      replacement: "await page.screenshot({ path: 'screenshot.png' })",
      confidence: 'high',
      category: 'action',
      description: 'GetScreenshot → page.screenshot',
    },

    // ── Skip C# boilerplate ──
    {
      regex: /^\s*using\s+OpenQA\.Selenium/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip using OpenQA.Selenium',
    },
    {
      regex: /^\s*using\s+NUnit\.Framework/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip using NUnit.Framework',
    },
    {
      regex: /^\s*using\s+Xunit/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip using Xunit',
    },
    {
      regex: /^\s*using\s+Microsoft\.VisualStudio\.TestTools/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip using MSTest',
    },
    {
      regex: /^\s*using\s+System/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip using System',
    },
    {
      regex: /^\s*namespace\s+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip namespace declaration',
    },
    {
      regex: /^\s*\[\s*(?:TestFixture|TestClass)\s*\]/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip [TestFixture]/[TestClass]',
    },
    {
      regex: /^\s*\[\s*(?:Test|Fact|Theory|TestMethod)\s*\]/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip [Test]/[Fact]/[Theory]/[TestMethod]',
    },
    {
      regex: /^\s*\[\s*(?:TestCase|InlineData)\s*\(/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip [TestCase]/[InlineData]',
    },
    {
      regex: /^\s*\[\s*(?:SetUp|TearDown|OneTimeSetUp|OneTimeTearDown)\s*\]/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip NUnit lifecycle annotations',
    },
    {
      regex: /^\s*\[\s*(?:TestInitialize|TestCleanup|ClassInitialize|ClassCleanup)\s*\]/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip MSTest lifecycle annotations',
    },
    {
      regex: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:partial\s+)?class\s+\w+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip class declaration',
    },
    {
      regex: /^\s*(?:IWebDriver|ChromeDriver|FirefoxDriver)\s+\w+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver declaration',
    },
    {
      regex: /^\s*(?:private|public|protected)\s+(?:IWebDriver|WebDriverWait)\s+\w+\s*;/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver/wait field declaration',
    },
    {
      regex: /^\s*driver\s*=\s*new\s+(?:Chrome|Firefox|Edge|Safari)Driver/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver instantiation',
    },
    {
      regex: /^\s*(?:ChromeOptions|FirefoxOptions)\s+\w+\s*=\s*new\s+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip options instantiation',
    },
    {
      regex: /^\s*\w+\.AddArgument\s*\(/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip AddArgument',
    },
    {
      regex:
        /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(?:void|Task)\s+\w+\s*\(.*?\)\s*\{?\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip C# method signatures',
    },
    {
      regex: /^\s*if\s*\(\s*driver\s*!=\s*null\s*\)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver null check',
    },
    {
      regex: /^\s*\}\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip closing braces',
    },
    {
      regex: /^\s*\{\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip opening braces',
    },
  ];
}

function getAppiumDirectRules(): DirectRule[] {
  return [
    // ── Driver instantiation ──
    {
      regex:
        /(?:IOSDriver|AndroidDriver|AppiumDriver)\s+\w+\s*=\s*new\s+(?:IOSDriver|AndroidDriver|AppiumDriver)\s*\(/,
      replacement: '// [automigrate] Playwright test runner manages browser/device lifecycle',
      confidence: 'high',
      category: 'navigation',
      description: 'AppiumDriver → test runner',
    },
    {
      regex: /(?:const|let|var)\s+\w+\s*=\s*(?:await\s+)?(?:remote|wdio)\s*\(/,
      replacement: '// [automigrate] Playwright test runner manages browser lifecycle',
      confidence: 'high',
      category: 'navigation',
      description: 'WDIO remote → test runner',
    },

    // ── Mobile locators ──
    {
      regex:
        /driver\.findElement\s*\(\s*MobileBy\.AccessibilityId\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.getByLabel('$1').click()",
      confidence: 'medium',
      category: 'action',
      description: 'MobileBy.AccessibilityId.click → getByLabel.click',
      requiresManualReview: true,
    },
    {
      regex:
        /driver\.findElement\s*\(\s*MobileBy\.AccessibilityId\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.getByLabel('$1').fill($2)",
      confidence: 'medium',
      category: 'action',
      description: 'MobileBy.AccessibilityId.sendKeys → getByLabel.fill',
      requiresManualReview: true,
    },
    {
      regex:
        /driver\.findElement\s*\(\s*MobileBy\.AccessibilityId\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "page.getByLabel('$1')",
      confidence: 'medium',
      category: 'selector',
      description: 'MobileBy.AccessibilityId → getByLabel',
      requiresManualReview: true,
    },

    {
      regex:
        /driver\.findElement\s*\(\s*AppiumBy\.accessibilityId\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.click\s*\(\)/,
      replacement: "await page.getByLabel('$1').click()",
      confidence: 'medium',
      category: 'action',
      description: 'AppiumBy.accessibilityId.click → getByLabel.click',
      requiresManualReview: true,
    },
    {
      regex:
        /driver\.findElement\s*\(\s*AppiumBy\.accessibilityId\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.getByLabel('$1').fill($2)",
      confidence: 'medium',
      category: 'action',
      description: 'AppiumBy.accessibilityId.sendKeys → getByLabel.fill',
      requiresManualReview: true,
    },
    {
      regex:
        /driver\.findElement\s*\(\s*AppiumBy\.accessibilityId\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: "page.getByLabel('$1')",
      confidence: 'medium',
      category: 'selector',
      description: 'AppiumBy.accessibilityId → getByLabel',
      requiresManualReview: true,
    },

    // ── UiAutomator selectors (Android) ──
    {
      regex:
        /driver\.findElement\s*\(\s*MobileBy\.AndroidUIAutomator\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement:
        '// TODO: [automigrate] Android UIAutomator selector: $1 — convert to CSS/XPath locator',
      confidence: 'low',
      category: 'selector',
      description: 'AndroidUIAutomator → manual conversion',
      requiresManualReview: true,
    },

    // ── iOS predicates ──
    {
      regex:
        /driver\.findElement\s*\(\s*MobileBy\.iOSNsPredicateString\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: '// TODO: [automigrate] iOS predicate: $1 — convert to CSS/XPath locator',
      confidence: 'low',
      category: 'selector',
      description: 'iOSNsPredicateString → manual conversion',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElement\s*\(\s*MobileBy\.iOSClassChain\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/,
      replacement: '// TODO: [automigrate] iOS class chain: $1 — convert to CSS/XPath locator',
      confidence: 'low',
      category: 'selector',
      description: 'iOSClassChain → manual conversion',
      requiresManualReview: true,
    },

    // ── Touch actions ──
    {
      regex: /new\s+TouchAction\s*\(\s*\w+\s*\)\.tap\s*\(\s*(.+?)\s*\)\.perform\s*\(\)/,
      replacement: 'await $1.tap() // TODO: [automigrate] Requires { hasTouch: true } in config',
      confidence: 'medium',
      category: 'action',
      description: 'TouchAction.tap → element.tap',
      requiresManualReview: true,
    },
    {
      regex:
        /new\s+TouchAction\s*\(\s*\w+\s*\)\.longPress\s*\(\s*(.+?)\s*\)\.(?:waitAction\s*\(.+?\)\s*\.)?release\s*\(\)\.perform\s*\(\)/,
      replacement:
        'await $1.click({ delay: 1000 }) // TODO: [automigrate] Adjust long press duration',
      confidence: 'low',
      category: 'action',
      description: 'TouchAction.longPress → click with delay',
      requiresManualReview: true,
    },
    {
      regex:
        /new\s+TouchAction\s*\(\s*\w+\s*\)\.press\s*\(.+?\)\.(?:waitAction\s*\(.+?\)\s*\.)?moveTo\s*\(.+?\)\.release\s*\(\)\.perform\s*\(\)/,
      replacement:
        '// TODO: [automigrate] Swipe/scroll gesture — use page.mouse.move() chain or page.touchscreen API',
      confidence: 'low',
      category: 'action',
      description: 'TouchAction swipe → mouse/touch API',
      requiresManualReview: true,
    },

    // ── MultiTouchAction (pinch/zoom) ──
    {
      regex:
        /(?:MultiTouchAction|new\s+MultiTouchAction)\s*(?:\(\s*\w+\s*\))?[\s\S]*?\.perform\s*\(\)/,
      replacement:
        '// TODO: [automigrate] Multi-touch gesture (pinch/zoom) — use page.touchscreen API or CDP for multi-finger gestures',
      confidence: 'low',
      category: 'action',
      description: 'MultiTouchAction → touchscreen API',
      requiresManualReview: true,
    },

    // ── W3C Actions API ──
    {
      regex: /new\s+PointerInput\s*\(.+?\)/,
      replacement:
        '// TODO: [automigrate] W3C PointerInput — use page.touchscreen or page.mouse API',
      confidence: 'low',
      category: 'action',
      description: 'PointerInput → touchscreen/mouse API',
      requiresManualReview: true,
    },
    {
      regex: /new\s+Sequence\s*\(.+?\)/,
      replacement:
        '// TODO: [automigrate] W3C Sequence — use page.touchscreen.tap() or page.mouse chain',
      confidence: 'low',
      category: 'action',
      description: 'Sequence → touchscreen/mouse API',
      requiresManualReview: true,
    },
    {
      regex: /\w+\.addAction\s*\(.+?\)/,
      replacement: '__SKIP__',
      confidence: 'low',
      category: 'action',
      description: 'W3C addAction → skip (handled by Sequence comment)',
    },
    {
      regex:
        /driver\.perform\s*\(\s*(?:Collections\.singletonList|Arrays\.asList|List\.of)\s*\(.+?\)\s*\)/,
      replacement:
        '// TODO: [automigrate] W3C driver.perform() — replace with Playwright page.touchscreen or page.mouse API',
      confidence: 'low',
      category: 'action',
      description: 'driver.perform(sequences) → touchscreen API',
      requiresManualReview: true,
    },

    // ── Context switching ──
    {
      regex: /driver\.context\s*\(\s*['"]NATIVE_APP['"]\s*\)/,
      replacement: '// [automigrate] Native app context — Playwright handles web views natively',
      confidence: 'medium',
      category: 'action',
      description: 'context(NATIVE_APP) → native handling',
    },
    {
      regex: /driver\.context\s*\(\s*['"]WEBVIEW[^'"]*['"]\s*\)/,
      replacement:
        '// [automigrate] WebView context — Playwright can access web content directly via page',
      confidence: 'medium',
      category: 'action',
      description: 'context(WEBVIEW) → direct page access',
    },
    {
      regex: /driver\.getContextHandles\s*\(\)/,
      replacement:
        '// TODO: [automigrate] Playwright accesses web content directly — no context switching needed',
      confidence: 'medium',
      category: 'action',
      description: 'getContextHandles → not needed',
    },

    // ── App lifecycle ──
    {
      regex: /driver\.(?:launchApp|activateApp)\s*\(\s*(?:['"]([^'"]+)['"]\s*)?\)/,
      replacement: 'await page.goto(BASE_URL) // TODO: [automigrate] Replace with actual app URL',
      confidence: 'medium',
      category: 'navigation',
      description: 'launchApp → page.goto',
      requiresManualReview: true,
    },
    {
      regex: /driver\.(?:closeApp|terminateApp)\s*\(\s*(?:['"][^'"]+['"]\s*)?\)/,
      replacement: '// [automigrate] Playwright handles app lifecycle automatically',
      confidence: 'high',
      category: 'navigation',
      description: 'closeApp → handled by Playwright',
    },
    {
      regex: /driver\.(?:installApp|removeApp)\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] App install/remove not applicable for Playwright web testing',
      confidence: 'high',
      category: 'custom',
      description: 'installApp → not applicable',
    },
    {
      regex: /driver\.resetApp\s*\(\)/,
      replacement: '// [automigrate] App reset → use page.goto() to navigate to initial state',
      confidence: 'medium',
      category: 'navigation',
      description: 'resetApp → page.goto',
    },

    // ── Device orientation ──
    {
      regex: /driver\.rotate\s*\(\s*ScreenOrientation\.LANDSCAPE\s*\)/,
      replacement:
        'await page.setViewportSize({ width: 812, height: 375 }) // TODO: [automigrate] Landscape dimensions',
      confidence: 'low',
      category: 'action',
      description: 'rotate LANDSCAPE → setViewportSize',
      requiresManualReview: true,
    },
    {
      regex: /driver\.rotate\s*\(\s*ScreenOrientation\.PORTRAIT\s*\)/,
      replacement:
        'await page.setViewportSize({ width: 375, height: 812 }) // TODO: [automigrate] Portrait dimensions',
      confidence: 'low',
      category: 'action',
      description: 'rotate PORTRAIT → setViewportSize',
      requiresManualReview: true,
    },

    // ── LambdaTest status reporting ──
    {
      regex: /driver\.executeScript\s*\(\s*['"]lambda-status\s*=\s*(?:passed|failed)['"]\s*\)/,
      replacement: '// [automigrate] LambdaTest status reporting handled via Playwright test hooks',
      confidence: 'high',
      category: 'custom',
      description: 'lambda-status → test hooks',
    },
    {
      regex: /driver\.executeScript\s*\(\s*['"]lambda-name\s*=\s*(.+?)['"]\s*\)/,
      replacement: '// [automigrate] LambdaTest test naming handled via test.describe/test()',
      confidence: 'high',
      category: 'custom',
      description: 'lambda-name → test name',
    },

    // ── Capabilities (skip) ──
    {
      regex: /^\s*DesiredCapabilities\s+\w+\s*=\s*new\s+DesiredCapabilities\s*\(\)/,
      replacement: '// [automigrate] Set device capabilities in playwright.config.ts',
      confidence: 'high',
      category: 'config',
      description: 'DesiredCapabilities → config',
    },
    {
      regex: /^\s*\w+\.setCapability\s*\(/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'config',
      description: 'setCapability → config',
    },
    {
      regex: /^\s*(?:MutableCapabilities|UiAutomator2Options|XCUITestOptions)\s+\w+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'config',
      description: 'Capabilities class → config',
    },

    // ── Appium imports (skip) ──
    {
      regex: /^\s*import\s+io\.appium\.java_client/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Appium import',
    },
    {
      regex: /^\s*import\s+org\.openqa\.selenium\.remote\.DesiredCapabilities/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip DesiredCapabilities import',
    },

    // ── MobileElement type (MUST come before bare findElement rules — first match wins) ──
    {
      regex:
        /MobileElement\s+(\w+)\s*=\s*driver\.findElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;?/,
      replacement: "const $1 = page.locator('#$2')",
      confidence: 'medium',
      category: 'selector',
      description: 'MobileElement = findElementById → const = locator',
      requiresManualReview: true,
    },
    {
      regex: /MobileElement\s+(\w+)\s*=\s*driver\.findElementByXPath\s*\(\s*"([^"]+)"\s*\)\s*;?/,
      replacement: "const $1 = page.locator('xpath=$2')",
      confidence: 'medium',
      category: 'selector',
      description: 'MobileElement = findElementByXPath → const = locator',
      requiresManualReview: true,
    },
    {
      regex:
        /MobileElement\s+(\w+)\s*=\s*driver\.findElementByClassName\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;?/,
      replacement: "const $1 = page.locator('.$2')",
      confidence: 'medium',
      category: 'selector',
      description: 'MobileElement = findElementByClassName → const = locator',
      requiresManualReview: true,
    },
    {
      regex:
        /MobileElement\s+(\w+)\s*=\s*driver\.findElement\s*\(\s*(?:MobileBy\.AccessibilityId|AppiumBy\.accessibilityId)\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*;?/,
      replacement: "const $1 = page.getByLabel('$2')",
      confidence: 'medium',
      category: 'selector',
      description: 'MobileElement = AccessibilityId → const = getByLabel',
      requiresManualReview: true,
    },
    {
      regex: /MobileElement\s+(\w+)\s*=\s*(.+)/,
      replacement: 'const $1 = $2',
      confidence: 'medium',
      category: 'selector',
      description: 'MobileElement → const (generic)',
    },

    // ── Shorthand findElement methods ──
    {
      regex: /driver\.findElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\.sendKeys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').fill($2)",
      confidence: 'medium',
      category: 'action',
      description: 'findElementById.sendKeys → locator.fill',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('#$1').click()",
      confidence: 'medium',
      category: 'action',
      description: 'findElementById.click → locator.click',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "page.locator('#$1')",
      confidence: 'medium',
      category: 'selector',
      description: 'findElementById → locator',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElementByXPath\s*\(\s*"([^"]+)"\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('xpath=$1').click()",
      confidence: 'medium',
      category: 'action',
      description: 'findElementByXPath.click → locator.click',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElementByXPath\s*\(\s*"([^"]+)"\s*\)/,
      replacement: "page.locator('xpath=$1')",
      confidence: 'medium',
      category: 'selector',
      description: 'findElementByXPath → locator',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElementByClassName\s*\(\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('.$1').click()",
      confidence: 'medium',
      category: 'action',
      description: 'findElementByClassName.click → locator.click',
      requiresManualReview: true,
    },
    {
      regex: /driver\.findElementByClassName\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "page.locator('.$1')",
      confidence: 'medium',
      category: 'selector',
      description: 'findElementByClassName → locator',
      requiresManualReview: true,
    },

    // ── Geolocation ──
    {
      regex:
        /driver\.setLocation\s*\(\s*new\s+(?:org\.openqa\.selenium\.html5\.)?Location\s*\(\s*([\d.]+)\s*,\s*([\d.-]+)\s*,\s*[\d.]+\s*\)\s*\)/,
      replacement:
        'await context.setGeolocation({ latitude: $1, longitude: $2 }) // TODO: [automigrate] Grant geolocation permission in config',
      confidence: 'medium',
      category: 'action',
      description: 'setLocation → context.setGeolocation',
      requiresManualReview: true,
    },

    // ── Device-specific operations ──
    {
      regex: /driver\.lockDevice\s*\(\)/,
      replacement: '// [automigrate] Device locking not applicable for Playwright web testing',
      confidence: 'high',
      category: 'action',
      description: 'lockDevice → not applicable',
    },
    {
      regex: /driver\.unlockDevice\s*\(\)/,
      replacement: '// [automigrate] Device unlocking not applicable for Playwright web testing',
      confidence: 'high',
      category: 'action',
      description: 'unlockDevice → not applicable',
    },
    {
      regex: /driver\.toggleWifi\s*\(\)/,
      replacement:
        '// TODO: [automigrate] Use context.setOffline(true/false) for network simulation',
      confidence: 'medium',
      category: 'action',
      description: 'toggleWifi → context.setOffline',
      requiresManualReview: true,
    },
    {
      regex: /driver\.toggleAirplaneMode\s*\(\)/,
      replacement:
        '// TODO: [automigrate] Use context.setOffline(true/false) for network simulation',
      confidence: 'medium',
      category: 'action',
      description: 'toggleAirplaneMode → context.setOffline',
      requiresManualReview: true,
    },
    {
      regex: /driver\.runAppInBackground\s*\(.+?\)/,
      replacement: '// [automigrate] App backgrounding not applicable for Playwright web testing',
      confidence: 'high',
      category: 'action',
      description: 'runAppInBackground → not applicable',
    },
    {
      regex: /driver\.isAppInstalled\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      replacement: '// [automigrate] App installation check not applicable for Playwright: $1',
      confidence: 'high',
      category: 'action',
      description: 'isAppInstalled → not applicable',
    },
    {
      regex: /driver\.getDeviceTime\s*\(\)/,
      replacement: 'new Date().toISOString() // [automigrate] Device time approximation',
      confidence: 'low',
      category: 'action',
      description: 'getDeviceTime → Date',
      requiresManualReview: true,
    },

    // ── File operations ──
    {
      regex: /driver\.pushFile\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: '// [automigrate] File push not applicable for Playwright web testing',
      confidence: 'high',
      category: 'action',
      description: 'pushFile → not applicable',
    },
    {
      regex: /driver\.pullFile\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] File pull not applicable for Playwright web testing',
      confidence: 'high',
      category: 'action',
      description: 'pullFile → not applicable',
    },

    // ── Clipboard ──
    {
      regex: /driver\.setClipboardText\s*\(\s*(.+?)\s*\)/,
      replacement:
        'await page.evaluate(text => navigator.clipboard.writeText(text), $1) // TODO: [automigrate] Grant clipboard permission',
      confidence: 'medium',
      category: 'action',
      description: 'setClipboardText → navigator.clipboard',
      requiresManualReview: true,
    },
    {
      regex: /driver\.getClipboardText\s*\(\)/,
      replacement:
        'await page.evaluate(() => navigator.clipboard.readText()) // TODO: [automigrate] Grant clipboard permission',
      confidence: 'medium',
      category: 'action',
      description: 'getClipboardText → navigator.clipboard',
      requiresManualReview: true,
    },

    // ── Keyboard actions ──
    {
      regex: /driver\.hideKeyboard\s*\(\)/,
      replacement: '// [automigrate] Keyboard hiding not needed in Playwright web testing',
      confidence: 'high',
      category: 'action',
      description: 'hideKeyboard → not needed',
    },
    {
      regex: /driver\.isKeyboardShown\s*\(\)/,
      replacement: '// [automigrate] Keyboard state not applicable in Playwright',
      confidence: 'high',
      category: 'action',
      description: 'isKeyboardShown → not applicable',
    },

    // ── Screenshots ──
    {
      regex: /driver\.getScreenshotAs\s*\(.+?\)/,
      replacement: "await page.screenshot({ path: 'screenshot.png' })",
      confidence: 'high',
      category: 'action',
      description: 'getScreenshotAs → page.screenshot',
    },

    // ── Additional Appium imports (skip) ──
    {
      regex: /^\s*import\s+org\.openqa\.selenium\.interactions\.(?:Sequence|PointerInput)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip W3C Actions imports',
    },
    {
      regex: /^\s*import\s+org\.openqa\.selenium\.html5\.Location/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Location import',
    },
    {
      regex: /^\s*import\s+java\.(?:net|time|util)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Java stdlib imports',
    },
  ];
}

function getPythonSeleniumDirectRules(): DirectRule[] {
  return [
    // ── Python Assertions ──
    {
      regex: /assert\s+(.+?)\.is_displayed\s*\(\)/,
      replacement: 'await expect($1).toBeVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'assert is_displayed → expect.toBeVisible',
    },
    {
      regex: /assert\s+(.+?)\.is_enabled\s*\(\)/,
      replacement: 'await expect($1).toBeEnabled()',
      confidence: 'high',
      category: 'assertion',
      description: 'assert is_enabled → expect.toBeEnabled',
    },
    {
      regex: /assert\s+(.+?)\s+==\s+(.+)/,
      replacement: 'expect($1).toBe($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert == → expect.toBe',
    },
    {
      regex: /assert\s+(.+?)\s+!=\s+(.+)/,
      replacement: 'expect($1).not.toBe($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert != → expect.not.toBe',
    },
    {
      regex: /assert\s+(.+?)\s+in\s+(.+)/,
      replacement: 'expect($2).toContain($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert in → expect.toContain',
    },
    {
      regex: /assert\s+(.+?)\s+is\s+not\s+None/,
      replacement: 'expect($1).toBeTruthy()',
      confidence: 'high',
      category: 'assertion',
      description: 'assert is not None → expect.toBeTruthy',
    },
    {
      regex: /assert\s+(.+?)\s+is\s+None/,
      replacement: 'expect($1).toBeFalsy()',
      confidence: 'high',
      category: 'assertion',
      description: 'assert is None → expect.toBeFalsy',
    },
    {
      regex: /assert\s+(.+?)\s+is\s+True/,
      replacement: 'expect($1).toBe(true)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert is True → expect.toBe(true)',
    },
    {
      regex: /assert\s+(.+?)\s+is\s+False/,
      replacement: 'expect($1).toBe(false)',
      confidence: 'high',
      category: 'assertion',
      description: 'assert is False → expect.toBe(false)',
    },
    {
      regex: /self\.assertEqual\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBe($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assertEqual → expect.toBe',
    },
    {
      regex: /self\.assertIn\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'expect($2).toContain($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assertIn → expect.toContain',
    },
    {
      regex: /self\.assertTrue\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeTruthy()',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assertTrue → expect.toBeTruthy',
    },
    {
      regex: /self\.assertFalse\s*\(\s*(.+?)\s*\)/,
      replacement: 'expect($1).toBeFalsy()',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assertFalse → expect.toBeFalsy',
    },
    {
      regex: /assert\s+len\s*\(\s*(.+?)\s*\)\s*(?:>=?|>)\s*(\d+)/,
      replacement: 'expect(await $1.count()).toBeGreaterThanOrEqual($2)',
      confidence: 'medium',
      category: 'assertion',
      description: 'assert len >= → expect.count.toBeGreaterThanOrEqual',
    },

    // ── Python Compound: find_element + action (MUST come before standalone find_element) ──
    // By.ID
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\.send_keys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.ID).send_keys → locator.fill',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('#$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.ID).click → locator.click',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\.clear\s*\(\)/,
      replacement: "await page.locator('#$1').clear()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.ID).clear → locator.clear',
    },
    {
      regex: /(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\.text/,
      replacement: "await page.locator('#$1').textContent()",
      confidence: 'high',
      category: 'selector',
      description: 'find_element(By.ID).text → locator.textContent',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\.get_attribute\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').getAttribute($2)",
      confidence: 'high',
      category: 'selector',
      description: 'find_element(By.ID).get_attribute → locator.getAttribute',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\.is_displayed\s*\(\)/,
      replacement: "await page.locator('#$1').isVisible()",
      confidence: 'high',
      category: 'assertion',
      description: 'find_element(By.ID).is_displayed → locator.isVisible',
    },
    // By.CSS_SELECTOR
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)\.send_keys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.CSS_SELECTOR).send_keys → locator.fill',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.CSS_SELECTOR).click → locator.click',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)\.clear\s*\(\)/,
      replacement: "await page.locator('$1').clear()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.CSS_SELECTOR).clear → locator.clear',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)\.text/,
      replacement: "await page.locator('$1').textContent()",
      confidence: 'high',
      category: 'selector',
      description: 'find_element(By.CSS_SELECTOR).text → locator.textContent',
    },
    // By.XPATH
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.XPATH\s*,\s*['"]([^'"]+)['"]\s*\)\.send_keys\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('xpath=$1').fill($2)",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.XPATH).send_keys → locator.fill',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.XPATH\s*,\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('xpath=$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.XPATH).click → locator.click',
    },
    {
      regex: /(?:self\.)?driver\.find_element\s*\(\s*By\.XPATH\s*,\s*['"]([^'"]+)['"]\s*\)\.text/,
      replacement: "await page.locator('xpath=$1').textContent()",
      confidence: 'high',
      category: 'selector',
      description: 'find_element(By.XPATH).text → locator.textContent',
    },
    // By.NAME
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.NAME\s*,\s*['"]([^'"]+)['"]\s*\)\.send_keys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator(\'[name="$1"]\').fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.NAME).send_keys → locator.fill',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.NAME\s*,\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: 'await page.locator(\'[name="$1"]\').click()',
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.NAME).click → locator.click',
    },
    // By.CLASS_NAME
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.CLASS_NAME\s*,\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.locator('.$1').click()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.CLASS_NAME).click → locator.click',
    },
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.CLASS_NAME\s*,\s*['"]([^'"]+)['"]\s*\)\.text/,
      replacement: "await page.locator('.$1').textContent()",
      confidence: 'high',
      category: 'selector',
      description: 'find_element(By.CLASS_NAME).text → locator.textContent',
    },
    // By.LINK_TEXT
    {
      regex:
        /(?:self\.)?driver\.find_element\s*\(\s*By\.LINK_TEXT\s*,\s*['"]([^'"]+)['"]\s*\)\.click\s*\(\)/,
      replacement: "await page.getByRole('link', { name: '$1' }).click()",
      confidence: 'high',
      category: 'action',
      description: 'find_element(By.LINK_TEXT).click → getByRole(link).click',
    },

    // ── Generic find_element variable assignment ──
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('#$2')",
      confidence: 'high',
      category: 'selector',
      description: 'element = find_element(By.ID) → const = page.locator',
    },
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_element\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('$2')",
      confidence: 'high',
      category: 'selector',
      description: 'element = find_element(By.CSS_SELECTOR) → const = page.locator',
    },
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_element\s*\(\s*By\.XPATH\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('xpath=$2')",
      confidence: 'high',
      category: 'selector',
      description: 'element = find_element(By.XPATH) → const = page.locator',
    },
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_element\s*\(\s*By\.NAME\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: 'const $1 = page.locator(\'[name="$2"]\')',
      confidence: 'high',
      category: 'selector',
      description: 'element = find_element(By.NAME) → const = page.locator',
    },
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_element\s*\(\s*By\.CLASS_NAME\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('.$2')",
      confidence: 'high',
      category: 'selector',
      description: 'element = find_element(By.CLASS_NAME) → const = page.locator',
    },

    // ── find_elements (plural) ──
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_elements\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('$2')",
      confidence: 'high',
      category: 'selector',
      description: 'find_elements(By.CSS_SELECTOR) → page.locator',
    },
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_elements\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('#$2')",
      confidence: 'high',
      category: 'selector',
      description: 'find_elements(By.ID) → page.locator',
    },
    {
      regex:
        /(\w+)\s*=\s*(?:self\.)?driver\.find_elements\s*\(\s*By\.XPATH\s*,\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "const $1 = page.locator('xpath=$2')",
      confidence: 'high',
      category: 'selector',
      description: 'find_elements(By.XPATH) → page.locator',
    },

    // ── Variable-based element actions (element.send_keys, element.click, etc.) ──
    {
      regex: /(\w+)\.send_keys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'element.send_keys → locator.fill',
    },
    {
      regex: /(\w+)\.clear\s*\(\)/,
      replacement: 'await $1.clear()',
      confidence: 'high',
      category: 'action',
      description: 'element.clear → locator.clear',
    },
    {
      regex: /(\w+)\.click\s*\(\)/,
      replacement: 'await $1.click()',
      confidence: 'high',
      category: 'action',
      description: 'element.click → locator.click',
    },
    {
      regex: /(\w+)\.submit\s*\(\)/,
      replacement: 'await $1.press("Enter")',
      confidence: 'medium',
      category: 'action',
      description: 'element.submit → locator.press(Enter)',
    },

    // ── Select Dropdowns ──
    {
      regex:
        /Select\s*\(\s*(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)\.select_by_visible_text\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').selectOption({ label: $2 })",
      confidence: 'high',
      category: 'action',
      description: 'Select.select_by_visible_text → selectOption(label)',
    },
    {
      regex:
        /Select\s*\(\s*(?:self\.)?driver\.find_element\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)\.select_by_value\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator('#$1').selectOption($2)",
      confidence: 'high',
      category: 'action',
      description: 'Select.select_by_value → selectOption',
    },
    {
      regex: /(\w+)\.select_by_visible_text\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.selectOption({ label: $2 })',
      confidence: 'high',
      category: 'action',
      description: 'select_by_visible_text → selectOption(label)',
    },
    {
      regex: /(\w+)\.select_by_value\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.selectOption($2)',
      confidence: 'high',
      category: 'action',
      description: 'select_by_value → selectOption',
    },
    {
      regex: /(\w+)\.select_by_index\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.selectOption({ index: $2 })',
      confidence: 'high',
      category: 'action',
      description: 'select_by_index → selectOption(index)',
    },

    // ── Navigation ──
    {
      regex: /(?:self\.)?driver\.get\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.get → page.goto',
    },
    {
      regex: /(?:self\.)?driver\.back\s*\(\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.back → page.goBack',
    },
    {
      regex: /(?:self\.)?driver\.forward\s*\(\)/,
      replacement: 'await page.goForward()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.forward → page.goForward',
    },
    {
      regex: /(?:self\.)?driver\.refresh\s*\(\)/,
      replacement: 'await page.reload()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.refresh → page.reload',
    },
    {
      regex: /(?:self\.)?driver\.title/,
      replacement: 'await page.title()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.title → page.title()',
    },
    {
      regex: /(?:self\.)?driver\.current_url/,
      replacement: 'page.url()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.current_url → page.url()',
    },
    {
      regex: /(?:self\.)?driver\.page_source/,
      replacement: 'await page.content()',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.page_source → page.content()',
    },

    // ── JavaScript execution ──
    {
      regex: /(?:self\.)?driver\.execute_script\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.evaluate($1)',
      confidence: 'high',
      category: 'action',
      description: 'driver.execute_script → page.evaluate',
    },
    {
      regex: /(?:self\.)?driver\.execute_async_script\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.evaluate($1)',
      confidence: 'medium',
      category: 'action',
      description: 'driver.execute_async_script → page.evaluate',
      requiresManualReview: true,
    },

    // ── Frame switching ──
    {
      regex: /(?:self\.)?driver\.switch_to\.frame\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] Frame: use page.frameLocator($1) instead of switch_to.frame',
      confidence: 'medium',
      category: 'navigation',
      description: 'switch_to.frame → frameLocator',
      requiresManualReview: true,
    },
    {
      regex: /(?:self\.)?driver\.switch_to\.default_content\s*\(\)/,
      replacement: '// [automigrate] switchToDefaultContent — use parent page reference instead',
      confidence: 'medium',
      category: 'navigation',
      description: 'switch_to.default_content → parent page reference',
    },
    {
      regex: /(?:self\.)?driver\.switch_to\.parent_frame\s*\(\)/,
      replacement: '// [automigrate] switchToParentFrame — use parent frameLocator reference',
      confidence: 'medium',
      category: 'navigation',
      description: 'switch_to.parent_frame → parent frameLocator',
    },

    // ── Alert handling ──
    {
      regex: /(?:self\.)?driver\.switch_to\.alert\.accept\s*\(\)/,
      replacement: "page.on('dialog', dialog => dialog.accept())",
      confidence: 'medium',
      category: 'action',
      description: 'switch_to.alert.accept → dialog.accept',
      requiresManualReview: true,
    },
    {
      regex: /(?:self\.)?driver\.switch_to\.alert\.dismiss\s*\(\)/,
      replacement: "page.on('dialog', dialog => dialog.dismiss())",
      confidence: 'medium',
      category: 'action',
      description: 'switch_to.alert.dismiss → dialog.dismiss',
      requiresManualReview: true,
    },
    {
      regex: /(?:self\.)?driver\.switch_to\.alert\.text/,
      replacement: '// [automigrate] Alert text: capture in dialog handler — dialog.message()',
      confidence: 'medium',
      category: 'action',
      description: 'switch_to.alert.text → dialog.message()',
      requiresManualReview: true,
    },

    // ── Cookies ──
    {
      regex: /(?:self\.)?driver\.get_cookies\s*\(\)/,
      replacement: 'await context.cookies()',
      confidence: 'high',
      category: 'action',
      description: 'driver.get_cookies → context.cookies',
    },
    {
      regex: /(?:self\.)?driver\.add_cookie\s*\(\s*(.+?)\s*\)/,
      replacement: 'await context.addCookies([$1])',
      confidence: 'high',
      category: 'action',
      description: 'driver.add_cookie → context.addCookies',
    },
    {
      regex: /(?:self\.)?driver\.delete_all_cookies\s*\(\)/,
      replacement: 'await context.clearCookies()',
      confidence: 'high',
      category: 'action',
      description: 'driver.delete_all_cookies → context.clearCookies',
    },

    // ── Waits ──
    {
      regex:
        /WebDriverWait\s*\(\s*(?:self\.)?driver\s*,\s*(\d+)\s*\)\.until\s*\(\s*EC\.presence_of_element_located\s*\(\s*\(\s*By\.ID\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('#$2').waitFor({ timeout: $1 * 1000 })",
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait.until(presence) → locator.waitFor',
    },
    {
      regex:
        /WebDriverWait\s*\(\s*(?:self\.)?driver\s*,\s*(\d+)\s*\)\.until\s*\(\s*EC\.visibility_of_element_located\s*\(\s*\(\s*By\.CSS_SELECTOR\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('$2').waitFor({ state: 'visible', timeout: $1 * 1000 })",
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait.until(visibility) → locator.waitFor(visible)',
    },
    {
      regex:
        /WebDriverWait\s*\(\s*(?:self\.)?driver\s*,\s*(\d+)\s*\)\.until\s*\(\s*EC\.element_to_be_clickable\s*\(\s*\(\s*By\.(?:ID|CSS_SELECTOR)\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)\s*\)/,
      replacement: "await page.locator('$2').waitFor({ state: 'visible', timeout: $1 * 1000 })",
      confidence: 'high',
      category: 'wait',
      description: 'WebDriverWait.until(clickable) → locator.waitFor(visible)',
    },
    {
      regex:
        /WebDriverWait\s*\(\s*(?:self\.)?driver\s*,\s*(\d+)\s*\)\.until\s*\(\s*EC\.alert_is_present\s*\(\)\s*\)/,
      replacement:
        "// [automigrate] Wait for alert: use page.on('dialog', handler) before triggering action",
      confidence: 'medium',
      category: 'wait',
      description: 'WebDriverWait(alert_is_present) → dialog handler',
      requiresManualReview: true,
    },
    {
      regex: /time\.sleep\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] Removed time.sleep($1) — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'time.sleep → auto-wait',
    },

    // ── ActionChains ──
    {
      regex:
        /ActionChains\s*\(\s*(?:self\.)?driver\s*\)\.drag_and_drop\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\.perform\s*\(\)/,
      replacement: 'await $1.dragTo($2)',
      confidence: 'high',
      category: 'action',
      description: 'ActionChains.drag_and_drop → dragTo',
    },
    {
      regex:
        /ActionChains\s*\(\s*(?:self\.)?driver\s*\)\.context_click\s*\(\s*(.+?)\s*\)\.perform\s*\(\)/,
      replacement: 'await $1.click({ button: "right" })',
      confidence: 'high',
      category: 'action',
      description: 'ActionChains.context_click → click(right)',
    },
    {
      regex:
        /ActionChains\s*\(\s*(?:self\.)?driver\s*\)\.double_click\s*\(\s*(.+?)\s*\)\.perform\s*\(\)/,
      replacement: 'await $1.dblclick()',
      confidence: 'high',
      category: 'action',
      description: 'ActionChains.double_click → dblclick',
    },
    {
      regex:
        /ActionChains\s*\(\s*(?:self\.)?driver\s*\)\.move_to_element\s*\(\s*(.+?)\s*\)\.perform\s*\(\)/,
      replacement: 'await $1.hover()',
      confidence: 'high',
      category: 'action',
      description: 'ActionChains.move_to_element → hover',
    },

    // ── Screenshots / Window ──
    {
      regex: /(?:self\.)?driver\.save_screenshot\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.screenshot({ path: $1 })',
      confidence: 'high',
      category: 'action',
      description: 'driver.save_screenshot → page.screenshot',
    },
    {
      regex: /(?:self\.)?driver\.set_window_size\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/,
      replacement: 'await page.setViewportSize({ width: $1, height: $2 })',
      confidence: 'high',
      category: 'action',
      description: 'driver.set_window_size → page.setViewportSize',
    },
    {
      regex: /(?:self\.)?driver\.maximize_window\s*\(\)/,
      replacement:
        '// [automigrate] Playwright: set viewport in config or use page.setViewportSize()',
      confidence: 'medium',
      category: 'action',
      description: 'driver.maximize_window → setViewportSize',
    },

    // ── Driver lifecycle (skip/cleanup) ──
    {
      regex: /(?:self\.)?driver\.quit\s*\(\)/,
      replacement: '// [automigrate] Playwright handles browser cleanup',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.quit → handled by Playwright',
    },
    {
      regex: /(?:self\.)?driver\.close\s*\(\)/,
      replacement: '// [automigrate] Playwright handles page cleanup',
      confidence: 'high',
      category: 'navigation',
      description: 'driver.close → handled by Playwright',
    },

    // ── Python boilerplate to skip ──
    {
      regex: /^\s*from\s+selenium/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip selenium import',
    },
    {
      regex: /^\s*from\s+webdriver_manager/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip webdriver_manager import',
    },
    {
      regex: /^\s*import\s+(?:time|unittest|pytest)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Python stdlib imports',
    },
    {
      regex:
        /^\s*(?:self\.)?driver\s*=\s*(?:webdriver\.Chrome|webdriver\.Firefox|webdriver\.Edge|ChromiumDriver|uc\.Chrome)\s*\(/,
      replacement: '// [automigrate] Playwright test provides page fixture automatically',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip driver instantiation',
    },
    {
      regex: /^\s*class\s+\w+.*(?:unittest\.TestCase|BaseCase)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip test class declaration',
    },
    {
      regex: /^\s*def\s+(?:setUp|tearDown|setUpClass|tearDownClass)\s*\(\s*(?:self|cls)\s*\)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Python test lifecycle methods',
    },
    {
      regex: /^\s*def\s+test_\w+\s*\(\s*self\s*(?:,\s*\w+)*\s*\):/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Python test method definition (wrapped by test())',
    },
    {
      regex: /^\s*if\s+__name__\s*==\s*['"]__main__['"]/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip if __name__ == __main__',
    },
    {
      regex: /^\s*unittest\.main\s*\(/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip unittest.main',
    },
    {
      regex: /^\s*pytest\.main\s*\(/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip pytest.main',
    },

    // ── SeleniumBase-specific methods ──
    {
      regex: /self\.open\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'self.open → page.goto',
    },
    {
      regex: /self\.click\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).click()',
      confidence: 'high',
      category: 'action',
      description: 'self.click → locator.click',
    },
    {
      regex: /self\.type\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'self.type → locator.fill',
    },
    {
      regex: /self\.assert_element\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assert_element → expect.toBeVisible',
    },
    {
      regex: /self\.assert_text\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($2)).toContainText($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assert_text → expect.toContainText',
    },
    {
      regex: /self\.assert_text\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator("body")).toContainText($1)',
      confidence: 'medium',
      category: 'assertion',
      description: 'self.assert_text(text) → expect(body).toContainText',
    },
    {
      regex: /self\.assert_title\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveTitle($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assert_title → expect.toHaveTitle',
    },
    {
      regex: /self\.assert_url\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveURL($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assert_url → expect.toHaveURL',
    },
    {
      regex: /self\.assert_url_contains\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveURL(new RegExp($1))',
      confidence: 'high',
      category: 'assertion',
      description: 'self.assert_url_contains → expect.toHaveURL(regex)',
    },
    {
      regex: /self\.get_text\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).textContent()',
      confidence: 'high',
      category: 'selector',
      description: 'self.get_text → locator.textContent',
    },
    {
      regex: /self\.get_attribute\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).getAttribute($2)',
      confidence: 'high',
      category: 'selector',
      description: 'self.get_attribute → locator.getAttribute',
    },
    {
      regex: /self\.is_element_visible\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).isVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'self.is_element_visible → locator.isVisible',
    },
    {
      regex: /self\.is_element_present\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).count() > 0',
      confidence: 'high',
      category: 'assertion',
      description: 'self.is_element_present → locator.count',
    },
    {
      regex: /self\.wait_for_element\s*\(\s*(.+?)\s*(?:,\s*timeout\s*=\s*(\d+))?\s*\)/,
      replacement: 'await page.locator($1).waitFor()',
      confidence: 'high',
      category: 'wait',
      description: 'self.wait_for_element → locator.waitFor',
    },
    {
      regex: /self\.wait_for_element_visible\s*\(\s*(.+?)\s*(?:,\s*timeout\s*=\s*(\d+))?\s*\)/,
      replacement: "await page.locator($1).waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'self.wait_for_element_visible → locator.waitFor(visible)',
    },
    {
      regex: /self\.wait_for_element_not_visible\s*\(\s*(.+?)\s*\)/,
      replacement: "await page.locator($1).waitFor({ state: 'hidden' })",
      confidence: 'high',
      category: 'wait',
      description: 'self.wait_for_element_not_visible → locator.waitFor(hidden)',
    },
    {
      regex: /self\.sleep\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] Removed self.sleep($1) — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'self.sleep → auto-wait',
    },
    {
      regex: /self\.scroll_to_element\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).scrollIntoViewIfNeeded()',
      confidence: 'high',
      category: 'action',
      description: 'self.scroll_to_element → scrollIntoViewIfNeeded',
    },
    {
      regex: /self\.highlight\s*\(\s*(.+?)\s*\)/,
      replacement:
        '// [automigrate] self.highlight($1) — visual debugging, no Playwright equivalent',
      confidence: 'medium',
      category: 'action',
      description: 'self.highlight → no equivalent',
    },
    {
      regex: /self\.switch_to_frame\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] Use page.frameLocator($1) for frame interactions',
      confidence: 'medium',
      category: 'navigation',
      description: 'self.switch_to_frame → frameLocator',
      requiresManualReview: true,
    },
    {
      regex: /self\.switch_to_default_content\s*\(\)/,
      replacement: '// [automigrate] Use parent page reference after frameLocator operations',
      confidence: 'medium',
      category: 'navigation',
      description: 'self.switch_to_default_content → parent page',
    },
    {
      regex: /self\.accept_alert\s*\(\)/,
      replacement: "page.on('dialog', dialog => dialog.accept())",
      confidence: 'medium',
      category: 'action',
      description: 'self.accept_alert → dialog.accept',
      requiresManualReview: true,
    },
    {
      regex: /self\.dismiss_alert\s*\(\)/,
      replacement: "page.on('dialog', dialog => dialog.dismiss())",
      confidence: 'medium',
      category: 'action',
      description: 'self.dismiss_alert → dialog.dismiss',
      requiresManualReview: true,
    },
    {
      regex: /self\.js_click\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).click({ force: true })',
      confidence: 'high',
      category: 'action',
      description: 'self.js_click → locator.click(force)',
    },
    {
      regex: /self\.double_click\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).dblclick()',
      confidence: 'high',
      category: 'action',
      description: 'self.double_click → locator.dblclick',
    },
    {
      regex: /self\.hover_and_click\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).hover(); await page.locator($2).click()',
      confidence: 'high',
      category: 'action',
      description: 'self.hover_and_click → hover + click',
    },
    {
      regex: /self\.select_option_by_text\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).selectOption({ label: $2 })',
      confidence: 'high',
      category: 'action',
      description: 'self.select_option_by_text → selectOption(label)',
    },
    {
      regex: /self\.select_option_by_value\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).selectOption($2)',
      confidence: 'high',
      category: 'action',
      description: 'self.select_option_by_value → selectOption',
    },
    {
      regex: /self\.choose_file\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).setInputFiles($2)',
      confidence: 'high',
      category: 'action',
      description: 'self.choose_file → locator.setInputFiles',
    },
    {
      regex: /self\.save_screenshot\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.screenshot({ path: $1 })',
      confidence: 'high',
      category: 'action',
      description: 'self.save_screenshot → page.screenshot',
    },
    {
      regex: /self\.get_current_url\s*\(\)/,
      replacement: 'page.url()',
      confidence: 'high',
      category: 'navigation',
      description: 'self.get_current_url → page.url',
    },
    {
      regex: /self\.get_title\s*\(\)/,
      replacement: 'await page.title()',
      confidence: 'high',
      category: 'navigation',
      description: 'self.get_title → page.title',
    },
    {
      regex: /self\.go_back\s*\(\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'self.go_back → page.goBack',
    },
    {
      regex: /self\.go_forward\s*\(\)/,
      replacement: 'await page.goForward()',
      confidence: 'high',
      category: 'navigation',
      description: 'self.go_forward → page.goForward',
    },

    // ── Python with context manager ──
    {
      regex: /^\s*with\s+self\.frame_switch\s*\(\s*(.+?)\s*\)\s*:/,
      replacement:
        '// [automigrate] Use const frame = page.frameLocator($1); then frame.locator(...)',
      confidence: 'medium',
      category: 'navigation',
      description: 'with frame_switch → frameLocator',
      requiresManualReview: true,
    },

    // ── Python triple-quote docstrings to skip ──
    {
      regex: /^\s*""".*"""$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip single-line docstring',
    },
    {
      regex: /^\s*"""/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip docstring delimiter',
    },

    // ── Python decorators ──
    {
      regex: /^\s*@pytest\.mark\.\w+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip pytest decorators',
    },
    {
      regex: /^\s*@pytest\.fixture/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip pytest fixture decorator',
    },
  ];
}

function getCypressDirectRules(): DirectRule[] {
  return [
    // ── Navigation ──
    {
      regex: /cy\.visit\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'cy.visit → page.goto',
    },
    {
      regex: /cy\.url\(\)\.should\s*\(\s*['"]include['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveURL(new RegExp($1))',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.url.should(include) → expect.toHaveURL',
    },
    {
      regex: /cy\.title\(\)\.should\s*\(\s*['"]eq['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveTitle($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.title.should(eq) → expect.toHaveTitle',
    },

    // ── Element interactions ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.clear\(\)\.type\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.clear.type → locator.fill',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.type\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.type → locator.fill',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.click\s*\(\)/,
      replacement: 'await page.locator($1).click()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.click → locator.click',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.check\s*\(\)/,
      replacement: 'await page.locator($1).check()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.check → locator.check',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.uncheck\s*\(\)/,
      replacement: 'await page.locator($1).uncheck()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.uncheck → locator.uncheck',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.select\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).selectOption($2)',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.select → locator.selectOption',
    },

    // ── Assertions ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]be\.visible['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(be.visible) → expect.toBeVisible',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]not\.be\.visible['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeHidden()',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(not.be.visible) → expect.toBeHidden',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]contain\.text['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toContainText($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(contain.text) → expect.toContainText',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]have\.text['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toHaveText($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(have.text) → expect.toHaveText',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]have\.value['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toHaveValue($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(have.value) → expect.toHaveValue',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]exist['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeAttached()',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(exist) → expect.toBeAttached',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]have\.length['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toHaveCount($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(have.length) → expect.toHaveCount',
    },
    {
      regex:
        /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]have\.attr['"]\s*,\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toHaveAttribute($2, $3)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(have.attr) → expect.toHaveAttribute',
    },

    // ── cy.contains ──
    {
      regex: /cy\.contains\s*\(\s*(.+?)\s*\)\.click\s*\(\)/,
      replacement: 'await page.getByText($1).click()',
      confidence: 'high',
      category: 'action',
      description: 'cy.contains.click → getByText.click',
    },
    {
      regex: /cy\.contains\s*\(\s*(.+?)\s*\)/,
      replacement: 'page.getByText($1)',
      confidence: 'high',
      category: 'selector',
      description: 'cy.contains → getByText',
    },

    // ── Intercept / Network ──
    {
      regex:
        /cy\.intercept\s*\(\s*['"](.+?)['"]\s*,\s*['"](.+?)['"]\s*\)\.as\s*\(\s*['"](.+?)['"]\s*\)/,
      replacement: "await page.route('$2', route => route.fulfill({ status: 200 }))",
      confidence: 'medium',
      category: 'action',
      description: 'cy.intercept → page.route',
      requiresManualReview: true,
    },
    {
      regex: /cy\.wait\s*\(\s*['"]@(.+?)['"]\s*\)/,
      replacement: '// [automigrate] Replace with page.waitForResponse() or explicit wait',
      confidence: 'medium',
      category: 'wait',
      description: 'cy.wait(@alias) → waitForResponse',
      requiresManualReview: true,
    },

    // ── Misc ──
    {
      regex: /cy\.screenshot\s*\(\s*\)/,
      replacement: 'await page.screenshot()',
      confidence: 'high',
      category: 'action',
      description: 'cy.screenshot → page.screenshot',
    },
    {
      regex: /cy\.wait\s*\(\s*(\d+)\s*\)/,
      replacement: '// [automigrate] Removed cy.wait($1) — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'cy.wait(ms) → auto-wait',
    },
    {
      regex: /cy\.reload\s*\(\)/,
      replacement: 'await page.reload()',
      confidence: 'high',
      category: 'navigation',
      description: 'cy.reload → page.reload',
    },
    {
      regex: /cy\.go\s*\(\s*['"]back['"]\s*\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'cy.go(back) → page.goBack',
    },
    {
      regex: /cy\.go\s*\(\s*['"]forward['"]\s*\)/,
      replacement: 'await page.goForward()',
      confidence: 'high',
      category: 'navigation',
      description: 'cy.go(forward) → page.goForward',
    },

    // ── Cypress.env() ──
    {
      regex: /Cypress\.env\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "process.env['$1']",
      confidence: 'high',
      category: 'action',
      description: 'Cypress.env → process.env',
    },

    // ── cy.intercept with fixture ──
    {
      regex: /cy\.intercept\s*\(\s*['"](.+?)['"]\s*,\s*\{\s*fixture:\s*['"](.+?)['"]\s*\}\s*\)/,
      replacement: "await page.route('$1', route => route.fulfill({ path: 'fixtures/$2' }))",
      confidence: 'high',
      category: 'action',
      description: 'cy.intercept(fixture) → page.route(fulfill)',
    },

    // ── cy.task → comment ──
    {
      regex: /cy\.task\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] cy.task($1) → use test fixtures or API calls',
      confidence: 'low',
      category: 'action',
      description: 'cy.task → manual conversion',
      requiresManualReview: true,
    },

    // ── cy.focused ──
    {
      regex: /cy\.focused\(\)\.clear\(\)\.type\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator(":focus").fill($1)',
      confidence: 'high',
      category: 'action',
      description: 'cy.focused.clear.type → locator(:focus).fill',
    },
    {
      regex: /cy\.focused\(\)\.type\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator(":focus").fill($1)',
      confidence: 'high',
      category: 'action',
      description: 'cy.focused.type → locator(:focus).fill',
    },

    // ── cy.get with .first / .last / .eq ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.first\(\)\.click\s*\(\)/,
      replacement: 'await page.locator($1).first().click()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.first.click → locator.first.click',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.last\(\)\.click\s*\(\)/,
      replacement: 'await page.locator($1).last().click()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.last.click → locator.last.click',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.eq\s*\(\s*(\d+)\s*\)\.click\s*\(\)/,
      replacement: 'await page.locator($1).nth($2).click()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.eq.click → locator.nth.click',
    },
    {
      regex:
        /cy\.get\s*\(\s*(.+?)\s*\)\.its\s*\(\s*['"]length['"]\s*\)\.should\s*\(\s*['"]be\.gte?['"]\s*,\s*(\d+)\s*\)/,
      replacement: 'expect(await page.locator($1).count()).toBeGreaterThanOrEqual($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.its(length).should(gte) → locator.count',
    },

    // ── cy.get.find ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.find\s*\(\s*(.+?)\s*\)\.click\s*\(\)/,
      replacement: 'await page.locator($1).locator($2).click()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.find.click → locator.locator.click',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.find\s*\(\s*(.+?)\s*\)/,
      replacement: 'page.locator($1).locator($2)',
      confidence: 'high',
      category: 'selector',
      description: 'cy.get.find → locator.locator',
    },

    // ── cy.get with force click ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.click\s*\(\s*\{\s*force:\s*true\s*\}\s*\)/,
      replacement: 'await page.locator($1).click({ force: true })',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.click(force) → locator.click(force)',
    },

    // ── cy.get.scrollIntoView ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.scrollIntoView\s*\(\)/,
      replacement: 'await page.locator($1).scrollIntoViewIfNeeded()',
      confidence: 'high',
      category: 'action',
      description: 'cy.get.scrollIntoView → scrollIntoViewIfNeeded',
    },

    // ── Additional assertions ──
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]be\.disabled['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeDisabled()',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(be.disabled) → expect.toBeDisabled',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]be\.enabled['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeEnabled()',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(be.enabled) → expect.toBeEnabled',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]be\.checked['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toBeChecked()',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(be.checked) → expect.toBeChecked',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]have\.class['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'await expect(page.locator($1)).toHaveClass(new RegExp($2))',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(have.class) → expect.toHaveClass',
    },
    {
      regex: /cy\.get\s*\(\s*(.+?)\s*\)\.should\s*\(\s*['"]not\.exist['"]\s*\)/,
      replacement: 'await expect(page.locator($1)).toHaveCount(0)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.get.should(not.exist) → expect.toHaveCount(0)',
    },

    // ── cy.clock / cy.tick ──
    {
      regex: /cy\.clock\s*\(\)/,
      replacement: 'await page.clock.install()',
      confidence: 'high',
      category: 'action',
      description: 'cy.clock → page.clock.install',
    },
    {
      regex: /cy\.tick\s*\(\s*(\d+)\s*\)/,
      replacement: 'await page.clock.fastForward($1)',
      confidence: 'high',
      category: 'action',
      description: 'cy.tick → page.clock.fastForward',
    },

    // ── cy.location ──
    {
      regex: /cy\.location\s*\(\s*['"]pathname['"]\s*\)\.should\s*\(\s*['"]eq['"]\s*,\s*(.+?)\s*\)/,
      replacement: 'expect(new URL(page.url()).pathname).toBe($1)',
      confidence: 'high',
      category: 'assertion',
      description: 'cy.location(pathname).should(eq) → URL.pathname',
    },

    // ── Cypress boilerplate to skip ──
    {
      regex: /^\s*\/\/\/\s*<reference\s+types="cypress"\s*\/>/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Cypress triple-slash reference',
    },
    {
      regex: /^\s*Cypress\.Commands\.add\s*\(/,
      replacement:
        '// [automigrate] Custom command — convert to Playwright fixture or helper function',
      confidence: 'low',
      category: 'action',
      description: 'Cypress.Commands.add → fixture/helper',
      requiresManualReview: true,
    },
    {
      regex: /^\s*import\s+.*['"]\.\.\/support/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Cypress support import',
    },
  ];
}

function getPuppeteerDirectRules(): DirectRule[] {
  return [
    // ── Browser lifecycle (MUST come first — before page.$ rules match sub-patterns) ──
    {
      regex: /(?:(?:const|let|var)\s+)?browser\s*=\s*await\s+puppeteer\.launch\s*\(.*?\)/,
      replacement: '// [automigrate] Playwright test runner manages browser lifecycle',
      confidence: 'high',
      category: 'navigation',
      description: 'puppeteer.launch → test runner',
    },
    {
      regex: /(?:(?:const|let|var)\s+)?page\s*=\s*await\s+browser\.newPage\s*\(\)/,
      replacement: '// [automigrate] Playwright test provides page fixture automatically',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.newPage → page fixture',
    },
    {
      regex: /(?:await\s+)?browser\.close\s*\(\)/,
      replacement: '// [automigrate] Playwright handles browser cleanup',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.close → handled by Playwright',
    },

    // ── Viewport ──
    {
      regex:
        /(?:await\s+)?page\.setViewport\s*\(\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\}\s*\)/,
      replacement: 'await page.setViewportSize({ width: $1, height: $2 })',
      confidence: 'high',
      category: 'navigation',
      description: 'setViewport → setViewportSize',
    },

    // ── Navigation with waitUntil (must come before generic goto) ──
    {
      regex:
        /(?:await\s+)?page\.goto\s*\(\s*(.+?)\s*,\s*\{\s*waitUntil:\s*['"]networkidle[02]['"]\s*\}\s*\)/,
      replacement: "await page.goto($1, { waitUntil: 'networkidle' })",
      confidence: 'high',
      category: 'navigation',
      description: 'page.goto with networkidle0/2 → networkidle',
    },
    {
      regex:
        /(?:await\s+)?page\.goto\s*\(\s*(.+?)\s*,\s*\{\s*waitUntil:\s*['"]domcontentloaded['"]\s*\}\s*\)/,
      replacement: "await page.goto($1, { waitUntil: 'domcontentloaded' })",
      confidence: 'high',
      category: 'navigation',
      description: 'page.goto with domcontentloaded (preserved)',
    },

    // ── Navigation ──
    {
      regex: /(?:await\s+)?page\.goto\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'page.goto (preserved)',
    },
    {
      regex: /(?:await\s+)?page\.goBack\s*\(\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'page.goBack (preserved)',
    },
    {
      regex: /(?:await\s+)?page\.reload\s*\(\)/,
      replacement: 'await page.reload()',
      confidence: 'high',
      category: 'navigation',
      description: 'page.reload (preserved)',
    },

    // ── Variable assignment with page.$ (MUST come before bare page.$) ──
    {
      regex:
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?page\.\$eval\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'const $1 = await page.locator($2).evaluate($3)',
      confidence: 'high',
      category: 'selector',
      description: 'var = page.$eval → locator.evaluate',
    },
    {
      regex:
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?page\.\$\$eval\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'const $1 = await page.locator($2).evaluateAll($3)',
      confidence: 'high',
      category: 'selector',
      description: 'var = page.$$eval → locator.evaluateAll',
    },
    {
      regex: /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?page\.\$\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'const $1 = page.locator($2)',
      confidence: 'high',
      category: 'selector',
      description: 'var = page.$$ → locator',
    },
    {
      regex: /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?page\.\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'const $1 = page.locator($2)',
      confidence: 'high',
      category: 'selector',
      description: 'var = page.$ → locator',
    },

    // ── Bare selectors (no assignment) ──
    {
      regex: /(?:await\s+)?page\.\$eval\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).evaluate($2)',
      confidence: 'high',
      category: 'selector',
      description: 'page.$eval → locator.evaluate',
    },
    {
      regex: /(?:await\s+)?page\.\$\$eval\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).evaluateAll($2)',
      confidence: 'high',
      category: 'selector',
      description: 'page.$$eval → locator.evaluateAll',
    },
    {
      regex: /(?:await\s+)?page\.\$\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'page.locator($1)',
      confidence: 'high',
      category: 'selector',
      description: 'page.$$ → page.locator',
    },
    {
      regex: /(?:await\s+)?page\.\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'page.locator($1)',
      confidence: 'high',
      category: 'selector',
      description: 'page.$ → page.locator',
    },

    // ── Page-level interactions (MUST come before variable-based to match page.type correctly) ──
    {
      regex: /(?:await\s+)?page\.click\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).click()',
      confidence: 'high',
      category: 'action',
      description: 'page.click → locator.click',
    },
    {
      regex: /(?:await\s+)?page\.type\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'page.type → locator.fill',
    },

    // ── Variable-based element interactions (element.type, element.click, etc.) ──
    {
      regex: /(?:await\s+)?(\w+)\.type\s*\(\s*(.+?)\s*\)/,
      replacement: 'await $1.fill($2)',
      confidence: 'high',
      category: 'action',
      description: 'element.type → locator.fill',
    },
    {
      regex: /(?:await\s+)?page\.focus\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).focus()',
      confidence: 'high',
      category: 'action',
      description: 'page.focus → locator.focus',
    },
    {
      regex: /(?:await\s+)?page\.hover\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).hover()',
      confidence: 'high',
      category: 'action',
      description: 'page.hover → locator.hover',
    },

    // ── Wait ──
    {
      regex:
        /(?:await\s+)?page\.waitForSelector\s*\(\s*(.+?)\s*,\s*\{\s*(?:visible:\s*true\s*,\s*)?timeout:\s*(\d+)\s*\}\s*\)/,
      replacement: "await page.locator($1).waitFor({ state: 'visible', timeout: $2 })",
      confidence: 'high',
      category: 'wait',
      description: 'waitForSelector(visible, timeout) → locator.waitFor',
    },
    {
      regex: /(?:await\s+)?page\.waitForSelector\s*\(\s*(.+?)\s*,\s*\{\s*visible:\s*true\s*\}\s*\)/,
      replacement: "await page.locator($1).waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: 'waitForSelector(visible) → locator.waitFor(visible)',
    },
    {
      regex: /(?:await\s+)?page\.waitForSelector\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.locator($1).waitFor()',
      confidence: 'high',
      category: 'wait',
      description: 'waitForSelector → locator.waitFor',
    },
    {
      regex: /(?:await\s+)?page\.waitForNavigation\s*\(\)/,
      replacement: "await page.waitForURL('**/*')",
      confidence: 'medium',
      category: 'wait',
      description: 'waitForNavigation → waitForURL',
      requiresManualReview: true,
    },
    {
      regex: /(?:await\s+)?page\.waitForTimeout\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] Removed waitForTimeout — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'waitForTimeout → auto-wait',
    },
    {
      regex: /(?:await\s+)?page\.waitFor\s*\(\s*(\d+)\s*\)/,
      replacement: '// [automigrate] Removed waitFor — Playwright auto-waits',
      confidence: 'high',
      category: 'wait',
      description: 'waitFor(ms) → auto-wait',
    },

    // ── Screenshots ──
    {
      regex: /(?:await\s+)?page\.screenshot\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.screenshot($1)',
      confidence: 'high',
      category: 'action',
      description: 'page.screenshot (preserved)',
    },

    // ── Puppeteer require/import ──
    {
      regex:
        /(?:const|let|var)\s+(?:\{?\s*puppeteer\s*\}?|\w+)\s*=\s*require\s*\(\s*['"]puppeteer['"]\s*\)/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip puppeteer require',
    },
    {
      regex: /import\s+.*puppeteer.*from\s+['"]puppeteer['"]/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip puppeteer import',
    },

    // ── Puppeteer boilerplate (browser/page lifecycle managed by Playwright) ──
    {
      regex: /^\s*let\s+browser\s*;?\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip browser variable declaration',
    },
    {
      regex: /^\s*let\s+page\s*;?\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip page variable declaration',
    },
    {
      regex: /^\s*page\s*=\s*await\s+browser\.newPage\s*\(\)\s*;?\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip page assignment from browser',
    },

    // ── IIFE wrapper removal ──
    {
      regex: /^\s*\(\s*async\s*\(\)\s*=>\s*\{/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip IIFE async wrapper opening',
    },
    {
      regex: /^\s*\}\s*\)\s*\(\s*\)\s*;?\s*$/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip IIFE closing',
    },

    // ── Frame / generic element interactions ──
    {
      regex: /(?:await\s+)?(\w+)\.waitForSelector\s*\(\s*(.+?)\s*(?:,\s*\{.*?\})?\s*\)/,
      replacement: 'await $1.locator($2).waitFor()',
      confidence: 'high',
      category: 'wait',
      description: 'frame.waitForSelector → frame.locator.waitFor',
    },
    {
      regex: /(?:await\s+)?(\w+)\.\$eval\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await $1.locator($2).evaluate($3)',
      confidence: 'high',
      category: 'selector',
      description: 'frame.$eval → frame.locator.evaluate',
    },
    {
      regex: /(?:await\s+)?(\w+)\.fill\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/,
      replacement: 'await $1.locator($2).fill($3)',
      confidence: 'high',
      category: 'action',
      description: 'frame.fill → frame.locator.fill',
    },
    {
      regex: /(?:await\s+)?(\w+)\.click\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      replacement: "await $1.locator('$2').click()",
      confidence: 'high',
      category: 'action',
      description: 'frame.click(selector) → frame.locator.click',
    },

    // ── Cookies ──
    {
      regex: /(?:await\s+)?page\.cookies\s*\(\)/,
      replacement: 'await context.cookies()',
      confidence: 'high',
      category: 'action',
      description: 'page.cookies → context.cookies',
    },
    {
      regex: /(?:await\s+)?page\.setCookie\s*\(\s*(.+?)\s*\)/,
      replacement: 'await context.addCookies([$1])',
      confidence: 'high',
      category: 'action',
      description: 'page.setCookie → context.addCookies',
    },
    {
      regex: /(?:await\s+)?page\.deleteCookie\s*\(\s*(.+?)\s*\)/,
      replacement: 'await context.clearCookies()',
      confidence: 'high',
      category: 'action',
      description: 'page.deleteCookie → context.clearCookies',
    },
  ];
}

function getWebdriverioDirectRules(): DirectRule[] {
  return [
    // ── Imports (MUST come first) ──
    {
      regex: /(?:const|let|var)\s+\{[^}]*\}\s*=\s*require\s*\(\s*['"]@wdio\/globals['"]\s*\)\s*;?/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip @wdio/globals require',
    },
    {
      regex: /import\s+\{[^}]*\}\s*from\s+['"]@wdio\/globals['"]\s*;?/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip @wdio/globals import',
    },
    {
      regex: /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]@wdio\/[^'"]+['"]\s*\)\s*;?/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip @wdio/* require',
    },

    // ── Navigation ──
    {
      regex: /(?:await\s+)?browser\.url\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.goto($1)',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.url → page.goto',
    },
    {
      regex: /(?:await\s+)?browser\.getUrl\s*\(\s*\)/,
      replacement: 'page.url()',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.getUrl → page.url',
    },
    {
      regex: /(?:await\s+)?browser\.getTitle\s*\(\s*\)/,
      replacement: 'await page.title()',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.getTitle → page.title',
    },
    {
      regex: /(?:await\s+)?browser\.back\s*\(\s*\)/,
      replacement: 'await page.goBack()',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.back → page.goBack',
    },
    {
      regex: /(?:await\s+)?browser\.forward\s*\(\s*\)/,
      replacement: 'await page.goForward()',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.forward → page.goForward',
    },
    {
      regex: /(?:await\s+)?browser\.refresh\s*\(\s*\)/,
      replacement: 'await page.reload()',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.refresh → page.reload',
    },

    // ── Page Object getter pattern (MUST come before bare $() rules) ──
    {
      regex: /get\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+\$\$\s*\(\s*(.+?)\s*\)\s*;?\s*\}/,
      replacement: 'get $1() { return this.page.locator($2); }',
      confidence: 'high',
      category: 'selector',
      description: 'PO $$ getter → page.locator',
    },
    {
      regex: /get\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+\$\s*\(\s*(.+?)\s*\)\s*;?\s*\}/,
      replacement: 'get $1() { return this.page.locator($2); }',
      confidence: 'high',
      category: 'selector',
      description: 'PO $ getter → page.locator',
    },

    // ── Selectors: $() / $$() with assignment (MUST come before bare usage) ──
    {
      regex: /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?\$\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'const $1 = page.locator($2)',
      confidence: 'high',
      category: 'selector',
      description: 'var = $$() → page.locator',
    },
    {
      regex: /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'const $1 = page.locator($2)',
      confidence: 'high',
      category: 'selector',
      description: 'var = $() → page.locator',
    },

    // ── Bare $() / $$() ──
    {
      regex: /(?:await\s+)?\$\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'page.locator($1)',
      confidence: 'high',
      category: 'selector',
      description: '$$() → page.locator',
    },
    {
      regex: /(?:await\s+)?\$\s*\(\s*(.+?)\s*\)/,
      replacement: 'page.locator($1)',
      confidence: 'high',
      category: 'selector',
      description: '$() → page.locator',
    },

    // ── Element actions ──
    {
      regex: /\.setValue\s*\(\s*(.+?)\s*\)/,
      replacement: '.fill($1)',
      confidence: 'high',
      category: 'action',
      description: '.setValue → .fill',
    },
    {
      regex: /\.addValue\s*\(\s*(.+?)\s*\)/,
      replacement: '.pressSequentially($1)',
      confidence: 'high',
      category: 'action',
      description: '.addValue → .pressSequentially',
    },
    {
      regex: /\.clearValue\s*\(\s*\)/,
      replacement: '.clear()',
      confidence: 'high',
      category: 'action',
      description: '.clearValue → .clear',
    },
    {
      regex: /\.getText\s*\(\s*\)/,
      replacement: '.textContent()',
      confidence: 'high',
      category: 'action',
      description: '.getText → .textContent',
    },
    {
      regex: /\.getValue\s*\(\s*\)/,
      replacement: '.inputValue()',
      confidence: 'high',
      category: 'action',
      description: '.getValue → .inputValue',
    },
    {
      regex: /\.isDisplayed\s*\(\s*\)/,
      replacement: '.isVisible()',
      confidence: 'high',
      category: 'action',
      description: '.isDisplayed → .isVisible',
    },
    {
      regex: /\.isExisting\s*\(\s*\)/,
      replacement: '.count().then(c => c > 0)',
      confidence: 'medium',
      category: 'action',
      description: '.isExisting → .count()',
    },
    {
      regex: /\.isSelected\s*\(\s*\)/,
      replacement: '.isChecked()',
      confidence: 'high',
      category: 'action',
      description: '.isSelected → .isChecked',
    },
    {
      regex: /\.isClickable\s*\(\s*\)/,
      replacement: '.isEnabled()',
      confidence: 'medium',
      category: 'action',
      description: '.isClickable → .isEnabled',
    },
    {
      regex: /\.doubleClick\s*\(\s*\)/,
      replacement: '.dblclick()',
      confidence: 'high',
      category: 'action',
      description: '.doubleClick → .dblclick',
    },
    {
      regex: /\.moveTo\s*\(\s*\)/,
      replacement: '.hover()',
      confidence: 'high',
      category: 'action',
      description: '.moveTo → .hover',
    },
    {
      regex: /\.scrollIntoView\s*\(\s*\)/,
      replacement: '.scrollIntoViewIfNeeded()',
      confidence: 'high',
      category: 'action',
      description: '.scrollIntoView → .scrollIntoViewIfNeeded',
    },
    {
      regex: /\.dragAndDrop\s*\(\s*(\w+)\s*\)/,
      replacement: '.dragTo($1)',
      confidence: 'high',
      category: 'action',
      description: '.dragAndDrop(target) → .dragTo(target)',
    },

    // ── Wait methods ──
    {
      regex: /\.waitForDisplayed\s*\(\s*\{[^}]*reverse\s*:\s*true[^}]*\}\s*\)/,
      replacement: ".waitFor({ state: 'hidden' })",
      confidence: 'high',
      category: 'wait',
      description: '.waitForDisplayed({reverse}) → .waitFor({hidden})',
    },
    {
      regex: /\.waitForDisplayed\s*\(\s*\)/,
      replacement: ".waitFor({ state: 'visible' })",
      confidence: 'high',
      category: 'wait',
      description: '.waitForDisplayed → .waitFor({visible})',
    },
    {
      regex: /\.waitForExist\s*\(\s*\)/,
      replacement: ".waitFor({ state: 'attached' })",
      confidence: 'high',
      category: 'wait',
      description: '.waitForExist → .waitFor({attached})',
    },
    {
      regex: /\.waitForClickable\s*\(\s*\)/,
      replacement: ".waitFor({ state: 'visible' })",
      confidence: 'medium',
      category: 'wait',
      description: '.waitForClickable → .waitFor (auto-wait)',
    },
    {
      regex: /(?:await\s+)?browser\.pause\s*\(\s*(\d+)\s*\)/,
      replacement: 'await page.waitForTimeout($1)',
      confidence: 'medium',
      category: 'wait',
      description: 'browser.pause → page.waitForTimeout',
    },
    {
      regex: /(?:await\s+)?browser\.waitUntil\s*\(/,
      replacement:
        '// [automigrate] browser.waitUntil → use expect().toPass() or page.waitForFunction(',
      confidence: 'low',
      category: 'wait',
      description: 'browser.waitUntil → manual conversion',
    },

    // ── Select/Dropdown ──
    {
      regex: /\.selectByVisibleText\s*\(\s*(.+?)\s*\)/,
      replacement: '.selectOption({ label: $1 })',
      confidence: 'high',
      category: 'action',
      description: '.selectByVisibleText → .selectOption({label})',
    },
    {
      regex: /\.selectByAttribute\s*\(\s*['"]value['"]\s*,\s*(.+?)\s*\)/,
      replacement: '.selectOption($1)',
      confidence: 'high',
      category: 'action',
      description: ".selectByAttribute('value') → .selectOption",
    },
    {
      regex: /\.selectByIndex\s*\(\s*(\d+)\s*\)/,
      replacement: '.selectOption({ index: $1 })',
      confidence: 'high',
      category: 'action',
      description: '.selectByIndex → .selectOption({index})',
    },

    // ── Keyboard ──
    {
      regex: /(?:await\s+)?browser\.keys\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.keyboard.press($1)',
      confidence: 'high',
      category: 'action',
      description: 'browser.keys → page.keyboard.press',
    },

    // ── Frames ──
    {
      regex: /(?:await\s+)?browser\.switchToFrame\s*\(\s*(\w+)\s*\)/,
      replacement: 'const frame = await $1.contentFrame()',
      confidence: 'medium',
      category: 'navigation',
      description: 'browser.switchToFrame → contentFrame()',
    },
    {
      regex: /(?:await\s+)?browser\.switchToParentFrame\s*\(\s*\)/,
      replacement: '// [automigrate] switchToParentFrame — use parent page reference',
      confidence: 'medium',
      category: 'navigation',
      description: 'switchToParentFrame → use page reference',
    },

    // ── Windows ──
    {
      regex: /(?:await\s+)?browser\.switchWindow\s*\(\s*(.+?)\s*\)/,
      replacement:
        '// [automigrate] switchWindow($1) → use context.pages() to find page by title/url',
      confidence: 'low',
      category: 'navigation',
      description: 'browser.switchWindow → context.pages()',
    },
    {
      regex: /(?:await\s+)?browser\.closeWindow\s*\(\s*\)/,
      replacement: 'await page.close()',
      confidence: 'high',
      category: 'navigation',
      description: 'browser.closeWindow → page.close()',
    },

    // ── Cookies ──
    {
      regex: /(?:await\s+)?browser\.setCookies\s*\(\s*(\{[^}]+\})\s*\)/,
      replacement: 'await context.addCookies([$1])',
      confidence: 'high',
      category: 'action',
      description: 'browser.setCookies → context.addCookies',
    },
    {
      regex: /(?:await\s+)?browser\.getCookies\s*\(\s*(.+?)\s*\)/,
      replacement: 'await context.cookies()',
      confidence: 'high',
      category: 'action',
      description: 'browser.getCookies → context.cookies',
    },
    {
      regex: /(?:await\s+)?browser\.deleteCookies\s*\(\s*(.+?)\s*\)/,
      replacement: 'await context.clearCookies()',
      confidence: 'high',
      category: 'action',
      description: 'browser.deleteCookies → context.clearCookies',
    },
    {
      regex: /(?:await\s+)?browser\.deleteAllCookies\s*\(\s*\)/,
      replacement: 'await context.clearCookies()',
      confidence: 'high',
      category: 'action',
      description: 'browser.deleteAllCookies → context.clearCookies',
    },

    // ── Screenshots ──
    {
      regex: /(?:await\s+)?browser\.saveScreenshot\s*\(\s*(.+?)\s*\)/,
      replacement: 'await page.screenshot({ path: $1 })',
      confidence: 'high',
      category: 'action',
      description: 'browser.saveScreenshot → page.screenshot',
    },
    {
      regex: /\.saveScreenshot\s*\(\s*(.+?)\s*\)/,
      replacement: '.screenshot({ path: $1 })',
      confidence: 'high',
      category: 'action',
      description: 'element.saveScreenshot → locator.screenshot',
    },

    // ── JavaScript execution ──
    {
      regex: /(?:await\s+)?browser\.execute\s*\(/,
      replacement: 'await page.evaluate(',
      confidence: 'high',
      category: 'action',
      description: 'browser.execute → page.evaluate',
    },
    {
      regex: /(?:await\s+)?browser\.executeAsync\s*\(/,
      replacement: 'await page.evaluate(',
      confidence: 'medium',
      category: 'action',
      description: 'browser.executeAsync → page.evaluate',
    },

    // ── Network mocking ──
    {
      regex: /(?:await\s+)?browser\.mock\s*\(\s*(.+?)\s*\)/,
      replacement: '// [automigrate] browser.mock($1) → use page.route($1, handler)',
      confidence: 'medium',
      category: 'action',
      description: 'browser.mock → page.route',
    },

    // ── WDIO Assertions ──
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.toBeDisplayed\s*\(\s*\)/,
      replacement: 'await expect($1).toBeVisible()',
      confidence: 'high',
      category: 'assertion',
      description: 'expect.toBeDisplayed → expect.toBeVisible',
    },
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.not\.toBeDisplayed\s*\(\s*\)/,
      replacement: 'await expect($1).toBeHidden()',
      confidence: 'high',
      category: 'assertion',
      description: 'expect.not.toBeDisplayed → expect.toBeHidden',
    },
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveTextContaining\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect($1).toContainText($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'expect.toHaveTextContaining → expect.toContainText',
    },
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.toExist\s*\(\s*\)/,
      replacement: 'await expect($1).toBeAttached()',
      confidence: 'high',
      category: 'assertion',
      description: 'expect.toExist → expect.toBeAttached',
    },
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.toBeClickable\s*\(\s*\)/,
      replacement: 'await expect($1).toBeEnabled()',
      confidence: 'medium',
      category: 'assertion',
      description: 'expect.toBeClickable → expect.toBeEnabled',
    },
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveUrl\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveURL($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'expect.toHaveUrl → expect(page).toHaveURL',
    },
    {
      regex: /await\s+expect\s*\(\s*(\w+)\s*\)\.toHaveTitle\s*\(\s*(.+?)\s*\)/,
      replacement: 'await expect(page).toHaveTitle($2)',
      confidence: 'high',
      category: 'assertion',
      description: 'expect.toHaveTitle → expect(page).toHaveTitle',
    },
  ];
}

function getRobotDirectRules(): DirectRule[] {
  return [
    // ── Section headers → comments ──
    {
      regex: /^\*{3}\s+Settings\s+\*{3}/,
      replacement: '// Robot Settings (converted to Playwright imports above)',
      confidence: 'high',
      category: 'navigation',
      description: 'Settings header',
    },
    {
      regex: /^\*{3}\s+Variables\s+\*{3}/,
      replacement: '// Robot Variables (converted to constants)',
      confidence: 'high',
      category: 'navigation',
      description: 'Variables header',
    },
    {
      regex: /^\*{3}\s+Test Cases\s+\*{3}/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Test Cases header',
    },
    {
      regex: /^\*{3}\s+Keywords\s+\*{3}/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Keywords header',
    },
    {
      regex: /^\*{3}\s+Tasks\s+\*{3}/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Tasks header',
    },

    // ── Library/Resource imports → skip (handled by import block) ──
    {
      regex: /^Library\s+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Library import',
    },
    {
      regex: /^Resource\s+/,
      replacement: '__SKIP__',
      confidence: 'high',
      category: 'navigation',
      description: 'Skip Resource import',
    },

    // ── Suite/Test setup/teardown → hooks ──
    {
      regex: /^Suite Setup\s+Open Browser\s+(.+?)\s{2,}(\w+)/,
      replacement: '// Suite setup: browser launched by Playwright',
      confidence: 'high',
      category: 'hook',
      description: 'Suite Setup Open Browser',
    },
    {
      regex: /^Suite Teardown\s+Close Browser/,
      replacement: '// Suite teardown: browser closed by Playwright',
      confidence: 'high',
      category: 'hook',
      description: 'Suite Teardown Close Browser',
    },
    {
      regex: /^Suite Setup\s+(.+)/,
      replacement: 'test.beforeAll(async () => { /* $1 */ });',
      confidence: 'medium',
      category: 'hook',
      description: 'Suite Setup → beforeAll',
    },
    {
      regex: /^Suite Teardown\s+(.+)/,
      replacement: 'test.afterAll(async () => { /* $1 */ });',
      confidence: 'medium',
      category: 'hook',
      description: 'Suite Teardown → afterAll',
    },
    {
      regex: /^Test Setup\s+(.+)/,
      replacement: 'test.beforeEach(async ({ page }) => { /* $1 */ });',
      confidence: 'medium',
      category: 'hook',
      description: 'Test Setup → beforeEach',
    },
    {
      regex: /^Test Teardown\s+(.+)/,
      replacement: 'test.afterEach(async ({ page }) => { /* $1 */ });',
      confidence: 'medium',
      category: 'hook',
      description: 'Test Teardown → afterEach',
    },

    // ── Variables → const ──
    {
      regex: /^\$\{(\w+)\}\s{2,}(.+)/,
      replacement: "const $1 = '$2';",
      confidence: 'high',
      category: 'config',
      description: '${VAR} → const',
    },
    {
      regex: /^@\{(\w+)\}\s{2,}(.+)/,
      replacement: 'const $1 = [$2];',
      confidence: 'medium',
      category: 'config',
      description: '@{VAR} → const array',
    },

    // ── Test metadata → comments/decorators ──
    {
      regex: /^\[Documentation\]\s+(.+)/,
      replacement: '// $1',
      confidence: 'high',
      category: 'navigation',
      description: '[Documentation] → comment',
    },
    {
      regex: /^\[Tags\]\s+(.+)/,
      replacement: '// Tags: $1',
      confidence: 'high',
      category: 'navigation',
      description: '[Tags] → comment',
    },
    {
      regex: /^\[Setup\]\s+(.+)/,
      replacement: '// Test setup: $1',
      confidence: 'medium',
      category: 'hook',
      description: '[Setup] → comment',
    },
    {
      regex: /^\[Teardown\]\s+(.+)/,
      replacement: '// Test teardown: $1',
      confidence: 'medium',
      category: 'hook',
      description: '[Teardown] → comment',
    },
    {
      regex: /^\[Arguments\]\s+(.+)/,
      replacement: '// Arguments: $1',
      confidence: 'high',
      category: 'navigation',
      description: '[Arguments] → comment',
    },
    {
      regex: /^\[Return\]\s+(.+)/,
      replacement: 'return $1;',
      confidence: 'medium',
      category: 'navigation',
      description: '[Return] → return',
    },

    // ── Navigation ──
    {
      regex: /^Open Browser\s+(.+?)\s{2,}(\w+)/,
      replacement: 'await page.goto($1);',
      confidence: 'high',
      category: 'navigation',
      description: 'Open Browser → page.goto',
    },
    {
      regex: /^Go To\s+(.+)/,
      replacement: 'await page.goto($1);',
      confidence: 'high',
      category: 'navigation',
      description: 'Go To → page.goto',
    },
    {
      regex: /^Close Browser/,
      replacement: '// Close Browser — handled by Playwright',
      confidence: 'high',
      category: 'navigation',
      description: 'Close Browser → noop',
    },
    {
      regex: /^Close Window/,
      replacement: 'await page.close();',
      confidence: 'high',
      category: 'navigation',
      description: 'Close Window → page.close',
    },

    // ── Selectors & Actions ──
    {
      regex: /^Click Element\s+(?:css:)?(.+)/,
      replacement: "await page.locator('$1').click();",
      confidence: 'high',
      category: 'action',
      description: 'Click Element → locator.click',
    },
    {
      regex: /^Input Text\s+(?:id:|css:)?(\S+)\s{2,}(.+)/,
      replacement: "await page.locator('$1').fill('$2');",
      confidence: 'high',
      category: 'action',
      description: 'Input Text → locator.fill',
    },
    {
      regex: /^Clear Element Text\s+(?:css:)?(.+)/,
      replacement: "await page.locator('$1').clear();",
      confidence: 'high',
      category: 'action',
      description: 'Clear Element Text → locator.clear',
    },
    {
      regex: /^Get Text\s+(?:css:)?(.+)/,
      replacement: "await page.locator('$1').textContent()",
      confidence: 'high',
      category: 'action',
      description: 'Get Text → locator.textContent',
    },
    {
      regex: /^Get WebElement\s+(?:css:)?(.+)/,
      replacement: "page.locator('$1')",
      confidence: 'high',
      category: 'selector',
      description: 'Get WebElement → page.locator',
    },
    {
      regex: /^Get WebElements\s+(?:css:)?(.+)/,
      replacement: "page.locator('$1')",
      confidence: 'high',
      category: 'selector',
      description: 'Get WebElements → page.locator',
    },

    // ── Select/Dropdown ──
    {
      regex: /^Select From List By Value\s+(?:id:|css:)?(\S+)\s{2,}(.+)/,
      replacement: "await page.locator('$1').selectOption('$2');",
      confidence: 'high',
      category: 'action',
      description: 'Select From List By Value → selectOption',
    },
    {
      regex: /^Select From List By Label\s+(?:id:|css:)?(\S+)\s{2,}(.+)/,
      replacement: "await page.locator('$1').selectOption({ label: '$2' });",
      confidence: 'high',
      category: 'action',
      description: 'Select From List By Label → selectOption({label})',
    },
    {
      regex: /^Select From List By Index\s+(?:id:|css:)?(\S+)\s{2,}(\d+)/,
      replacement: "await page.locator('$1').selectOption({ index: $2 });",
      confidence: 'high',
      category: 'action',
      description: 'Select From List By Index → selectOption({index})',
    },

    // ── Checkbox ──
    {
      regex: /^Select Checkbox\s+(?:id:|css:)?(.+)/,
      replacement: "await page.locator('$1').check();",
      confidence: 'high',
      category: 'action',
      description: 'Select Checkbox → locator.check',
    },
    {
      regex: /^Unselect Checkbox\s+(?:id:|css:)?(.+)/,
      replacement: "await page.locator('$1').uncheck();",
      confidence: 'high',
      category: 'action',
      description: 'Unselect Checkbox → locator.uncheck',
    },

    // ── Mouse interaction ──
    {
      regex: /^Mouse Over\s+(?:css:)?(.+)/,
      replacement: "await page.locator('$1').hover();",
      confidence: 'high',
      category: 'action',
      description: 'Mouse Over → locator.hover',
    },
    {
      regex: /^Drag And Drop\s+(?:css:)?(\S+)\s{2,}(?:css:)?(.+)/,
      replacement: "await page.locator('$1').dragTo(page.locator('$2'));",
      confidence: 'high',
      category: 'action',
      description: 'Drag And Drop → dragTo',
    },
    {
      regex: /^Scroll Element Into View\s+(?:css:)?(.+)/,
      replacement: "await page.locator('$1').scrollIntoViewIfNeeded();",
      confidence: 'high',
      category: 'action',
      description: 'Scroll Element Into View → scrollIntoViewIfNeeded',
    },

    // ── Frames ──
    {
      regex: /^Select Frame\s+(?:css:)?(.+)/,
      replacement: "const frame = page.frameLocator('$1');",
      confidence: 'high',
      category: 'navigation',
      description: 'Select Frame → frameLocator',
    },
    {
      regex: /^Unselect Frame/,
      replacement: '// Unselect Frame — use parent page reference',
      confidence: 'medium',
      category: 'navigation',
      description: 'Unselect Frame',
    },

    // ── Windows ──
    {
      regex: /^Switch Window\s+NEW/,
      replacement: "const newPage = await context.waitForEvent('page');",
      confidence: 'high',
      category: 'navigation',
      description: 'Switch Window NEW → waitForEvent',
    },
    {
      regex: /^Switch Window\s+MAIN/,
      replacement: '// Switch back to main page reference',
      confidence: 'medium',
      category: 'navigation',
      description: 'Switch Window MAIN',
    },
    {
      regex: /^Switch Window\s+(.+)/,
      replacement: '// [automigrate] Switch Window $1 → use context.pages() to find by title/url',
      confidence: 'low',
      category: 'navigation',
      description: 'Switch Window → context.pages',
    },

    // ── Cookies ──
    {
      regex: /^Add Cookie\s+(\S+)\s{2,}(.+)/,
      replacement: "await context.addCookies([{ name: '$1', value: '$2', url: page.url() }]);",
      confidence: 'high',
      category: 'action',
      description: 'Add Cookie → addCookies',
    },
    {
      regex: /^Get Cookie\s+(\S+)/,
      replacement: "(await context.cookies()).find(c => c.name === '$1')",
      confidence: 'high',
      category: 'action',
      description: 'Get Cookie → context.cookies',
    },
    {
      regex: /^Delete All Cookies/,
      replacement: 'await context.clearCookies();',
      confidence: 'high',
      category: 'action',
      description: 'Delete All Cookies → clearCookies',
    },

    // ── Screenshots ──
    {
      regex: /^Capture Page Screenshot\s+(.+)/,
      replacement: "await page.screenshot({ path: '$1' });",
      confidence: 'high',
      category: 'action',
      description: 'Capture Page Screenshot → page.screenshot',
    },
    {
      regex: /^Capture Element Screenshot\s+(?:css:)?(\S+)\s{2,}(.+)/,
      replacement: "await page.locator('$1').screenshot({ path: '$2' });",
      confidence: 'high',
      category: 'action',
      description: 'Capture Element Screenshot → locator.screenshot',
    },

    // ── JavaScript execution ──
    {
      regex: /^Execute JavaScript\s+(.+)/,
      replacement: 'await page.evaluate(() => { $1 });',
      confidence: 'high',
      category: 'action',
      description: 'Execute JavaScript → page.evaluate',
    },

    // ── Element attributes ──
    {
      regex: /^Get Element Attribute\s+(?:id:|css:)?(\S+)\s{2,}(.+)/,
      replacement: "await page.locator('$1').getAttribute('$2')",
      confidence: 'high',
      category: 'action',
      description: 'Get Element Attribute → getAttribute',
    },

    // ── Wait keywords ──
    {
      regex: /^Wait Until Element Is Visible\s+(?:css:)?(\S+)(?:\s{2,}timeout=(\S+))?/,
      replacement: "await page.locator('$1').waitFor({ state: 'visible' });",
      confidence: 'high',
      category: 'wait',
      description: 'Wait Until Element Is Visible → waitFor',
    },
    {
      regex: /^Wait Until Element Is Not Visible\s+(?:css:)?(\S+)(?:\s{2,}timeout=(\S+))?/,
      replacement: "await page.locator('$1').waitFor({ state: 'hidden' });",
      confidence: 'high',
      category: 'wait',
      description: 'Wait Until Element Is Not Visible → waitFor(hidden)',
    },
    {
      regex: /^Wait Until Element Is Enabled\s+(?:css:)?(\S+)/,
      replacement: "await page.locator('$1').waitFor({ state: 'visible' });",
      confidence: 'medium',
      category: 'wait',
      description: 'Wait Until Element Is Enabled → waitFor',
    },
    {
      regex: /^Wait Until Element Contains\s+(?:css:)?(\S+)\s{2,}(.+)/,
      replacement: "await expect(page.locator('$1')).toContainText('$2');",
      confidence: 'high',
      category: 'wait',
      description: 'Wait Until Element Contains → toContainText',
    },
    {
      regex: /^Wait Until Page Contains\s+(.+)/,
      replacement: "await expect(page.locator('body')).toContainText('$1');",
      confidence: 'high',
      category: 'wait',
      description: 'Wait Until Page Contains → toContainText(body)',
    },
    {
      regex: /^Wait Until Page Contains Element\s+(?:css:)?(.+)/,
      replacement: "await page.locator('$1').waitFor({ state: 'attached' });",
      confidence: 'high',
      category: 'wait',
      description: 'Wait Until Page Contains Element → waitFor(attached)',
    },

    // ── Assertions ──
    {
      regex: /^Element Should Be Visible\s+(?:css:)?(.+)/,
      replacement: "await expect(page.locator('$1')).toBeVisible();",
      confidence: 'high',
      category: 'assertion',
      description: 'Element Should Be Visible → toBeVisible',
    },
    {
      regex: /^Element Should Not Be Visible\s+(?:css:)?(.+)/,
      replacement: "await expect(page.locator('$1')).toBeHidden();",
      confidence: 'high',
      category: 'assertion',
      description: 'Element Should Not Be Visible → toBeHidden',
    },
    {
      regex: /^Element Should Contain\s+(?:css:)?(\S+)\s{2,}(.+)/,
      replacement: "await expect(page.locator('$1')).toContainText('$2');",
      confidence: 'high',
      category: 'assertion',
      description: 'Element Should Contain → toContainText',
    },
    {
      regex: /^Element Text Should Be\s+(?:css:)?(\S+)\s{2,}(.+)/,
      replacement: "await expect(page.locator('$1')).toHaveText('$2');",
      confidence: 'high',
      category: 'assertion',
      description: 'Element Text Should Be → toHaveText',
    },
    {
      regex: /^Element Should Be Enabled\s+(?:css:)?(.+)/,
      replacement: "await expect(page.locator('$1')).toBeEnabled();",
      confidence: 'high',
      category: 'assertion',
      description: 'Element Should Be Enabled → toBeEnabled',
    },
    {
      regex: /^Element Should Be Disabled\s+(?:css:)?(.+)/,
      replacement: "await expect(page.locator('$1')).toBeDisabled();",
      confidence: 'high',
      category: 'assertion',
      description: 'Element Should Be Disabled → toBeDisabled',
    },
    {
      regex: /^Checkbox Should Be Selected\s+(?:id:|css:)?(.+)/,
      replacement: "await expect(page.locator('$1')).toBeChecked();",
      confidence: 'high',
      category: 'assertion',
      description: 'Checkbox Should Be Selected → toBeChecked',
    },
    {
      regex: /^Checkbox Should Not Be Selected\s+(?:id:|css:)?(.+)/,
      replacement: "await expect(page.locator('$1')).not.toBeChecked();",
      confidence: 'high',
      category: 'assertion',
      description: 'Checkbox Should Not Be Selected → not.toBeChecked',
    },
    {
      regex: /^Title Should Be\s+(.+)/,
      replacement: "await expect(page).toHaveTitle('$1');",
      confidence: 'high',
      category: 'assertion',
      description: 'Title Should Be → toHaveTitle',
    },
    {
      regex: /^Location Should Be\s+(.+)/,
      replacement: "await expect(page).toHaveURL('$1');",
      confidence: 'high',
      category: 'assertion',
      description: 'Location Should Be → toHaveURL',
    },
    {
      regex: /^Page Should Contain\s+(.+)/,
      replacement: "await expect(page.locator('body')).toContainText('$1');",
      confidence: 'high',
      category: 'assertion',
      description: 'Page Should Contain → toContainText',
    },
    {
      regex: /^Page Should Not Contain\s+(.+)/,
      replacement: "await expect(page.locator('body')).not.toContainText('$1');",
      confidence: 'high',
      category: 'assertion',
      description: 'Page Should Not Contain → not.toContainText',
    },

    // ── Robot built-in assertions ──
    {
      regex: /^Should Be Equal\s+(.+?)\s{2,}(.+)/,
      replacement: "expect($1).toBe('$2');",
      confidence: 'high',
      category: 'assertion',
      description: 'Should Be Equal → expect.toBe',
    },
    {
      regex: /^Should Be Equal As Numbers\s+(.+?)\s{2,}(.+)/,
      replacement: 'expect(Number($1)).toBe($2);',
      confidence: 'high',
      category: 'assertion',
      description: 'Should Be Equal As Numbers → expect.toBe',
    },
    {
      regex: /^Should Contain\s+(.+?)\s{2,}(.+)/,
      replacement: "expect($1).toContain('$2');",
      confidence: 'high',
      category: 'assertion',
      description: 'Should Contain → expect.toContain',
    },
    {
      regex: /^Should Not Be Empty\s+(.+)/,
      replacement: 'expect($1).toBeTruthy();',
      confidence: 'medium',
      category: 'assertion',
      description: 'Should Not Be Empty → toBeTruthy',
    },

    // ── Variable assignment ──
    {
      regex: /^\$\{(\w+)\}\s*=\s*(.+)/,
      replacement: 'const $1 = $2;',
      confidence: 'medium',
      category: 'navigation',
      description: '${var}= → const',
    },

    // ── AppiumLibrary keywords ──
    {
      regex: /^Open Application\s+(.+)/,
      replacement: '// [automigrate] Open Application $1 → configure in playwright.config.ts',
      confidence: 'low',
      category: 'navigation',
      description: 'Open Application → config',
    },
    {
      regex: /^Swipe\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/,
      replacement: 'await page.touchscreen.swipe($1, $2, $3, $4);',
      confidence: 'medium',
      category: 'action',
      description: 'Swipe → touchscreen',
    },
  ];
}

// ─── Selector Best-Practice Upgrades ────────────────────────────────────────

interface SelectorUpgrade {
  pattern: RegExp;
  replacement: string | ((match: RegExpMatchArray) => string);
}

const SELECTOR_UPGRADES: SelectorUpgrade[] = [
  // [data-testid="x"] → getByTestId('x')
  {
    pattern: /page\.locator\(\s*['"]\[data-testid=['"]?([^'"\]]+)['"]?\]['"]\s*\)/,
    replacement: "page.getByTestId('$1')",
  },
  {
    pattern: /page\.locator\(\s*['"]\[data-test-id=['"]?([^'"\]]+)['"]?\]['"]\s*\)/,
    replacement: "page.getByTestId('$1')",
  },
  {
    pattern: /page\.locator\(\s*['"]\[data-cy=['"]?([^'"\]]+)['"]?\]['"]\s*\)/,
    replacement: "page.getByTestId('$1')",
  },

  // [role="x"] → getByRole('x')
  {
    pattern: /page\.locator\(\s*['"]\[role=['"](\w+)['"]\]['"]\s*\)/,
    replacement: "page.getByRole('$1')",
  },

  // [aria-label="x"] → getByLabel('x')
  {
    pattern: /page\.locator\(\s*['"]\[aria-label=['"]([^'"]+)['"]\]['"]\s*\)/,
    replacement: "page.getByLabel('$1')",
  },

  // [placeholder="x"] → getByPlaceholder('x')
  {
    pattern: /page\.locator\(\s*['"]\[placeholder=['"]([^'"]+)['"]\]['"]\s*\)/,
    replacement: "page.getByPlaceholder('$1')",
  },

  // [alt="x"] → getByAltText('x')
  {
    pattern: /page\.locator\(\s*['"]\[alt=['"]([^'"]+)['"]\]['"]\s*\)/,
    replacement: "page.getByAltText('$1')",
  },

  // [title="x"] → getByTitle('x')
  {
    pattern: /page\.locator\(\s*['"]\[title=['"]([^'"]+)['"]\]['"]\s*\)/,
    replacement: "page.getByTitle('$1')",
  },

  // a=Text or link:Text → getByRole('link', { name: 'Text' })
  {
    pattern: /page\.locator\(\s*['"]a=([^'"]+)['"]\s*\)/,
    replacement: "page.getByRole('link', { name: '$1' })",
  },

  // button=Text → getByRole('button', { name: 'Text' })
  {
    pattern: /page\.locator\(\s*['"]button=([^'"]+)['"]\s*\)/,
    replacement: "page.getByRole('button', { name: '$1' })",
  },

  // #test-id-like → getByTestId('test-id-like') when id looks like a test identifier
  {
    pattern:
      /page\.locator\(\s*['"]#([\w-]+-(?:btn|button|input|form|modal|dialog|link|nav|menu|container|wrapper|section|header|footer|sidebar|content|panel|card|list|item|row|cell|tab|badge|alert|toast))['"]\s*\)/,
    replacement: "page.getByTestId('$1')",
  },

  // xpath=//tag[@id="x"] → simpler CSS
  {
    pattern: /page\.locator\(\s*['"]xpath=\/\/(\w+)\[@id=['"]([^'"]+)['"]\]['"]\s*\)/,
    replacement: "page.locator('$1#$2')",
  },
];

export function upgradeSelectorToBestPractice(line: string): string {
  let result = line;
  for (const upgrade of SELECTOR_UPGRADES) {
    const match = result.match(upgrade.pattern);
    if (match) {
      if (typeof upgrade.replacement === 'function') {
        result = result.replace(upgrade.pattern, upgrade.replacement(match));
      } else {
        let rep = upgrade.replacement;
        for (let g = 1; g < match.length; g++) {
          rep = rep.replace(new RegExp(`\\$${g}`, 'g'), match[g] ?? '');
        }
        result = result.replace(match[0], rep);
      }
    }
  }
  return result;
}

// ─── Compiled Rule Cache ────────────────────────────────────────────────────

interface CompiledRule {
  rule: TransformationRule;
  pattern: SmartPattern;
}

function compileRules(rules: TransformationRule[]): CompiledRule[] {
  return rules
    .filter((rule) => {
      // Rules without examples AND without targetTemplate can't be compiled
      // into smart patterns — they rely on direct rules instead
      const hasExample = rule.examples && rule.examples.length > 0;
      const hasTemplate = !!rule.targetTemplate;
      return hasExample || hasTemplate;
    })
    .map((rule) => ({
      rule,
      pattern: buildSmartPattern(
        rule.examples?.[0]?.input ?? String(rule.sourcePattern),
        rule.targetTemplate ?? String((rule as any).targetPattern ?? ''),
      ),
    }));
}

// ─── Transformer Class ─────────────────────────────────────────────────────

export class Transformer {
  private compiledRules: CompiledRule[];
  private directRules: DirectRule[];
  private config: MigrationConfig;

  constructor(
    rules: TransformationRule[],
    config: MigrationConfig,
    framework?: SourceFramework,
    language?: SourceLanguage,
  ) {
    this.compiledRules = compileRules(rules);
    this.directRules = getDirectRulesForFramework(framework ?? 'selenium', language);
    this.config = config;
  }

  transform(parsed: ParsedFile): TransformFileResult {
    const lines = parsed.source.content.split('\n');
    const transformedLines: TransformedLine[] = [];
    const results: TransformResult[] = [];
    const manualInterventions: ManualIntervention[] = [];

    // Phase 1: Generate import block
    const importBlock = this.generateImportBlock(parsed);

    // Phase 2: Determine test structure
    const testStructure = this.detectTestStructure(parsed);

    // Phase 2.5: Pre-process multi-line expressions
    const multiLineExprs = this.joinMultiLineExpressions(lines);
    const multiLineStartMap = new Map<number, { joined: string; endLine: number }>();
    const continuationLines = new Set<number>();

    for (const expr of multiLineExprs) {
      multiLineStartMap.set(expr.startLine, { joined: expr.joined, endLine: expr.endLine });
      for (let ln = expr.startLine + 1; ln <= expr.endLine; ln++) {
        continuationLines.add(ln);
      }
    }

    // Phase 3: Transform each line
    let skipImports = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip original import lines (we'll replace with Playwright imports)
      if (this.isImportLine(line, parsed.source.language)) {
        transformedLines.push({
          lineNumber: lineNum,
          original: line,
          transformed: '', // removed — replaced by importBlock
          confidence: 'high',
          needsReview: false,
        });
        skipImports = true;
        continue;
      }

      // Insert import block after last import
      if (skipImports && !this.isImportLine(line, parsed.source.language)) {
        skipImports = false;
      }

      // Handle continuation lines (part of a multi-line block, not the first line)
      if (continuationLines.has(lineNum)) {
        transformedLines.push({
          lineNumber: lineNum,
          original: line,
          transformed: '',
          confidence: 'high',
          needsReview: false,
        });
        continue;
      }

      // Determine which text to transform — joined multi-line or original single line
      const multiLineEntry = multiLineStartMap.get(lineNum);
      const lineToTransform = multiLineEntry ? multiLineEntry.joined : line;

      // Apply line-level transforms
      const { transformed, rule, confidence } = this.transformLine(lineToTransform, parsed);

      if (rule) {
        results.push({
          rule,
          original: lineToTransform,
          transformed,
          line: lineNum,
          confidence: rule.confidence,
          requiresManualReview: rule.requiresManualReview ?? false,
          warnings: [],
        });
      }

      transformedLines.push({
        lineNumber: lineNum,
        original: line,
        transformed,
        ruleApplied: rule,
        confidence,
        needsReview: confidence === 'low',
      });
    }

    // Phase 4: Apply structural transforms
    this.applyWaitStrategy(transformedLines);
    this.applySelectorStrategy(transformedLines, parsed);

    // Calculate overall confidence
    const totalLines = transformedLines.filter((l) => l.original.trim().length > 0).length;
    const highConfLines = transformedLines.filter((l) => l.confidence === 'high').length;
    const overallConfidence = totalLines > 0 ? highConfLines / totalLines : 1;

    const targetPath = this.computeTargetPath(parsed.source.relativePath);

    return {
      sourcePath: parsed.source.relativePath,
      targetPath,
      transformedLines,
      results,
      manualInterventions,
      importBlock,
      testStructure,
      confidence: Math.round(overallConfidence * 100) / 100,
    };
  }

  private transformLine(
    line: string,
    parsed: ParsedFile,
  ): { transformed: string; rule?: TransformationRule; confidence: TransformConfidence } {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('#')
    ) {
      return { transformed: line, confidence: 'high' };
    }

    // Preserve original indentation
    const indent = line.match(/^(\s*)/)?.[1] ?? '';

    // Phase 1: Try direct regex rules (framework-specific, handle compound expressions)
    for (const directRule of this.directRules) {
      const match = trimmed.match(directRule.regex);
      if (match) {
        let result: string;
        if (typeof directRule.replacement === 'function') {
          result = directRule.replacement(match, indent);
        } else {
          result = directRule.replacement;
          for (let g = 1; g < match.length; g++) {
            result = result.replace(new RegExp(`\\$${g}`, 'g'), match[g] ?? '');
          }
        }

        // __SKIP__ means this line should be omitted from output
        if (result === '__SKIP__') {
          return { transformed: '', confidence: 'high' };
        }

        return {
          transformed: indent + result,
          confidence: directRule.confidence,
        };
      }
    }

    // Phase 2: Try compiled smart pattern rules (from mapping tables)
    for (const { rule, pattern } of this.compiledRules) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(trimmed);

      if (match) {
        let result = pattern.template;

        // Replace capture group references
        for (let g = 1; g < match.length; g++) {
          result = result.replace(`$${g}`, match[g] ?? '');
        }

        return {
          transformed: indent + result,
          rule,
          confidence: rule.confidence,
        };
      }
    }

    // No rule matched — check if this line has known patterns that need attention
    if (this.looksLikeTestCode(trimmed, parsed.source.framework)) {
      return {
        transformed: `${line} // TODO: [automigrate] Review this line — no automatic mapping available`,
        confidence: 'low',
      };
    }

    // Plain code — pass through unchanged
    return { transformed: line, confidence: 'high' };
  }

  private looksLikeTestCode(line: string, _framework: SourceFramework): boolean {
    // These patterns indicate test-framework code that wasn't caught by direct rules.
    // If a direct rule already handled it, this won't be reached.
    const patterns: RegExp[] = [
      /\bdriver\.\w/,
      /\bBy\.\w/,
      /\bWebDriverWait\b/,
      /\bExpectedConditions\b/,
      /\bcy\.\w/,
      /\bpage\.\$\w/,
      /\bpuppeteer\.\w/,
      /\.findElement\b/,
      /\.findElements\b/,
      /\.FindElement\b/,
      /\.FindElements\b/,
      /\bself\.\w+/,
      /\bfind_element\b/,
      /\bfind_elements\b/,
      /\bsend_keys\b/,
      /\bActionChains\b/,
      /\bWebDriverWait\b.*EC\./,
      /\bSelect\s*\(/,
    ];
    return patterns.some((p) => p.test(line));
  }

  /**
   * Pre-processes lines to join multi-line expressions into single strings.
   * Detects unclosed parentheses/brackets and method chaining (lines ending with `.`).
   * Returns an array of joined expressions with their original line ranges.
   */
  private joinMultiLineExpressions(
    lines: string[],
  ): Array<{ joined: string; startLine: number; endLine: number; originalLines: string[] }> {
    const result: Array<{
      joined: string;
      startLine: number;
      endLine: number;
      originalLines: string[];
    }> = [];
    const MAX_JOIN = 10;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines, comments, and lines that are clearly complete
      if (
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('#')
      ) {
        i++;
        continue;
      }

      // Skip test structure lines — describe/it/test/before/after blocks have intentionally
      // unbalanced parens (the closing `});` is many lines away)
      if (
        /^\b(?:describe|context|it|test|before|after|beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(
          trimmed,
        )
      ) {
        i++;
        continue;
      }

      // Skip block-level constructs (class, function, if, for, while, etc.)
      if (
        /^(?:class|function|if|else|for|while|switch|try|catch|finally|return)\b/.test(trimmed) ||
        /^\}\s*(?:else|catch|finally)/.test(trimmed) ||
        /^(?:public|private|protected|static|async)\s+(?:class|function|void|Task)/.test(trimmed) ||
        /^\}/.test(trimmed)
      ) {
        i++;
        continue;
      }

      // Count unbalanced parens/brackets on this line (ignoring those inside string literals)
      const depth = this.countUnbalancedDepth(trimmed);
      const endsWithDot = /\.\s*$/.test(trimmed);
      // Also check if the next line starts with `.` (method chaining continuation)
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const nextStartsWithDot = /^\./.test(nextLine);

      const isChaining = endsWithDot || nextStartsWithDot;

      if (depth > 0 || isChaining) {
        // Start of a multi-line expression — collect continuation lines
        const startLine = i + 1; // 1-based
        const indent = line.match(/^(\s*)/)?.[1] ?? '';
        const collectedLines = [line];
        let currentDepth = depth;
        let j = i + 1;

        while (j < lines.length && j - i < MAX_JOIN) {
          const contLine = lines[j];
          const contTrimmed = contLine.trim();
          collectedLines.push(contLine);

          currentDepth += this.countUnbalancedDepth(contTrimmed);

          if (currentDepth <= 0) {
            // Parens are balanced — check if chaining continues
            const contEndsDot = /\.\s*$/.test(contTrimmed);
            const followingLine = j + 1 < lines.length ? lines[j + 1].trim() : '';
            const followingStartsDot = /^\./.test(followingLine);

            if (!contEndsDot && !followingStartsDot) {
              // Expression is complete
              j++;
              break;
            }
          }

          j++;
        }

        // Only create a multi-line entry if we actually joined multiple lines
        if (collectedLines.length > 1) {
          // Join and normalize: collapse ") ." to ")." for method chaining compatibility
          const raw = collectedLines.map((l) => l.trim()).join(' ');
          const normalized = raw.replace(/\)\s+\./g, ').').replace(/\s{2,}/g, ' ');
          const joined = indent + normalized;
          result.push({
            joined,
            startLine,
            endLine: i + collectedLines.length, // 1-based
            originalLines: collectedLines,
          });
          i = i + collectedLines.length;
          continue;
        }
      }

      i++;
    }

    return result;
  }

  /**
   * Counts the net depth of unbalanced parentheses and brackets in a line,
   * ignoring characters inside string literals (single-quoted, double-quoted, backtick).
   * Returns positive if more openers than closers.
   */
  private countUnbalancedDepth(line: string): number {
    let depth = 0;
    let inString: string | null = null;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const prev = i > 0 ? line[i - 1] : '';

      // Handle string boundaries
      if (inString) {
        if (ch === inString && prev !== '\\') {
          inString = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }

      // Handle line comments
      if (ch === '/' && i + 1 < line.length && line[i + 1] === '/') {
        break;
      }

      if (ch === '(' || ch === '[') {
        depth++;
      } else if (ch === ')' || ch === ']') {
        depth--;
      }
    }

    return depth;
  }

  private isImportLine(line: string, language: string): boolean {
    const trimmed = line.trim();
    if (language === 'java') {
      return trimmed.startsWith('import ') || trimmed.startsWith('package ');
    }
    if (language === 'python') {
      return trimmed.startsWith('import ') || trimmed.startsWith('from ');
    }
    if (language === 'csharp') {
      return /^using\s+[\w.]+\s*;/.test(trimmed);
    }
    return (
      trimmed.startsWith('import ') ||
      (trimmed.startsWith('const ') && trimmed.includes('require(')) ||
      (trimmed.startsWith('var ') && trimmed.includes('require(')) ||
      (trimmed.startsWith('let ') && trimmed.includes('require('))
    );
  }

  private generateImportBlock(parsed: ParsedFile): string {
    const targetLang = this.config.targetLanguage;
    const hasPageObjects = parsed.pageObjects.length > 0;
    const hasAssertions = parsed.assertions.length > 0;

    if (targetLang === 'typescript' || targetLang === 'javascript') {
      const imports = ['test'];
      if (hasAssertions) imports.push('expect');
      let block = `import { ${imports.join(', ')} } from '@playwright/test';\n`;
      if (hasPageObjects) {
        block += `import type { Page, Locator } from '@playwright/test';\n`;
      }
      return block;
    }

    if (targetLang === 'python') {
      const block = `import pytest\nfrom playwright.sync_api import Page, expect\n`;
      return block;
    }

    if (targetLang === 'java') {
      return [
        `import com.microsoft.playwright.*;`,
        `import com.microsoft.playwright.options.*;`,
        `import org.junit.jupiter.api.*;`,
        `import static com.microsoft.playwright.assertions.PlaywrightAssertions.*;`,
        ``,
      ].join('\n');
    }

    if (targetLang === 'csharp') {
      return [
        `using Microsoft.Playwright;`,
        `using Microsoft.Playwright.NUnit;`,
        `using NUnit.Framework;`,
        ``,
      ].join('\n');
    }

    return `import { test, expect } from '@playwright/test';\n`;
  }

  private detectTestStructure(parsed: ParsedFile): 'function' | 'class' | 'describe-it' {
    // Check for class-based tests first (Java/C#/Python classes)
    if (parsed.classes.some((c) => c.isTestClass)) {
      return 'class';
    }

    // Check for describe/it pattern (Cypress/Mocha/Jest)
    // Use word boundary check to avoid false positives like "implicitlyWait("
    const describeItPattern = /\b(?:describe|context)\s*\(|(?:^|\s)it\s*\(/;
    for (const tc of parsed.testCases) {
      if (tc.name === 'describe' || describeItPattern.test(tc.body)) {
        return 'describe-it';
      }
    }

    // Also check source content for describe/it at top level
    if (parsed.source.framework === 'cypress' || describeItPattern.test(parsed.source.content)) {
      return 'describe-it';
    }

    return 'function';
  }

  private applyWaitStrategy(lines: TransformedLine[]): void {
    const strategy = this.config.waitStrategy;

    for (const line of lines) {
      if (strategy === 'auto-wait') {
        // Remove Thread.sleep and simple waits — Playwright auto-waits
        if (line.transformed.includes('Thread.sleep') || line.transformed.includes('time.sleep')) {
          const indent = line.transformed.match(/^(\s*)/)?.[1] ?? '';
          line.transformed = `${indent}// [automigrate] Removed explicit wait — Playwright auto-waits for actionability`;
          line.confidence = 'medium';
        }
      }
    }
  }

  private applySelectorStrategy(lines: TransformedLine[], _parsed: ParsedFile): void {
    if (
      this.config.selectorStrategy === 'modernize' ||
      this.config.selectorStrategy === 'best-practice'
    ) {
      for (const line of lines) {
        line.transformed = upgradeSelectorToBestPractice(line.transformed);
      }
    }
  }

  private computeTargetPath(sourcePath: string): string {
    const ext =
      this.config.targetLanguage === 'typescript'
        ? '.spec.ts'
        : this.config.targetLanguage === 'python'
          ? '_test.py'
          : this.config.targetLanguage === 'java'
            ? 'Test.java'
            : this.config.targetLanguage === 'csharp'
              ? 'Test.cs'
              : '.spec.js';

    // Replace source extension (including test/spec/cy prefix) with target extension
    return sourcePath.replace(
      /\.(?:test|spec|cy)\.(java|py|js|ts|jsx|tsx)$|\.(?:java|py|js|ts|jsx|tsx|cs)$/,
      ext,
    );
  }
}
