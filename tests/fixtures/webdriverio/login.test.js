const { expect } = require('@wdio/globals');

describe('Login Page', () => {
    beforeEach(async () => {
        await browser.url('/login');
    });

    it('should login with valid credentials', async () => {
        const username = await $('#username');
        await username.setValue('testuser');

        const password = await $('#password');
        await password.setValue('password123');

        const loginBtn = await $('button[type="submit"]');
        await loginBtn.click();

        await browser.waitUntil(
            async () => (await browser.getUrl()).includes('/dashboard'),
            { timeout: 5000, timeoutMsg: 'Expected to be on dashboard' }
        );

        const welcomeMsg = await $('h1.welcome');
        await expect(welcomeMsg).toBeDisplayed();
        await expect(welcomeMsg).toHaveText('Welcome, testuser!');
    });

    it('should show error for invalid credentials', async () => {
        await $('#username').setValue('wronguser');
        await $('#password').setValue('wrongpass');
        await $('button[type="submit"]').click();

        const errorMsg = await $('.error-message');
        await expect(errorMsg).toBeDisplayed();
        await expect(errorMsg).toHaveTextContaining('Invalid credentials');
    });

    it('should navigate to forgot password', async () => {
        const forgotLink = await $('a=Forgot Password?');
        await forgotLink.click();

        await expect(browser).toHaveUrl('/forgot-password');
        const heading = await $('h1');
        await expect(heading).toHaveText('Reset Password');
    });
});
