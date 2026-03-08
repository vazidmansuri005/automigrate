package com.example.tests;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import java.time.Duration;
import org.testng.annotations.Test;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.AfterMethod;
import static org.testng.Assert.*;

public class LoginTest {
    WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
    }

    @Test
    public void testSuccessfulLogin() {
        driver.get("https://example.com/login");

        WebElement usernameField = driver.findElement(By.id("username"));
        usernameField.clear();
        usernameField.sendKeys("testuser");

        WebElement passwordField = driver.findElement(By.id("password"));
        passwordField.clear();
        passwordField.sendKeys("password123");

        WebElement loginButton = driver.findElement(By.cssSelector(".login-btn"));
        loginButton.click();

        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("dashboard")));

        WebElement welcomeMsg = driver.findElement(By.xpath("//h1[contains(text(), 'Welcome')]"));
        assertTrue(welcomeMsg.isDisplayed(), "Welcome message should be visible");
        assertEquals(driver.getTitle(), "Dashboard - MyApp");
    }

    @Test
    public void testFailedLogin() {
        driver.get("https://example.com/login");

        driver.findElement(By.id("username")).sendKeys("wronguser");
        driver.findElement(By.id("password")).sendKeys("wrongpass");
        driver.findElement(By.cssSelector(".login-btn")).click();

        Thread.sleep(2000);

        WebElement errorMsg = driver.findElement(By.className("error-message"));
        assertTrue(errorMsg.isDisplayed());
        assertTrue(errorMsg.getText().contains("Invalid credentials"));
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
