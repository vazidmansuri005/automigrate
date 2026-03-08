@smoke @login
Feature: User Login
  As a registered user
  I want to log in to the application
  So that I can access my account

  Background:
    Given I am on the login page

  @positive
  Scenario: Successful login with valid credentials
    When I enter "testuser" in the username field
    And I enter "password123" in the password field
    And I click the "Login" button
    Then I should see the dashboard page
    And I should see "Welcome, testuser" on the page

  @negative
  Scenario: Failed login with invalid password
    When I enter "testuser" in the username field
    And I enter "wrongpassword" in the password field
    And I click the "Login" button
    Then I should see an error message "Invalid credentials"

  @parameterized
  Scenario Outline: Login with multiple users
    When I enter "<username>" in the username field
    And I enter "<password>" in the password field
    And I click the "Login" button
    Then I should see "<expected_result>"

    Examples:
      | username  | password    | expected_result        |
      | admin     | admin123    | Admin Dashboard        |
      | user1     | pass1       | User Dashboard         |
      | readonly  | readonly123 | Read-Only Dashboard    |
