/**
 * Appium-specific mapping rules for mobile test migration.
 * Covers:
 * - TouchAction → Playwright touch/gesture
 * - MobileBy / AppiumBy → Playwright locators
 * - Context switching (NATIVE_APP ↔ WEBVIEW)
 * - Mobile gestures (swipe, scroll, tap)
 * - Mobile-specific capabilities
 * - Driver management (IOSDriver, AndroidDriver)
 */

import type { TransformationRule } from '../types/index.js';

export function generateAppiumRules(): TransformationRule[] {
  return [
    // ── Driver Management ──────────────────────────────────────────────────
    {
      id: 'appium-ios-driver',
      name: 'IOSDriver instantiation',
      description: 'IOSDriver → Playwright iOS device',
      sourceFramework: 'appium',
      sourcePattern: /new\s+IOSDriver\s*\(/,
      targetTemplate:
        "// [automigrate] Playwright: Use devices['iPhone 14'] in config or page = await browser.newPage()",
      confidence: 'medium',
      category: 'config',
      requiresManualReview: true,
      examples: [
        {
          input: 'IOSDriver driver = new IOSDriver(url, caps);',
          output: "// [automigrate] Playwright: Use devices['iPhone 14'] in config",
          language: 'java',
        },
      ],
    },
    {
      id: 'appium-android-driver',
      name: 'AndroidDriver instantiation',
      description: 'AndroidDriver → Playwright Android device',
      sourceFramework: 'appium',
      sourcePattern: /new\s+AndroidDriver\s*\(/,
      targetTemplate:
        "// [automigrate] Playwright: Use devices['Pixel 5'] in config or page = await browser.newPage()",
      confidence: 'medium',
      category: 'config',
      requiresManualReview: true,
      examples: [
        {
          input: 'AndroidDriver driver = new AndroidDriver(url, caps);',
          output: "// [automigrate] Playwright: Use devices['Pixel 5'] in config",
          language: 'java',
        },
      ],
    },

    // ── Mobile Locators ────────────────────────────────────────────────────
    {
      id: 'appium-mobile-by-accessibility-id',
      name: 'MobileBy.AccessibilityId',
      description: 'MobileBy.AccessibilityId → getByRole',
      sourceFramework: 'appium',
      sourcePattern: 'MobileBy.AccessibilityId(value)',
      targetTemplate: "page.getByRole('button', { name: value })",
      confidence: 'medium',
      category: 'selector',
      requiresManualReview: true,
      examples: [
        {
          input: 'driver.findElement(MobileBy.AccessibilityId("Login"));',
          output: "page.getByRole('button', { name: 'Login' })",
          language: 'java',
        },
      ],
    },
    {
      id: 'appium-appium-by-accessibility-id',
      name: 'AppiumBy.accessibilityId',
      description: 'AppiumBy.accessibilityId → getByLabel',
      sourceFramework: 'appium',
      sourcePattern: 'AppiumBy.accessibilityId(value)',
      targetTemplate: 'page.getByLabel(value) // TODO: [automigrate] Verify accessibility mapping',
      confidence: 'medium',
      category: 'selector',
      requiresManualReview: true,
      examples: [
        {
          input: 'driver.findElement(AppiumBy.accessibilityId("submitBtn"));',
          output: "page.getByLabel('submitBtn')",
          language: 'java',
        },
      ],
    },

    // ── Touch Actions ──────────────────────────────────────────────────────
    {
      id: 'appium-touch-tap',
      name: 'TouchAction tap',
      description: 'TouchAction.tap → page.tap',
      sourceFramework: 'appium',
      sourcePattern: 'new TouchAction(driver).tap(element).perform()',
      targetTemplate:
        'await element.tap() // TODO: [automigrate] Playwright tap() requires { hasTouch: true }',
      confidence: 'medium',
      category: 'action',
      requiresManualReview: true,
      examples: [
        {
          input: 'new TouchAction(driver).tap(element).perform();',
          output: 'await element.tap()',
          language: 'java',
        },
      ],
    },
    {
      id: 'appium-touch-long-press',
      name: 'TouchAction longPress',
      description: 'TouchAction.longPress → custom gesture',
      sourceFramework: 'appium',
      sourcePattern: 'new TouchAction(driver).longPress(element).perform()',
      targetTemplate:
        '// TODO: [automigrate] Playwright long press: await element.click({ delay: 1000 })',
      confidence: 'low',
      category: 'action',
      requiresManualReview: true,
      examples: [
        {
          input: 'new TouchAction(driver).longPress(element).perform();',
          output: 'await element.click({ delay: 1000 })',
          language: 'java',
        },
      ],
    },

    // ── Scrolling / Swipe ───────────────────────────────────────────────────
    {
      id: 'appium-swipe',
      name: 'Swipe gesture',
      description: 'Mobile swipe → Playwright mouse/touch gesture',
      sourceFramework: 'appium',
      sourcePattern:
        'new TouchAction(driver).press(startX, startY).moveTo(endX, endY).release().perform()',
      targetTemplate:
        '// TODO: [automigrate] Playwright swipe: await page.mouse.move(startX, startY); await page.mouse.down(); await page.mouse.move(endX, endY); await page.mouse.up();',
      confidence: 'low',
      category: 'action',
      requiresManualReview: true,
      examples: [
        {
          input:
            'new TouchAction(driver).press(PointOption.point(500, 1000)).moveTo(PointOption.point(500, 200)).release().perform();',
          output:
            'await page.mouse.move(500, 1000); await page.mouse.down(); await page.mouse.move(500, 200); await page.mouse.up();',
          language: 'java',
        },
      ],
    },

    // ── Context Switching ────────────────────────────────────────────────────
    {
      id: 'appium-context-switch',
      name: 'Context switching',
      description: 'driver.context(WEBVIEW) → Playwright handles web views natively',
      sourceFramework: 'appium',
      sourcePattern: 'driver.context(context)',
      targetTemplate:
        '// TODO: [automigrate] Playwright: Web views are accessible directly via page. No context switching needed for web content.',
      confidence: 'medium',
      category: 'action',
      requiresManualReview: true,
      examples: [
        {
          input: 'driver.context("WEBVIEW_1");',
          output: '// Playwright handles web views natively',
          language: 'java',
        },
      ],
    },

    // ── Status Reporting ──────────────────────────────────────────────────
    {
      id: 'appium-execute-script-status',
      name: 'lambda-status executeScript',
      description: 'driver.executeScript(lambda-status) → test result hooks',
      sourceFramework: 'appium',
      sourcePattern: 'driver.executeScript("lambda-status=passed")',
      targetTemplate:
        '// [automigrate] LambdaTest status reporting is handled via Playwright test hooks',
      confidence: 'high',
      category: 'custom',
      requiresManualReview: false,
      examples: [
        {
          input: 'driver.executeScript("lambda-status=passed");',
          output: '// LambdaTest status reporting handled via test hooks',
          language: 'java',
        },
      ],
    },

    // ── Capabilities ──────────────────────────────────────────────────────
    {
      id: 'appium-desired-capabilities',
      name: 'DesiredCapabilities',
      description: 'DesiredCapabilities → playwright.config.ts devices',
      sourceFramework: 'appium',
      sourcePattern: 'new DesiredCapabilities()',
      targetTemplate:
        "// [automigrate] Set device capabilities in playwright.config.ts → projects[] → use: { ...devices['Device Name'] }",
      confidence: 'medium',
      category: 'config',
      requiresManualReview: true,
      examples: [
        {
          input: 'DesiredCapabilities caps = new DesiredCapabilities();',
          output: '// Set device capabilities in playwright.config.ts',
          language: 'java',
        },
      ],
    },

    // ── App Management ──────────────────────────────────────────────────────
    {
      id: 'appium-install-app',
      name: 'installApp',
      description: 'driver.installApp → not needed for web testing',
      sourceFramework: 'appium',
      sourcePattern: 'driver.installApp(path)',
      targetTemplate: '// [automigrate] App installation not applicable for Playwright web testing',
      confidence: 'high',
      category: 'custom',
      requiresManualReview: false,
      examples: [
        {
          input: 'driver.installApp("/path/to/app.apk");',
          output: '// App installation not applicable for Playwright',
          language: 'java',
        },
      ],
    },
    {
      id: 'appium-launch-app',
      name: 'launchApp',
      description: 'driver.launchApp → page.goto',
      sourceFramework: 'appium',
      sourcePattern: 'driver.launchApp()',
      targetTemplate:
        'await page.goto(BASE_URL) // TODO: [automigrate] Replace with actual app URL',
      confidence: 'medium',
      category: 'navigation',
      requiresManualReview: true,
      examples: [
        {
          input: 'driver.launchApp();',
          output: 'await page.goto(BASE_URL)',
          language: 'java',
        },
      ],
    },
    {
      id: 'appium-close-app',
      name: 'closeApp',
      description: 'driver.closeApp → handled by Playwright',
      sourceFramework: 'appium',
      sourcePattern: 'driver.closeApp()',
      targetTemplate: '// [automigrate] Playwright handles app lifecycle automatically',
      confidence: 'high',
      category: 'custom',
      requiresManualReview: false,
      examples: [
        {
          input: 'driver.closeApp();',
          output: '// Playwright handles app lifecycle automatically',
          language: 'java',
        },
      ],
    },

    // ── Orientation ──────────────────────────────────────────────────────────
    {
      id: 'appium-rotate',
      name: 'rotate device',
      description: 'driver.rotate → viewport resize',
      sourceFramework: 'appium',
      sourcePattern: 'driver.rotate(orientation)',
      targetTemplate:
        'await page.setViewportSize({ width: 812, height: 375 }) // TODO: [automigrate] Adjust for landscape dimensions',
      confidence: 'low',
      category: 'action',
      requiresManualReview: true,
      examples: [
        {
          input: 'driver.rotate(ScreenOrientation.LANDSCAPE);',
          output: 'await page.setViewportSize({ width: 812, height: 375 })',
          language: 'java',
        },
      ],
    },
  ];
}
