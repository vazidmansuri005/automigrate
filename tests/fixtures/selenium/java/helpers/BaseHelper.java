package com.myapp.helpers;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.By;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;

public class BaseHelper {
    protected WebDriver driver;
    protected WebDriverWait wait;

    public BaseHelper(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, 10);
    }

    public void click(String[] locator) {
        WebElement element = findElement(locator);
        element.click();
    }

    public void type(String[] locator, String text) {
        WebElement element = findElement(locator);
        element.clear();
        element.sendKeys(text);
    }

    public String getText(String[] locator) {
        return findElement(locator).getText();
    }

    protected WebElement findElement(String[] locator) {
        String strategy = locator[0];
        String value = locator[1];

        switch (strategy) {
            case "id":
                return driver.findElement(By.id(value));
            case "css":
                return driver.findElement(By.cssSelector(value));
            case "xpath":
                return driver.findElement(By.xpath(value));
            case "name":
                return driver.findElement(By.name(value));
            default:
                throw new RuntimeException("Unknown locator strategy: " + strategy);
        }
    }
}
