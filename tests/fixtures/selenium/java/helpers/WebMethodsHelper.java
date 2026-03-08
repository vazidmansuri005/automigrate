package com.myapp.helpers;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.By;
import org.openqa.selenium.support.ui.ExpectedConditions;

public class WebMethodsHelper extends BaseHelper {

    public WebMethodsHelper(WebDriver driver) {
        super(driver);
    }

    public void waitAndClick(String[] locator) {
        WebElement element = findElement(locator);
        wait.until(ExpectedConditions.elementToBeClickable(element));
        element.click();
    }

    public void scrollToElement(String[] locator) {
        WebElement element = findElement(locator);
        ((org.openqa.selenium.JavascriptExecutor) driver)
            .executeScript("arguments[0].scrollIntoView(true);", element);
    }

    public boolean isElementVisible(String[] locator) {
        try {
            return findElement(locator).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }
}
