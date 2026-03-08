/**
 * Selenium WebDriver + Mocha + Chai test
 * Scenario: E-commerce shopping cart — add items, verify cart, proceed to checkout
 */

const { Builder, By, Key, until } = require('selenium-webdriver');
const { expect } = require('chai');

describe('Shopping Cart', function () {
  this.timeout(30000);
  let driver;

  before(async function () {
    driver = await new Builder().forBrowser('chrome').build();
    await driver.manage().window().maximize();
    await driver.manage().setTimeouts({ implicit: 5000 });
  });

  after(async function () {
    await driver.quit();
  });

  beforeEach(async function () {
    await driver.manage().deleteAllCookies();
  });

  it('should add multiple items to cart and verify totals', async function () {
    // Navigate to the store
    await driver.get('https://demo-store.example.com/products');
    await driver.wait(until.titleContains('Products'), 10000);

    // Search for a product
    const searchInput = await driver.findElement(By.name('search'));
    await searchInput.clear();
    await searchInput.sendKeys('wireless headphones');
    await searchInput.sendKeys(Key.ENTER);

    // Wait for search results
    await driver.wait(
      until.elementLocated(By.css('.search-results .product-card')),
      10000
    );

    // Add first product to cart
    const firstProduct = await driver.findElement(
      By.css('.search-results .product-card:first-child')
    );
    const productName = await firstProduct
      .findElement(By.css('.product-title'))
      .getText();
    const productPrice = await firstProduct
      .findElement(By.css('.product-price'))
      .getText();

    await firstProduct.findElement(By.css('.add-to-cart-btn')).click();

    // Wait for the toast notification
    await driver.wait(
      until.elementIsVisible(
        driver.findElement(By.css('.toast-notification.success'))
      ),
      5000
    );

    // Navigate to another category and add a second item
    await driver.findElement(By.linkText('Accessories')).click();
    await driver.wait(until.urlContains('/category/accessories'), 10000);

    const secondProduct = await driver.findElement(
      By.css('.product-card[data-category="accessories"]:first-child')
    );
    await secondProduct.findElement(By.css('.add-to-cart-btn')).click();

    // Wait for cart badge to update
    await driver.wait(async () => {
      const badge = await driver.findElement(By.css('.cart-badge'));
      const count = await badge.getText();
      return count === '2';
    }, 5000);

    // Open the cart
    await driver.findElement(By.id('cart-icon')).click();
    await driver.wait(
      until.elementIsVisible(driver.findElement(By.css('.cart-drawer'))),
      5000
    );

    // Verify cart contents
    const cartItems = await driver.findElements(By.css('.cart-item'));
    expect(cartItems).to.have.lengthOf(2);

    // Verify first item name is in cart
    const firstCartItemName = await cartItems[0]
      .findElement(By.css('.item-name'))
      .getText();
    expect(firstCartItemName).to.equal(productName);

    // Update quantity of first item
    const quantityInput = await cartItems[0].findElement(
      By.css('input.quantity-input')
    );
    await quantityInput.clear();
    await quantityInput.sendKeys('3');
    await quantityInput.sendKeys(Key.TAB);

    // Wait for subtotal to recalculate
    await driver.sleep(1000);

    // Verify subtotal updated
    const subtotal = await driver
      .findElement(By.css('.cart-subtotal .amount'))
      .getText();
    expect(parseFloat(subtotal.replace('$', ''))).to.be.greaterThan(0);

    // Apply a coupon code
    const couponInput = await driver.findElement(By.id('coupon-code'));
    await couponInput.sendKeys('SAVE10');
    await driver.findElement(By.css('button.apply-coupon')).click();

    // Wait for discount to appear
    await driver.wait(
      until.elementLocated(By.css('.discount-line')),
      5000
    );
    const discountText = await driver
      .findElement(By.css('.discount-line .amount'))
      .getText();
    expect(discountText).to.include('-');

    // Proceed to checkout
    await driver.findElement(By.css('button.checkout-btn')).click();
    await driver.wait(until.urlContains('/checkout'), 10000);

    // Verify we landed on the checkout page
    const checkoutHeading = await driver
      .findElement(By.css('h1.checkout-title'))
      .getText();
    expect(checkoutHeading).to.equal('Checkout');

    // Verify order summary is visible
    const orderSummary = await driver.findElement(By.css('.order-summary'));
    expect(await orderSummary.isDisplayed()).to.be.true;
  });

  it('should remove an item from cart', async function () {
    await driver.get('https://demo-store.example.com/products');

    // Add a product
    await driver.wait(
      until.elementLocated(By.css('.product-card .add-to-cart-btn')),
      10000
    );
    await driver
      .findElement(By.css('.product-card:first-child .add-to-cart-btn'))
      .click();

    // Open cart
    await driver.findElement(By.id('cart-icon')).click();
    await driver.wait(
      until.elementIsVisible(driver.findElement(By.css('.cart-drawer'))),
      5000
    );

    // Remove the item
    await driver.findElement(By.css('.cart-item .remove-btn')).click();

    // Confirm removal in dialog
    const alert = await driver.switchTo().alert();
    await alert.accept();

    // Verify cart is empty
    await driver.wait(
      until.elementLocated(By.css('.empty-cart-message')),
      5000
    );
    const emptyMessage = await driver
      .findElement(By.css('.empty-cart-message'))
      .getText();
    expect(emptyMessage).to.include('Your cart is empty');
  });
});
