import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.*;
import org.testng.Assert;
import java.time.Duration;
import java.util.Set;

public class AdvancedSeleniumTest {
    WebDriver driver;

    @BeforeClass
    public void setup() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
    }

    @AfterClass
    public void teardown() {
        if (driver != null) {
            driver.quit();
        }
    }

    @Test
    public void testActionsChainHover() {
        driver.get("https://example.com/menu");
        WebElement menu = driver.findElement(By.cssSelector(".menu-trigger"));
        new Actions(driver).moveToElement(menu).build().perform();
        WebElement submenu = driver.findElement(By.cssSelector(".submenu"));
        assertTrue(submenu.isDisplayed());
    }

    @Test
    public void testActionsChainDragDrop() {
        driver.get("https://example.com/dnd");
        WebElement source = driver.findElement(By.id("draggable"));
        WebElement target = driver.findElement(By.id("droppable"));
        new Actions(driver).dragAndDrop(source, target).build().perform();
    }

    @Test
    public void testActionsContextClick() {
        driver.get("https://example.com/context");
        WebElement element = driver.findElement(By.id("right-click-target"));
        new Actions(driver).contextClick(element).build().perform();
    }

    @Test
    public void testActionsDoubleClick() {
        driver.get("https://example.com/double");
        WebElement element = driver.findElement(By.id("double-click-target"));
        new Actions(driver).doubleClick(element).build().perform();
    }

    @Test
    public void testSelectDropdown() {
        driver.get("https://example.com/form");
        WebElement dropdown = driver.findElement(By.id("country"));
        Select select = new Select(dropdown);
        new Select(dropdown).selectByVisibleText("United States");
        new Select(dropdown).selectByValue("us");
        new Select(dropdown).selectByIndex(0);
    }

    @Test
    public void testMultipleWindows() {
        driver.get("https://example.com/links");
        String originalWindow = driver.getWindowHandle();
        driver.findElement(By.linkText("Open New Window")).click();
        Set<String> allWindows = driver.getWindowHandles();
        for (String handle : allWindows) {
            if (!handle.equals(originalWindow)) {
                driver.switchTo().window(handle);
            }
        }
        assertEquals("New Window", driver.getTitle());
        driver.close();
        driver.switchTo().window(originalWindow);
    }

    @Test
    public void testWebDriverWaitVisibility() {
        driver.get("https://example.com/async");
        new WebDriverWait(driver, Duration.ofSeconds(10)).until(ExpectedConditions.visibilityOfElementLocated(By.id("result")));
        new WebDriverWait(driver, Duration.ofSeconds(10)).until(ExpectedConditions.titleIs("Result Page"));
        new WebDriverWait(driver, Duration.ofSeconds(10)).until(ExpectedConditions.urlContains("/result"));
    }

    @Test
    public void testAlertHandling() {
        driver.get("https://example.com/alerts");
        driver.findElement(By.id("trigger-alert")).click();
        new WebDriverWait(driver, Duration.ofSeconds(5)).until(ExpectedConditions.alertIsPresent());
        driver.switchTo().alert().accept();
    }

    @Test
    public void testJavaScriptExecution() {
        driver.get("https://example.com");
        driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
        String title = (String) driver.executeScript("return document.title");
        assertEquals("Example", title);
    }
}
