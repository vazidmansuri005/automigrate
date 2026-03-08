package com.example.mobile;

import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.MobileElement;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.testng.annotations.*;
import static org.testng.Assert.*;
import java.net.URL;

public class AppLoginTest {
    AndroidDriver<MobileElement> driver;

    @BeforeMethod
    public void setUp() throws Exception {
        DesiredCapabilities caps = new DesiredCapabilities();
        caps.setCapability("platformName", "Android");
        caps.setCapability("deviceName", "Pixel 5");
        caps.setCapability("app", "/path/to/app.apk");
        caps.setCapability("automationName", "UiAutomator2");
        driver = new AndroidDriver<>(new URL("http://localhost:4723/wd/hub"), caps);
    }

    @Test
    public void testLogin() {
        MobileElement username = driver.findElementById("com.app:id/username");
        username.sendKeys("testuser");
        MobileElement password = driver.findElementById("com.app:id/password");
        password.sendKeys("password123");
        driver.findElementById("com.app:id/loginBtn").click();
        Thread.sleep(3000);
        MobileElement welcome = driver.findElementById("com.app:id/welcome");
        assertTrue(welcome.isDisplayed());
        assertEquals(welcome.getText(), "Welcome, testuser!");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
