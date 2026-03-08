import { describe, it, expect } from 'vitest';
import { upgradeSelectorToBestPractice } from '../../../src/core/transformers/transformer.js';

describe('Selector Strategy Best Practice Upgrades (US-019)', () => {
  it('should convert [data-testid="x"] to getByTestId', () => {
    const input = `await page.locator('[data-testid="submit-btn"]').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByTestId('submit-btn')");
    expect(result).not.toContain('page.locator');
  });

  it('should convert [data-test-id="x"] to getByTestId', () => {
    const input = `await page.locator('[data-test-id="login-form"]').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByTestId('login-form')");
  });

  it('should convert [data-cy="x"] to getByTestId', () => {
    const input = `await page.locator('[data-cy="username"]').fill('test');`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByTestId('username')");
  });

  it('should convert [role="button"] to getByRole', () => {
    const input = `await page.locator('[role="button"]').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByRole('button')");
  });

  it('should convert [aria-label="x"] to getByLabel', () => {
    const input = `await page.locator('[aria-label="Search"]').fill('query');`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByLabel('Search')");
  });

  it('should convert [placeholder="x"] to getByPlaceholder', () => {
    const input = `await page.locator('[placeholder="Enter email"]').fill('test@test.com');`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByPlaceholder('Enter email')");
  });

  it('should convert [alt="x"] to getByAltText', () => {
    const input = `await page.locator('[alt="Company Logo"]').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByAltText('Company Logo')");
  });

  it('should convert [title="x"] to getByTitle', () => {
    const input = `await page.locator('[title="Close dialog"]').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByTitle('Close dialog')");
  });

  it('should convert link text selector to getByRole link', () => {
    const input = `await page.locator('a=Sign In').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByRole('link', { name: 'Sign In' })");
  });

  it('should convert button text selector to getByRole button', () => {
    const input = `await page.locator('button=Submit').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByRole('button', { name: 'Submit' })");
  });

  it('should preserve complex CSS selectors unchanged', () => {
    const input = `await page.locator('.sidebar > .nav-item:nth-child(2)').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toBe(input);
  });

  it('should simplify xpath id selector to CSS', () => {
    const input = `await page.locator('xpath=//div[@id="main"]').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.locator('div#main')");
  });

  it('should convert test-id-like #ids to getByTestId', () => {
    const input = `await page.locator('#submit-btn').click();`;
    const result = upgradeSelectorToBestPractice(input);
    expect(result).toContain("page.getByTestId('submit-btn')");
  });

  it('should not convert regular #ids to getByTestId', () => {
    const input = `await page.locator('#username').fill('test');`;
    const result = upgradeSelectorToBestPractice(input);
    // #username doesn't match the test-id pattern
    expect(result).toContain("page.locator('#username')");
  });
});
