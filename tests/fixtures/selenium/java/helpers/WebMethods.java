package com.myapp.helpers;

import org.openqa.selenium.WebDriver;

public class WebMethods extends WebMethodsHelper {

    public WebMethods(WebDriver driver) {
        super(driver);
    }

    public void login(String username, String password) {
        String[] usernameField = {"id", "username"};
        String[] passwordField = {"id", "password"};
        String[] loginBtn = {"css", "#login-btn"};

        type(usernameField, username);
        type(passwordField, password);
        click(loginBtn);
    }

    public void navigateToPage(String pageName) {
        String[] menuItem = {"xpath", "//a[text()='" + pageName + "']"};
        waitAndClick(menuItem);
    }

    public String getWelcomeMessage() {
        String[] welcomeMsg = {"id", "welcome-message"};
        return getText(welcomeMsg);
    }
}
