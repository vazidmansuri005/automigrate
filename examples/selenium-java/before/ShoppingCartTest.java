/**
 * Selenium WebDriver + JUnit 5 test (Java)
 * Scenario: E-commerce shopping cart — add items, verify cart, checkout
 */
package com.example.tests;

import org.junit.jupiter.api.*;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class ShoppingCartTest {

    private static WebDriver driver;
    private static WebDriverWait wait;

    @BeforeAll
    static void setUp() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--start-maximized");
        options.addArguments("--disable-notifications");
        driver = new ChromeDriver(options);
        wait = new WebDriverWait(driver, Duration.ofSeconds(15));
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(5));
    }

    @AfterAll
    static void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }

    @BeforeEach
    void clearState() {
        driver.manage().deleteAllCookies();
    }

    @Test
    @Order(1)
    void testAddItemsToCart() {
        // Navigate to the store
        driver.get("https://demo-store.example.com/products");
        assertEquals("Products | Demo Store", driver.getTitle());

        // Search for a product
        WebElement searchBox = driver.findElement(By.id("search-input"));
        searchBox.clear();
        searchBox.sendKeys("laptop stand");
        searchBox.sendKeys(Keys.ENTER);

        // Wait for results
        wait.until(ExpectedConditions.visibilityOfElementLocated(
            By.cssSelector(".product-grid .product-card")
        ));

        // Get product details before adding
        List<WebElement> products = driver.findElements(
            By.cssSelector(".product-grid .product-card")
        );
        assertTrue(products.size() > 0, "Search should return results");

        WebElement firstProduct = products.get(0);
        String productTitle = firstProduct.findElement(
            By.className("product-name")
        ).getText();

        // Hover to reveal quick-add button
        Actions actions = new Actions(driver);
        actions.moveToElement(firstProduct).perform();

        // Click add to cart
        wait.until(ExpectedConditions.elementToBeClickable(
            firstProduct.findElement(By.cssSelector(".quick-add-btn"))
        )).click();

        // Wait for confirmation toast
        WebElement toast = wait.until(ExpectedConditions.visibilityOfElementLocated(
            By.cssSelector(".toast-message")
        ));
        assertTrue(toast.getText().contains("added to cart"));

        // Select quantity using dropdown
        WebElement quantitySelect = driver.findElement(By.id("mini-cart-qty"));
        Select select = new Select(quantitySelect);
        select.selectByVisibleText("3");

        // Navigate to cart page
        driver.findElement(By.linkText("View Cart")).click();
        wait.until(ExpectedConditions.urlContains("/cart"));

        // Verify the item is in the cart
        WebElement cartItem = wait.until(ExpectedConditions.visibilityOfElementLocated(
            By.cssSelector(".cart-table .cart-row")
        ));
        String cartItemName = cartItem.findElement(By.css(".item-name")).getText();
        assertEquals(productTitle, cartItemName);

        // Verify quantity
        WebElement qtyInput = cartItem.findElement(
            By.cssSelector("input[name='quantity']")
        );
        assertEquals("3", qtyInput.getAttribute("value"));

        // Take a screenshot for verification
        File screenshot = ((TakesScreenshot) driver)
            .getScreenshotAs(OutputType.FILE);
    }

    @Test
    @Order(2)
    void testApplyCouponAndCheckout() {
        driver.get("https://demo-store.example.com/cart");
        wait.until(ExpectedConditions.visibilityOfElementLocated(
            By.cssSelector(".cart-table")
        ));

        // Apply a coupon
        WebElement couponField = driver.findElement(By.name("coupon"));
        couponField.sendKeys("WELCOME20");
        driver.findElement(By.cssSelector("button.apply-coupon-btn")).click();

        // Wait for discount to be applied
        wait.until(ExpectedConditions.visibilityOfElementLocated(
            By.cssSelector(".discount-row")
        ));
        WebElement discountAmount = driver.findElement(
            By.cssSelector(".discount-row .amount")
        );
        assertTrue(discountAmount.isDisplayed());
        assertTrue(discountAmount.getText().startsWith("-$"));

        // Verify total is updated
        WebElement totalElement = driver.findElement(
            By.cssSelector(".order-total .total-amount")
        );
        assertNotNull(totalElement.getText());

        // Scroll to checkout button
        actions = new Actions(driver);
        WebElement checkoutBtn = driver.findElement(
            By.id("proceed-to-checkout")
        );
        actions.scrollToElement(checkoutBtn).perform();

        // Click checkout
        wait.until(ExpectedConditions.elementToBeClickable(checkoutBtn)).click();

        // Verify we're on checkout page
        wait.until(ExpectedConditions.urlContains("/checkout"));
        assertEquals("Checkout", driver.findElement(
            By.tagName("h1")
        ).getText());

        // Fill shipping address
        driver.findElement(By.id("first-name")).sendKeys("Jane");
        driver.findElement(By.id("last-name")).sendKeys("Doe");
        driver.findElement(By.id("address-line1")).sendKeys("123 Test Street");
        driver.findElement(By.id("city")).sendKeys("Testville");

        // Select state from dropdown
        Select stateSelect = new Select(driver.findElement(By.id("state")));
        stateSelect.selectByValue("CA");

        driver.findElement(By.id("zip-code")).sendKeys("90210");

        // Select shipping method
        driver.findElement(
            By.cssSelector("input[value='express']")
        ).click();

        // Verify shipping method is selected
        WebElement expressRadio = driver.findElement(
            By.cssSelector("input[value='express']")
        );
        assertTrue(expressRadio.isSelected());

        // Verify order summary section exists
        assertTrue(driver.findElement(
            By.cssSelector(".checkout-summary")
        ).isDisplayed());
    }
}
