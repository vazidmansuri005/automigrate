/**
 * Puppeteer + Jest test
 * Scenario: Search and filter products — type query, apply filters, paginate results
 */

const puppeteer = require('puppeteer');

describe('Product Search and Filter', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US',
    });
  });

  afterEach(async () => {
    await page.close();
  });

  test('should search products and display results', async () => {
    await page.goto('https://demo-store.example.com', {
      waitUntil: 'networkidle0',
    });

    // Type in the search box
    await page.waitForSelector('#search-bar');
    await page.type('#search-bar', 'mechanical keyboard', { delay: 50 });

    // Click search button
    await page.click('.search-submit-btn');

    // Wait for results to load
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.product-list .product-item');

    // Count results
    const resultCount = await page.$$eval(
      '.product-list .product-item',
      (items) => items.length
    );
    expect(resultCount).toBeGreaterThan(0);

    // Verify search term is shown in the results header
    const headerText = await page.$eval(
      '.search-results-header h2',
      (el) => el.textContent
    );
    expect(headerText).toContain('mechanical keyboard');

    // Verify each product card has required elements
    const firstProduct = await page.$('.product-item:first-child');
    const title = await firstProduct.$eval('.product-title', (el) => el.textContent);
    const price = await firstProduct.$eval('.product-price', (el) => el.textContent);
    const image = await firstProduct.$eval('img.product-image', (el) => el.src);

    expect(title).toBeTruthy();
    expect(price).toMatch(/\$\d+\.\d{2}/);
    expect(image).toContain('https://');
  });

  test('should filter products by category and price range', async () => {
    await page.goto('https://demo-store.example.com/products', {
      waitUntil: 'networkidle2',
    });

    // Open filter sidebar
    await page.click('[data-action="toggle-filters"]');
    await page.waitForSelector('.filter-sidebar', { visible: true });

    // Select category filter
    await page.click('.filter-category input[value="electronics"]');

    // Set price range using the slider
    const minPriceInput = await page.$('#price-min');
    await minPriceInput.click({ clickCount: 3 }); // select all text
    await minPriceInput.type('25');

    const maxPriceInput = await page.$('#price-max');
    await maxPriceInput.click({ clickCount: 3 });
    await maxPriceInput.type('150');

    // Apply filters
    await page.click('button.apply-filters');

    // Wait for filtered results
    await page.waitForResponse((response) =>
      response.url().includes('/api/products') && response.status() === 200
    );

    await page.waitForSelector('.product-item');

    // Verify URL contains filter params
    const currentUrl = page.url();
    expect(currentUrl).toContain('category=electronics');
    expect(currentUrl).toContain('price_min=25');

    // Verify result count badge updated
    const countText = await page.$eval('.results-count', (el) => el.textContent);
    expect(countText).toMatch(/\d+ results/);

    // Verify all displayed prices are within range
    const prices = await page.$$eval('.product-price', (elements) =>
      elements.map((el) => parseFloat(el.textContent.replace('$', '')))
    );
    prices.forEach((price) => {
      expect(price).toBeGreaterThanOrEqual(25);
      expect(price).toBeLessThanOrEqual(150);
    });
  });

  test('should sort products and paginate', async () => {
    await page.goto('https://demo-store.example.com/products', {
      waitUntil: 'networkidle0',
    });

    await page.waitForSelector('.product-item');

    // Select sort option
    await page.select('#sort-select', 'price-low-high');

    // Wait for re-sorted results
    await page.waitForTimeout(1000);

    // Get prices and verify they are sorted ascending
    const prices = await page.$$eval('.product-price', (elements) =>
      elements.map((el) => parseFloat(el.textContent.replace('$', '')))
    );
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }

    // Navigate to page 2
    await page.click('.pagination [data-page="2"]');
    await page.waitForNavigation();

    // Verify we're on page 2
    const activePage = await page.$eval(
      '.pagination .active',
      (el) => el.textContent
    );
    expect(activePage).toBe('2');

    // Verify products are still displayed
    const pageItemCount = await page.$$eval(
      '.product-item',
      (items) => items.length
    );
    expect(pageItemCount).toBeGreaterThan(0);

    // Take a screenshot of the second page
    await page.screenshot({
      path: 'screenshots/products-page-2.png',
      fullPage: true,
    });
  });

  test('should handle empty search results', async () => {
    await page.goto('https://demo-store.example.com', {
      waitUntil: 'networkidle0',
    });

    await page.type('#search-bar', 'xyznonexistentproduct123');
    await page.click('.search-submit-btn');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // Verify empty state
    await page.waitForSelector('.no-results-container', { visible: true });
    const emptyMessage = await page.$eval(
      '.no-results-container h3',
      (el) => el.textContent
    );
    expect(emptyMessage).toContain('No results found');

    // Verify suggested searches are shown
    const suggestions = await page.$$('.suggested-search-link');
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
