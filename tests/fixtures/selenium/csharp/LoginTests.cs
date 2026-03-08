using System;
using System.Threading;
using NUnit.Framework;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Support.UI;

namespace MyApp.Tests
{
    [TestFixture]
    public class LoginTests
    {
        private IWebDriver driver;
        private WebDriverWait wait;

        [OneTimeSetUp]
        public void OneTimeSetup()
        {
            // Global setup
        }

        [SetUp]
        public void Setup()
        {
            ChromeOptions options = new ChromeOptions();
            options.AddArgument("--headless");
            driver = new ChromeDriver(options);
            driver.Manage().Timeouts().ImplicitWait = TimeSpan.FromSeconds(10);
            wait = new WebDriverWait(driver, TimeSpan.FromSeconds(15));
        }

        [Test]
        public void TestSuccessfulLogin()
        {
            driver.Navigate().GoToUrl("https://example.com/login");

            driver.FindElement(By.Id("username")).Clear();
            driver.FindElement(By.Id("username")).SendKeys("testuser");
            driver.FindElement(By.Id("password")).SendKeys("password123");
            driver.FindElement(By.CssSelector("button.login-btn")).Click();

            wait.Until(ExpectedConditions.ElementIsVisible(By.Id("dashboard")));

            Assert.That(driver.Title, Is.EqualTo("Dashboard"));
            Assert.IsTrue(driver.FindElement(By.Id("welcome-message")).Displayed);
            Assert.AreEqual("Welcome, testuser", driver.FindElement(By.Id("welcome-message")).Text);
        }

        [Test]
        public void TestInvalidLogin()
        {
            driver.Navigate().GoToUrl("https://example.com/login");

            driver.FindElement(By.Id("username")).SendKeys("baduser");
            driver.FindElement(By.Id("password")).SendKeys("wrongpass");
            driver.FindElement(By.CssSelector("button.login-btn")).Click();

            Thread.Sleep(2000);

            Assert.IsTrue(driver.FindElement(By.ClassName("error-message")).Displayed);
            Assert.That(driver.FindElement(By.ClassName("error-message")).Text,
                Does.Contain("Invalid credentials"));
        }

        [TestCase("admin", "admin123")]
        [TestCase("user", "user456")]
        public void TestLoginWithMultipleCredentials(string username, string password)
        {
            driver.Navigate().GoToUrl("https://example.com/login");

            driver.FindElement(By.Id("username")).SendKeys(username);
            driver.FindElement(By.Id("password")).SendKeys(password);
            driver.FindElement(By.CssSelector("button.login-btn")).Click();

            Assert.IsNotNull(driver.FindElement(By.Id("dashboard")));
        }

        [Test]
        public void TestLogout()
        {
            driver.Navigate().GoToUrl("https://example.com/dashboard");
            driver.FindElement(By.LinkText("Logout")).Click();

            Assert.That(driver.Url, Does.Contain("/login"));
        }

        [TearDown]
        public void TearDown()
        {
            if (driver != null)
            {
                driver.Quit();
                driver.Dispose();
            }
        }

        [OneTimeTearDown]
        public void OneTimeTearDown()
        {
            // Global cleanup
        }
    }
}
