const { expect } = require('@wdio/globals');

describe('Advanced WDIO Features', () => {
    it('should handle frames', async () => {
        await browser.url('/frames');
        const frame = await $('iframe#content-frame');
        await browser.switchToFrame(frame);

        const innerText = await $('p.inner-content').getText();
        expect(innerText).toContain('inside frame');

        await browser.switchToParentFrame();
        const outerText = await $('p.outer-content').getText();
        expect(outerText).toContain('outside frame');
    });

    it('should handle multiple windows', async () => {
        await browser.url('/links');
        await $('a=Open New Window').click();
        await browser.pause(500);
        await browser.keys('Escape');

        await browser.switchWindow('New Window');
        const title = await browser.getTitle();
        expect(title).toBe('New Window Page');

        await browser.closeWindow();
        await browser.switchWindow('Links Page');
    });

    it('should take screenshots', async () => {
        await browser.url('/visual');
        await browser.saveScreenshot('./screenshots/visual.png');

        const element = await $('div.hero');
        await element.saveScreenshot('./screenshots/hero.png');
    });

    it('should handle cookies', async () => {
        await browser.url('/');
        await browser.setCookies({
            name: 'test-cookie',
            value: 'hello-world',
        });

        const cookie = await browser.getCookies(['test-cookie']);
        expect(cookie[0].value).toBe('hello-world');

        await browser.deleteCookies(['test-cookie']);
    });

    it('should execute JavaScript', async () => {
        await browser.url('/');
        const result = await browser.execute(function(a, b) {
            return a + b;
        }, 5, 10);
        expect(result).toBe(15);

        await browser.execute('document.title = "Modified"');
        const title = await browser.getTitle();
        expect(title).toBe('Modified');
    });

    it('should handle element interactions', async () => {
        await browser.url('/form');

        // Select dropdown
        const dropdown = await $('select#country');
        await dropdown.selectByVisibleText('United States');
        await dropdown.selectByAttribute('value', 'us');

        // Checkbox
        const checkbox = await $('input[type="checkbox"]#agree');
        await checkbox.click();
        expect(await checkbox.isSelected()).toBe(true);

        // Get attribute
        const input = await $('input#email');
        const placeholder = await input.getAttribute('placeholder');
        expect(placeholder).toBe('Enter email');

        // Get CSS property
        const btn = await $('button.submit');
        const color = await btn.getCSSProperty('background-color');
        expect(color.parsed.hex).toBe('#4CAF50');

        // Scroll
        const footer = await $('footer');
        await footer.scrollIntoView();
        expect(await footer.isDisplayedInViewport()).toBe(true);

        // Hover
        const menu = await $('div.menu-trigger');
        await menu.moveTo();
        const submenu = await $('ul.submenu');
        await expect(submenu).toBeDisplayed();

        // Drag and drop
        const source = await $('div.draggable');
        const target = await $('div.droppable');
        await source.dragAndDrop(target);

        // Wait for element
        const spinner = await $('div.loading');
        await spinner.waitForDisplayed({ reverse: true, timeout: 10000 });

        // Get value
        const nameInput = await $('input#name');
        await nameInput.setValue('John');
        const value = await nameInput.getValue();
        expect(value).toBe('John');
    });

    it('should handle network interception', async () => {
        const mock = await browser.mock('**/api/users');
        mock.respond([{ id: 1, name: 'Test User' }]);

        await browser.url('/users');
        const users = await $$('.user-card');
        expect(users.length).toBe(1);

        mock.restore();
    });

    it('should upload files', async () => {
        await browser.url('/upload');
        const fileInput = await $('input[type="file"]');
        await fileInput.setValue('/path/to/file.txt');

        const uploadBtn = await $('button=Upload');
        await uploadBtn.click();

        const successMsg = await $('p.success');
        await expect(successMsg).toHaveText('File uploaded successfully');
    });
});
