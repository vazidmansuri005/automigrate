from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pytest

class TestLogin:
    def setup_method(self):
        self.driver = webdriver.Chrome()
        self.driver.maximize_window()
        self.driver.implicitly_wait(10)

    def test_successful_login(self):
        self.driver.get("https://example.com/login")
        username = self.driver.find_element(By.ID, "username")
        username.clear()
        username.send_keys("testuser")
        password = self.driver.find_element(By.ID, "password")
        password.clear()
        password.send_keys("password123")
        self.driver.find_element(By.CSS_SELECTOR, ".login-btn").click()
        wait = WebDriverWait(self.driver, 10)
        wait.until(EC.visibility_of_element_located((By.ID, "dashboard")))
        welcome = self.driver.find_element(By.XPATH, "//h1[contains(text(), 'Welcome')]")
        assert welcome.is_displayed()
        assert self.driver.title == "Dashboard - MyApp"

    def test_failed_login(self):
        self.driver.get("https://example.com/login")
        self.driver.find_element(By.ID, "username").send_keys("wrong")
        self.driver.find_element(By.ID, "password").send_keys("wrong")
        self.driver.find_element(By.CSS_SELECTOR, ".login-btn").click()
        import time; time.sleep(2)
        error = self.driver.find_element(By.CLASS_NAME, "error-message")
        assert error.is_displayed()
        assert "Invalid credentials" in error.text

    def teardown_method(self):
        if self.driver:
            self.driver.quit()
