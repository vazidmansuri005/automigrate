"""
Selenium WebDriver + pytest test (Python)
Scenario: Contact form submission — fill fields, validate client-side, submit, verify confirmation
"""

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains


@pytest.fixture(scope="module")
def driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--window-size=1920,1080")
    d = webdriver.Chrome(options=chrome_options)
    d.implicitly_wait(5)
    yield d
    d.quit()


@pytest.fixture(autouse=True)
def navigate_to_form(driver):
    driver.get("https://demo-app.example.com/contact")
    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, "form#contact-form"))
    )


class TestContactForm:

    def test_submit_valid_form(self, driver):
        """Fill in all fields and submit the contact form."""
        # Fill in name
        name_field = driver.find_element(By.ID, "full-name")
        name_field.clear()
        name_field.send_keys("Alice Johnson")

        # Fill in email
        email_field = driver.find_element(By.ID, "email")
        email_field.clear()
        email_field.send_keys("alice@example.com")

        # Fill in phone
        phone_field = driver.find_element(By.NAME, "phone")
        phone_field.send_keys("555-0123")

        # Select subject from dropdown
        subject_select = Select(driver.find_element(By.ID, "subject"))
        subject_select.select_by_visible_text("Technical Support")

        # Select priority radio button
        driver.find_element(By.CSS_SELECTOR, "input[name='priority'][value='high']").click()

        # Fill in the message textarea
        message_field = driver.find_element(By.ID, "message")
        message_field.send_keys(
            "I need help with my account settings.\n"
            "The notification preferences are not saving correctly."
        )

        # Check the terms agreement checkbox
        terms_checkbox = driver.find_element(By.ID, "agree-terms")
        if not terms_checkbox.is_selected():
            terms_checkbox.click()
        assert terms_checkbox.is_selected()

        # Upload an attachment
        file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
        file_input.send_keys("/tmp/test-attachment.pdf")

        # Scroll to the submit button
        submit_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        ActionChains(driver).scroll_to_element(submit_btn).perform()

        # Submit the form
        submit_btn.click()

        # Wait for success page
        WebDriverWait(driver, 10).until(
            EC.url_contains("/contact/thank-you")
        )

        # Verify confirmation message
        confirmation = driver.find_element(By.CSS_SELECTOR, ".confirmation-message h2")
        assert confirmation.text == "Thank you for contacting us!"

        # Verify ticket number is displayed
        ticket_number = driver.find_element(By.CSS_SELECTOR, ".ticket-number")
        assert ticket_number.is_displayed()
        assert ticket_number.text.startswith("Ticket #")

    def test_client_side_validation(self, driver):
        """Verify form validation for required fields."""
        # Try submitting empty form
        submit_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        submit_btn.click()

        # Check that validation messages appear
        name_error = driver.find_element(By.CSS_SELECTOR, "#full-name + .error-text")
        assert name_error.is_displayed()
        assert "required" in name_error.text.lower()

        email_error = driver.find_element(By.CSS_SELECTOR, "#email + .error-text")
        assert email_error.is_displayed()

        # Fill in invalid email and verify format validation
        email_field = driver.find_element(By.ID, "email")
        email_field.send_keys("not-an-email")
        email_field.send_keys(Keys.TAB)

        WebDriverWait(driver, 5).until(
            EC.text_to_be_present_in_element(
                (By.CSS_SELECTOR, "#email + .error-text"),
                "valid email"
            )
        )

        email_error = driver.find_element(By.CSS_SELECTOR, "#email + .error-text")
        assert "valid email" in email_error.text.lower()

    def test_character_counter(self, driver):
        """Verify the character counter on the message field."""
        message_field = driver.find_element(By.ID, "message")
        counter = driver.find_element(By.CSS_SELECTOR, ".char-counter")

        # Initially shows max characters
        assert "0 / 1000" in counter.text

        # Type some text and verify counter updates
        message_field.send_keys("Hello, this is a test message.")
        WebDriverWait(driver, 5).until(
            lambda d: "30 / 1000" in d.find_element(By.CSS_SELECTOR, ".char-counter").text
        )

        updated_counter = driver.find_element(By.CSS_SELECTOR, ".char-counter").text
        assert "30 / 1000" in updated_counter

    def test_form_reset(self, driver):
        """Verify the reset button clears all fields."""
        # Fill in some fields
        driver.find_element(By.ID, "full-name").send_keys("Test User")
        driver.find_element(By.ID, "email").send_keys("test@example.com")

        # Click reset
        driver.find_element(By.CSS_SELECTOR, "button[type='reset']").click()

        # Verify fields are cleared
        name_value = driver.find_element(By.ID, "full-name").get_attribute("value")
        assert name_value == ""

        email_value = driver.find_element(By.ID, "email").get_attribute("value")
        assert email_value == ""

    def test_hover_tooltip(self, driver):
        """Verify tooltip appears on hover."""
        help_icon = driver.find_element(By.CSS_SELECTOR, ".help-icon")

        # Hover over the help icon
        ActionChains(driver).move_to_element(help_icon).perform()

        # Wait for tooltip
        tooltip = WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, ".tooltip-content"))
        )

        assert tooltip.is_displayed()
        assert "We typically respond within 24 hours" in tooltip.text
