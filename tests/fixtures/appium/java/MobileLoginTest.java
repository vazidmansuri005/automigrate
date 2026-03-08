package com.myapp.mobile;

import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.MobileBy;
import io.appium.java_client.TouchAction;
import io.appium.java_client.touch.offset.PointOption;
import org.openqa.selenium.By;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.testng.Assert;
import org.testng.annotations.*;

import java.net.URL;
import java.time.Duration;

public class MobileLoginTest {
    private AndroidDriver driver;
    private WebDriverWait wait;

    @BeforeClass
    public void setUp() throws Exception {
        DesiredCapabilities caps = new DesiredCapabilities();
        caps.setCapability("platformName", "Android");
        caps.setCapability("deviceName", "Pixel 5");
        caps.setCapability("app", "/path/to/app.apk");
        caps.setCapability("automationName", "UiAutomator2");

        driver = new AndroidDriver(new URL("http://localhost:4723/wd/hub"), caps);
        wait = new WebDriverWait(driver, Duration.ofSeconds(30));
    }

    @Test(priority = 1)
    public void testLoginWithAccessibilityId() {
        // Use accessibility ID for cross-platform selectors
        driver.findElement(MobileBy.AccessibilityId("usernameInput")).sendKeys("testuser");
        driver.findElement(MobileBy.AccessibilityId("passwordInput")).sendKeys("password123");
        driver.findElement(MobileBy.AccessibilityId("loginButton")).click();

        // Wait for dashboard
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("dashboard-title")));
        String title = driver.findElement(By.id("dashboard-title")).getText();
        Assert.assertEquals(title, "Dashboard");
    }

    @Test(priority = 2)
    public void testSwipeGesture() {
        // Swipe up to scroll
        new TouchAction(driver)
            .press(PointOption.point(500, 1500))
            .moveTo(PointOption.point(500, 300))
            .release()
            .perform();

        Thread.sleep(1000);

        // Verify scrolled content is visible
        Assert.assertTrue(driver.findElement(By.id("footer-content")).isDisplayed());
    }

    @Test(priority = 3)
    public void testTapAction() {
        WebElement menuIcon = driver.findElement(By.id("menu-icon"));
        new TouchAction(driver).tap(menuIcon).perform();

        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("menu-drawer")));
        Assert.assertTrue(driver.findElement(By.id("menu-drawer")).isDisplayed());
    }

    @Test(priority = 4)
    public void testContextSwitching() {
        // Switch to webview for hybrid app testing
        driver.context("WEBVIEW_1");

        driver.findElement(By.cssSelector("#web-login-form input[name='email']")).sendKeys("test@example.com");
        driver.findElement(By.cssSelector("#web-login-form button[type='submit']")).click();

        // Switch back to native
        driver.context("NATIVE_APP");

        Assert.assertTrue(driver.findElement(MobileBy.AccessibilityId("welcomeMessage")).isDisplayed());
    }

    @Test(priority = 5)
    public void testDeviceOrientation() {
        driver.rotate(ScreenOrientation.LANDSCAPE);
        Thread.sleep(500);

        Assert.assertTrue(driver.findElement(By.id("landscape-layout")).isDisplayed());

        driver.rotate(ScreenOrientation.PORTRAIT);
    }

    @AfterClass
    public void tearDown() {
        if (driver != null) {
            driver.executeScript("lambda-status=passed");
            driver.quit();
        }
    }
}
