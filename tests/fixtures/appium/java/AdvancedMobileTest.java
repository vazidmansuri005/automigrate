package com.myapp.mobile;

import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.ios.IOSDriver;
import io.appium.java_client.MobileBy;
import io.appium.java_client.MobileElement;
import io.appium.java_client.TouchAction;
import io.appium.java_client.MultiTouchAction;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.touch.WaitOptions;
import io.appium.java_client.touch.offset.ElementOption;
import io.appium.java_client.touch.offset.PointOption;
import org.openqa.selenium.By;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.interactions.Sequence;
import org.openqa.selenium.interactions.PointerInput;
import org.testng.Assert;
import org.testng.annotations.*;

import java.net.URL;
import java.time.Duration;
import java.util.*;

public class AdvancedMobileTest {
    private AndroidDriver driver;

    @BeforeClass
    public void setUp() throws Exception {
        DesiredCapabilities caps = new DesiredCapabilities();
        caps.setCapability("platformName", "Android");
        caps.setCapability("deviceName", "Pixel 5");
        caps.setCapability("app", "/path/to/app.apk");
        caps.setCapability("automationName", "UiAutomator2");
        driver = new AndroidDriver(new URL("http://localhost:4723/wd/hub"), caps);
    }

    @Test
    public void testMultiTouchPinchZoom() {
        // Pinch to zoom using MultiTouchAction
        MultiTouchAction multiTouch = new MultiTouchAction(driver);
        TouchAction finger1 = new TouchAction(driver)
            .press(PointOption.point(500, 500))
            .moveTo(PointOption.point(100, 100))
            .release();
        TouchAction finger2 = new TouchAction(driver)
            .press(PointOption.point(500, 500))
            .moveTo(PointOption.point(900, 900))
            .release();
        multiTouch.add(finger1).add(finger2).perform();
    }

    @Test
    public void testW3CActions() {
        // W3C Actions API for precise touch control
        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence tap = new Sequence(finger, 1);
        tap.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), 500, 500));
        tap.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        tap.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
        driver.perform(Collections.singletonList(tap));
    }

    @Test
    public void testLongPressWithWait() {
        MobileElement element = driver.findElement(MobileBy.AccessibilityId("longPressTarget"));
        new TouchAction(driver).longPress(element).waitAction(WaitOptions.waitOptions(Duration.ofSeconds(2))).release().perform();
    }

    @Test
    public void testScrollGesture() {
        // Scroll down using TouchAction
        new TouchAction(driver)
            .press(PointOption.point(500, 1200))
            .waitAction(WaitOptions.waitOptions(Duration.ofMillis(500)))
            .moveTo(PointOption.point(500, 400))
            .release()
            .perform();
    }

    @Test
    public void testFindElementById() {
        // Shorthand findElementById
        MobileElement usernameField = driver.findElementById("com.app:id/username");
        usernameField.sendKeys("testuser");
        MobileElement loginBtn = driver.findElementById("com.app:id/loginBtn");
        loginBtn.click();
    }

    @Test
    public void testFindElementByXPath() {
        MobileElement element = driver.findElementByXPath("//android.widget.TextView[@text='Settings']");
        element.click();
    }

    @Test
    public void testFindElementByClassName() {
        MobileElement element = driver.findElementByClassName("android.widget.Button");
        element.click();
    }

    @Test
    public void testGeoLocation() {
        // Set GPS location
        driver.setLocation(new org.openqa.selenium.html5.Location(37.7749, -122.4194, 0));
    }

    @Test
    public void testGetContextHandles() {
        Set<String> contexts = driver.getContextHandles();
        for (String context : contexts) {
            System.out.println("Context: " + context);
        }
    }

    @Test
    public void testPushPullFile() {
        driver.pushFile("/data/local/tmp/test.txt", "test content".getBytes());
        byte[] fileContent = driver.pullFile("/data/local/tmp/test.txt");
    }

    @Test
    public void testNetworkConnection() {
        driver.toggleWifi();
        driver.toggleAirplaneMode();
    }

    @Test
    public void testAppManagement() {
        driver.runAppInBackground(Duration.ofSeconds(5));
        boolean isInstalled = driver.isAppInstalled("com.myapp");
        driver.activateApp("com.myapp");
        driver.terminateApp("com.myapp");
    }

    @Test
    public void testGetDeviceTime() {
        String deviceTime = driver.getDeviceTime();
    }

    @Test
    public void testLockUnlock() {
        driver.lockDevice();
        driver.unlockDevice();
    }

    @Test
    public void testClipboard() {
        driver.setClipboardText("Hello from test");
        String clipText = driver.getClipboardText();
    }

    @AfterClass
    public void tearDown() {
        if (driver != null) {
            driver.executeScript("lambda-status=passed");
            driver.quit();
        }
    }
}
