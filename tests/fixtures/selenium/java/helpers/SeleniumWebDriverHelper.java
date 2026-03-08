package com.myapp.helpers;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * Selenium WebDriver helper with common utility methods.
 * This is a realistic helper class found in enterprise test frameworks.
 */
public class SeleniumWebDriverHelper {
    protected WebDriver driver;
    protected WebDriverWait wait;

    public SeleniumWebDriverHelper(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(30));
    }

    // ─── Click Methods ─────────────────────────────────────────

    public void click(By locator) {
        wait.until(ExpectedConditions.elementToBeClickable(locator)).click();
    }

    public void clickWithJS(By locator) {
        WebElement element = driver.findElement(locator);
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", element);
    }

    public void doubleClick(By locator) {
        WebElement element = driver.findElement(locator);
        Actions actions = new Actions(driver);
        actions.doubleClick(element).perform();
    }

    public void rightClick(By locator) {
        WebElement element = driver.findElement(locator);
        Actions actions = new Actions(driver);
        actions.contextClick(element).perform();
    }

    // ─── Input Methods ──────────────────────────────────────────

    public void type(By locator, String text) {
        WebElement element = wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
        element.clear();
        element.sendKeys(text);
    }

    public void selectByVisibleText(By locator, String text) {
        WebElement element = driver.findElement(locator);
        Select select = new Select(element);
        select.selectByVisibleText(text);
    }

    public void selectByValue(By locator, String value) {
        WebElement element = driver.findElement(locator);
        Select select = new Select(element);
        select.selectByValue(value);
    }

    // ─── Wait Methods ───────────────────────────────────────────

    public void waitForElementVisible(By locator) {
        wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    public void waitForElementClickable(By locator) {
        wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    public void waitForElementInvisible(By locator) {
        wait.until(ExpectedConditions.invisibilityOfElementLocated(locator));
    }

    public boolean isElementPresent(By locator) {
        try {
            driver.findElement(locator);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ─── Navigation ─────────────────────────────────────────────

    public void navigateTo(String url) {
        driver.get(url);
    }

    public String getCurrentUrl() {
        return driver.getCurrentUrl();
    }

    public String getPageTitle() {
        return driver.getTitle();
    }

    // ─── Frame & Window ─────────────────────────────────────────

    public void switchToFrame(By locator) {
        WebElement frame = driver.findElement(locator);
        driver.switchTo().frame(frame);
    }

    public void switchToDefaultContent() {
        driver.switchTo().defaultContent();
    }

    public void switchToWindow(String windowHandle) {
        driver.switchTo().window(windowHandle);
    }

    public Set<String> getWindowHandles() {
        return driver.getWindowHandles();
    }

    // ─── Scroll & Hover ─────────────────────────────────────────

    public void scrollToElement(By locator) {
        WebElement element = driver.findElement(locator);
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView(true);", element);
    }

    public void hoverOverElement(By locator) {
        WebElement element = driver.findElement(locator);
        Actions actions = new Actions(driver);
        actions.moveToElement(element).perform();
    }

    public void dragAndDrop(By source, By target) {
        WebElement sourceElement = driver.findElement(source);
        WebElement targetElement = driver.findElement(target);
        Actions actions = new Actions(driver);
        actions.dragAndDrop(sourceElement, targetElement).perform();
    }

    // ─── Text & Attribute ───────────────────────────────────────

    public String getText(By locator) {
        return driver.findElement(locator).getText();
    }

    public String getAttribute(By locator, String attribute) {
        return driver.findElement(locator).getAttribute(attribute);
    }

    public List<WebElement> findElements(By locator) {
        return driver.findElements(locator);
    }

    // ─── JavaScript ─────────────────────────────────────────────

    public Object executeScript(String script, Object... args) {
        return ((JavascriptExecutor) driver).executeScript(script, args);
    }

    // ─── Screenshot ─────────────────────────────────────────────

    public void takeScreenshot(String filename) {
        try {
            org.openqa.selenium.OutputType outputType = org.openqa.selenium.OutputType.FILE;
            java.io.File screenshot = ((org.openqa.selenium.TakesScreenshot) driver).getScreenshotAs(outputType);
            java.nio.file.Files.copy(screenshot.toPath(), java.nio.file.Paths.get(filename));
        } catch (Exception e) {
            System.out.println("Screenshot failed: " + e.getMessage());
        }
    }
}
