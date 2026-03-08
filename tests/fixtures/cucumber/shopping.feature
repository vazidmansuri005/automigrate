@e2e @shopping
Feature: Shopping Cart
  Users can add items to their cart and checkout

  Background:
    Given I am logged in as "shopper@test.com"
    And I navigate to "/products"

  @cart
  Scenario: Add item to cart
    When I click the "Add to Cart" button for "Widget A"
    Then I should see "1 item in cart"
    And the cart total should be "$9.99"

  @checkout
  Scenario: Complete checkout with data table
    Given the cart contains the following items:
      | product   | quantity | price |
      | Widget A  | 2        | 9.99  |
      | Widget B  | 1        | 19.99 |
    When I go to the checkout page
    And I enter my shipping details:
      """
      {
        "name": "John Doe",
        "address": "123 Main St",
        "city": "Springfield",
        "zip": "62704"
      }
      """
    And I click the "Place Order" button
    Then I should see "Order confirmed"

  Scenario Outline: Filter products by category
    When I select category "<category>"
    Then I should see <count> products
    And the page title should contain "<category>"

    Examples: Categories
      | category    | count |
      | Electronics | 15    |
      | Clothing    | 23    |
      | Books       | 42    |
