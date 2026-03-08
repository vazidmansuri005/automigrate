const puppeteer = require('puppeteer');

describe('Search Functionality', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should search for a product', async () => {
    await page.goto('https://example.com/shop');

    await page.waitForSelector('#search-input');
    await page.type('#search-input', 'laptop');
    await page.click('#search-button');

    await page.waitForNavigation();

    const results = await page.$$('.product-card');
    expect(results.length).toBeGreaterThan(0);

    const firstTitle = await page.$eval('.product-card:first-child .title', el => el.textContent);
    expect(firstTitle).toContain('laptop');
  });

  test('should filter by price range', async () => {
    await page.goto('https://example.com/shop?q=laptop');

    const minPrice = await page.$('#min-price');
    await minPrice.type('500');
    const maxPrice = await page.$('#max-price');
    await maxPrice.type('1500');

    await page.click('.apply-filters');
    await page.waitForTimeout(1000);

    const priceElements = await page.$$eval('.product-price', els =>
      els.map(el => parseFloat(el.textContent.replace('$', '')))
    );
    priceElements.forEach(price => {
      expect(price).toBeGreaterThanOrEqual(500);
      expect(price).toBeLessThanOrEqual(1500);
    });
  });

  test('should add item to cart', async () => {
    await page.goto('https://example.com/shop');

    await page.click('.product-card:first-child .add-to-cart');
    await page.waitForSelector('.cart-badge');

    const cartCount = await page.$eval('.cart-badge', el => el.textContent);
    expect(cartCount).toBe('1');

    await page.hover('.cart-icon');
    const cartItem = await page.$('.cart-dropdown .item-name');
    expect(cartItem).not.toBeNull();
  });
});
