const { Builder, By, until, Key } = require('selenium-webdriver');
const assert = require('assert');

describe('Login Page', function () {
  let driver;

  before(async function () {
    driver = await new Builder().forBrowser('chrome').build();
  });

  after(async function () {
    await driver.quit();
  });

  it('should login successfully', async function () {
    await driver.get('https://example.com/login');

    const username = await driver.findElement(By.id('username'));
    await username.clear();
    await username.sendKeys('testuser');

    const password = await driver.findElement(By.id('password'));
    await password.clear();
    await password.sendKeys('password123');

    await driver.findElement(By.css('.login-btn')).click();

    await driver.wait(until.elementLocated(By.id('dashboard')), 10000);

    const title = await driver.getTitle();
    assert.strictEqual(title, 'Dashboard - MyApp');

    const welcome = await driver.findElement(By.xpath("//h1[contains(text(), 'Welcome')]"));
    const isDisplayed = await welcome.isDisplayed();
    assert.ok(isDisplayed);
  });

  it('should show error for bad credentials', async function () {
    await driver.get('https://example.com/login');

    await driver.findElement(By.id('username')).sendKeys('wrong');
    await driver.findElement(By.id('password')).sendKeys('wrong');
    await driver.findElement(By.css('.login-btn')).click();

    await driver.sleep(2000);

    const error = await driver.findElement(By.className('error-message'));
    const text = await error.getText();
    assert.ok(text.includes('Invalid credentials'));
  });

  it('should navigate to registration', async function () {
    await driver.get('https://example.com/login');

    await driver.findElement(By.linkText('Create Account')).click();

    await driver.wait(until.urlContains('/register'), 5000);

    const heading = await driver.findElement(By.css('h1'));
    const headingText = await heading.getText();
    assert.strictEqual(headingText, 'Register');
  });
});
