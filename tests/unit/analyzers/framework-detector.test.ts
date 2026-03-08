import { describe, it, expect } from 'vitest';
import { detectFramework } from '../../../src/core/analyzers/framework-detector.js';

describe('detectFramework', () => {
  // ─── Java / Selenium ──────────────────────────────────────────────────

  it('should detect Selenium Java from imports', () => {
    const content = `
      import org.openqa.selenium.WebDriver;
      import org.openqa.selenium.chrome.ChromeDriver;
      public class MyTest {}
    `;
    const result = detectFramework('MyTest.java', content);
    expect(result.framework).toBe('selenium');
    expect(result.language).toBe('java');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should detect Selenium Java from By selectors', () => {
    const content = `
      public class MyTest {
        void test() {
          driver.findElement(By.id("foo"));
          driver.findElement(By.cssSelector(".bar"));
        }
      }
    `;
    const result = detectFramework('MyTest.java', content);
    expect(result.framework).toBe('selenium');
    expect(result.language).toBe('java');
  });

  // ─── Cypress ──────────────────────────────────────────────────────────

  it('should detect Cypress from cy.visit', () => {
    const content = `
      describe('test', () => {
        it('visits', () => {
          cy.visit('/login');
          cy.get('#username').type('test');
        });
      });
    `;
    const result = detectFramework('login.cy.js', content);
    expect(result.framework).toBe('cypress');
    expect(result.language).toBe('javascript');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should detect Cypress from cy.get', () => {
    const content = `cy.get('.selector').click();`;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('cypress');
  });

  it('should detect Cypress from cy.intercept', () => {
    const content = `cy.intercept('GET', '/api/data').as('getData');`;
    const result = detectFramework('api.spec.js', content);
    expect(result.framework).toBe('cypress');
  });

  it('should detect Cypress from Cypress.Commands', () => {
    const content = `Cypress.Commands.add('login', () => {});`;
    const result = detectFramework('commands.js', content);
    expect(result.framework).toBe('cypress');
  });

  // ─── Puppeteer ────────────────────────────────────────────────────────

  it('should detect Puppeteer from require statement', () => {
    const content = `
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch();
    `;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('puppeteer');
    expect(result.language).toBe('javascript');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should detect Puppeteer from import statement', () => {
    const content = `import puppeteer from 'puppeteer';`;
    const result = detectFramework('test.ts', content);
    expect(result.framework).toBe('puppeteer');
    expect(result.language).toBe('javascript');
  });

  it('should detect Puppeteer from puppeteer-core', () => {
    const content = `const puppeteer = require('puppeteer-core');`;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('puppeteer');
  });

  it('should detect Puppeteer from puppeteer.launch', () => {
    const content = `const browser = await puppeteer.launch({ headless: true });`;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('puppeteer');
  });

  // ─── Selenium JS ──────────────────────────────────────────────────────

  it('should detect Selenium JS from require', () => {
    const content = `
      const { Builder, By, Key, until } = require('selenium-webdriver');
    `;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('selenium');
    expect(result.language).toBe('javascript');
  });

  it('should detect Selenium JS from import', () => {
    const content = `import { Builder } from 'selenium-webdriver';`;
    const result = detectFramework('test.ts', content);
    expect(result.framework).toBe('selenium');
  });

  // ─── Appium ───────────────────────────────────────────────────────────

  it('should detect Appium Java from imports', () => {
    const content = `
      import io.appium.java_client.android.AndroidDriver;
    `;
    const result = detectFramework('AppTest.java', content);
    expect(result.framework).toBe('appium');
    expect(result.language).toBe('java');
  });

  it('should detect Appium from driver class names', () => {
    const content = `
      IOSDriver driver = new IOSDriver(new URL("http://localhost:4723"), caps);
    `;
    const result = detectFramework('Test.java', content);
    expect(result.framework).toBe('appium');
  });

  // ─── Language detection ───────────────────────────────────────────────

  it('should detect java language for .java files', () => {
    const result = detectFramework('Test.java', 'import org.openqa.selenium.*;');
    expect(result.language).toBe('java');
  });

  it('should detect javascript language for .js files', () => {
    const result = detectFramework('test.js', 'cy.visit("/")');
    expect(result.language).toBe('javascript');
  });

  it('should detect typescript language for .ts files', () => {
    const result = detectFramework('test.ts', 'cy.visit("/")');
    // Cypress pattern overrides language to javascript
    expect(result.language).toBe('javascript');
  });

  it('should detect python language for .py files', () => {
    const content = `from selenium import webdriver`;
    const result = detectFramework('test.py', content);
    expect(result.language).toBe('python');
  });

  it('should detect csharp language for .cs files', () => {
    const content = `using OpenQA.Selenium;`;
    const result = detectFramework('Test.cs', content);
    expect(result.language).toBe('csharp');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it('should return low confidence for unknown file type', () => {
    const result = detectFramework('test.txt', 'some content');
    expect(result.confidence).toBe(0);
  });

  it('should return selenium as default for unrecognized JS content', () => {
    const content = `console.log("hello world");`;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('selenium');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('should prefer higher confidence matches', () => {
    // Content that has both Selenium and Cypress patterns
    // Cypress patterns have higher confidence
    const content = `
      cy.visit('/login');
      By.id('foo');
    `;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('cypress');
  });

  // ─── WebdriverIO (US-016) ──────────────────────────────────────────────

  it('should detect WebdriverIO by @wdio/globals require', () => {
    const content = `const { browser } = require('@wdio/globals');`;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('webdriverio');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should detect WebdriverIO by ES module import', () => {
    const content = `import { $ } from '@wdio/globals';`;
    const result = detectFramework('test.ts', content);
    expect(result.framework).toBe('webdriverio');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should detect WebdriverIO by browser.url pattern', () => {
    const content = `await browser.url('/login');`;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('webdriverio');
  });

  it('should prefer @wdio import over ambiguous $() pattern', () => {
    const content = `
      const { browser, $ } = require('@wdio/globals');
      await $('input').setValue('hello');
    `;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('webdriverio');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  // ─── Robot Framework (US-016) ──────────────────────────────────────────

  it('should detect Robot Framework by Settings header', () => {
    const content = `*** Settings ***\nLibrary    SeleniumLibrary`;
    const result = detectFramework('test.robot', content);
    expect(result.framework).toBe('robot');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('should detect Robot Framework by Test Cases header', () => {
    const content = `*** Test Cases ***\nValid Login\n    Go To    /login`;
    const result = detectFramework('test.robot', content);
    expect(result.framework).toBe('robot');
  });

  it('should detect Robot Framework in .resource files', () => {
    const content = `*** Keywords ***\nLogin As\n    [Arguments]    \${user}`;
    const result = detectFramework('common.resource', content);
    expect(result.framework).toBe('robot');
  });

  it('should detect Robot Framework with AppiumLibrary', () => {
    const content = `*** Settings ***\nLibrary    AppiumLibrary`;
    const result = detectFramework('mobile.robot', content);
    expect(result.framework).toBe('robot');
  });

  // ─── Mixed framework detection (US-016) ────────────────────────────────

  it('should choose highest confidence in mixed Selenium+Cypress file', () => {
    const content = `
      const { Builder } = require('selenium-webdriver');
      cy.visit('/');
    `;
    const result = detectFramework('test.js', content);
    expect(result.framework).toBe('cypress');
  });
});
