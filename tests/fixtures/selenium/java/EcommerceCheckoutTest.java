package com.myapp.tests;

import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.interactions.Actions;
import org.testng.Assert;
import org.testng.annotations.*;

import java.time.Duration;
import java.util.List;
import java.util.Set;

public class EcommerceCheckoutTest {
    private WebDriver driver;
    private WebDriverWait wait;
    private Actions actions;
    private static final String BASE_URL = "https://demo-store.example.com";

    @BeforeClass
    public void globalSetup() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless", "--no-sandbox");
        driver = new ChromeDriver(options);
        wait = new WebDriverWait(driver, Duration.ofSeconds(15));
        actions = new Actions(driver);
        driver.manage().window().maximize();
    }

    @BeforeMethod
    public void navigateToHome() {
        driver.get(BASE_URL);
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("main-content")));
    }

    @Test(priority = 1)
    public void testSearchAndAddToCart() {
        // Search for product
        WebElement searchBox = driver.findElement(By.id("search-input"));
        searchBox.clear();
        searchBox.sendKeys("wireless headphones");
        searchBox.sendKeys(Keys.ENTER);

        // Wait for results
        wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(
            By.cssSelector(".product-card")
        ));

        // Verify results count
        List<WebElement> products = driver.findElements(By.cssSelector(".product-card"));
        Assert.assertTrue(products.size() > 0, "No products found");

        // Click first product
        products.get(0).click();

        // Wait for product detail page
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("product-detail")));

        // Select size from dropdown
        Select sizeDropdown = new Select(driver.findElement(By.id("size-select")));
        sizeDropdown.selectByVisibleText("Medium");

        // Add to cart
        driver.findElement(By.id("add-to-cart-btn")).click();

        // Verify cart badge updated
        wait.until(ExpectedConditions.textToBePresentInElementLocated(
            By.id("cart-count"), "1"
        ));
        String cartCount = driver.findElement(By.id("cart-count")).getText();
        Assert.assertEquals(cartCount, "1");
    }

    @Test(priority = 2, dependsOnMethods = "testSearchAndAddToCart")
    public void testCheckoutFlow() {
        // Go to cart
        driver.findElement(By.id("cart-icon")).click();
        wait.until(ExpectedConditions.urlContains("/cart"));

        // Verify item in cart
        WebElement cartItem = driver.findElement(By.cssSelector(".cart-item"));
        Assert.assertTrue(cartItem.isDisplayed());
        Assert.assertTrue(cartItem.getText().contains("wireless headphones"));

        // Proceed to checkout
        driver.findElement(By.id("checkout-btn")).click();
        wait.until(ExpectedConditions.urlContains("/checkout"));

        // Fill shipping form
        driver.findElement(By.name("firstName")).sendKeys("John");
        driver.findElement(By.name("lastName")).sendKeys("Doe");
        driver.findElement(By.name("address")).sendKeys("123 Main St");
        driver.findElement(By.name("city")).sendKeys("Springfield");

        Select stateDropdown = new Select(driver.findElement(By.name("state")));
        stateDropdown.selectByValue("IL");

        driver.findElement(By.name("zipCode")).sendKeys("62704");
        driver.findElement(By.name("email")).sendKeys("john@example.com");

        // Select shipping method
        driver.findElement(By.xpath("//label[contains(text(), 'Express')]")).click();

        // Handle alert for express shipping confirmation
        Alert alert = driver.switchTo().alert();
        Assert.assertTrue(alert.getText().contains("additional charge"));
        alert.accept();

        // Fill payment
        driver.switchTo().frame("payment-iframe");
        driver.findElement(By.id("card-number")).sendKeys("4111111111111111");
        driver.findElement(By.id("card-expiry")).sendKeys("12/25");
        driver.findElement(By.id("card-cvv")).sendKeys("123");
        driver.switchTo().defaultContent();

        // Place order
        WebElement placeOrderBtn = driver.findElement(By.id("place-order"));
        actions.moveToElement(placeOrderBtn).click().perform();

        // Wait for confirmation
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("order-confirmation")));

        String confirmationText = driver.findElement(By.id("order-confirmation")).getText();
        Assert.assertTrue(confirmationText.contains("Order #"));
        Assert.assertEquals(driver.getTitle(), "Order Confirmed - Demo Store");
    }

    @Test(priority = 3)
    public void testMultiWindowProductComparison() {
        // Click compare link (opens new window)
        driver.findElement(By.linkText("Compare Products")).click();

        // Handle multiple windows
        String mainWindow = driver.getWindowHandle();
        Set<String> allWindows = driver.getWindowHandles();

        for (String handle : allWindows) {
            if (!handle.equals(mainWindow)) {
                driver.switchTo().window(handle);
                break;
            }
        }

        // Verify comparison page in new window
        wait.until(ExpectedConditions.titleContains("Compare"));
        Assert.assertTrue(driver.getCurrentUrl().contains("/compare"));

        // Close comparison window and switch back
        driver.close();
        driver.switchTo().window(mainWindow);
    }

    @Test(priority = 4)
    public void testHoverAndTooltip() {
        WebElement infoIcon = driver.findElement(By.cssSelector(".info-icon"));
        actions.moveToElement(infoIcon).perform();

        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(".tooltip")));
        String tooltipText = driver.findElement(By.cssSelector(".tooltip")).getText();
        Assert.assertNotNull(tooltipText);
        Assert.assertFalse(tooltipText.isEmpty());

        // Scroll to footer
        WebElement footer = driver.findElement(By.id("footer"));
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView(true);", footer);
        Thread.sleep(500);
        Assert.assertTrue(footer.isDisplayed());
    }

    @Test(priority = 5)
    public void testFileUpload() {
        driver.get(BASE_URL + "/profile");
        WebElement uploadInput = driver.findElement(By.cssSelector("input[type='file']"));
        uploadInput.sendKeys("/path/to/avatar.png");

        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("upload-preview")));
        Assert.assertTrue(driver.findElement(By.id("upload-preview")).isDisplayed());
    }

    @AfterMethod
    public void captureScreenshotOnFailure(org.testng.ITestResult result) {
        if (result.getStatus() == org.testng.ITestResult.FAILURE) {
            TakesScreenshot ts = (TakesScreenshot) driver;
            byte[] screenshot = ts.getScreenshotAs(OutputType.BYTES);
            // Save screenshot logic
        }
    }

    @AfterClass
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
