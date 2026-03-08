package com.myapp.stepDefinitions;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.And;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import java.time.Duration;
import static org.testng.Assert.*;

public class LoginSteps {
    private WebDriver driver;
    private WebDriverWait wait;

    public LoginSteps(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    @Given("I am on the login page")
    public void iAmOnTheLoginPage() {
        driver.get("https://example.com/login");
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("login-form")));
    }

    @When("I enter username {string}")
    public void iEnterUsername(String username) {
        WebElement field = driver.findElement(By.id("username"));
        field.clear();
        field.sendKeys(username);
    }

    @When("I enter password {string}")
    public void iEnterPassword(String password) {
        WebElement field = driver.findElement(By.id("password"));
        field.clear();
        field.sendKeys(password);
    }

    @And("I click the login button")
    public void iClickTheLoginButton() {
        driver.findElement(By.cssSelector("button[type='submit']")).click();
    }

    @Then("I should see the dashboard")
    public void iShouldSeeTheDashboard() {
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("dashboard")));
        assertTrue(driver.findElement(By.id("dashboard")).isDisplayed());
    }

    @Then("I should see error message {string}")
    public void iShouldSeeErrorMessage(String message) {
        WebElement error = wait.until(ExpectedConditions.visibilityOfElementLocated(By.className("error-message")));
        assertTrue(error.getText().contains(message));
    }
}
