class DashboardPage {
    get heading() { return $('h1.dashboard-title'); }
    get userMenu() { return $('[data-testid="user-menu"]'); }
    get logoutBtn() { return $('button=Logout'); }
    get navItems() { return $$('.nav-item'); }
    get searchInput() { return $('#search'); }
    get notifications() { return $$('.notification-item'); }

    async open() {
        await browser.url('/dashboard');
    }

    async logout() {
        await this.userMenu.click();
        await this.logoutBtn.waitForDisplayed();
        await this.logoutBtn.click();
    }

    async search(query) {
        await this.searchInput.setValue(query);
        await browser.keys('Enter');
        await browser.pause(1000);
    }

    async getNavItemTexts() {
        const items = await this.navItems;
        return Promise.all(items.map(item => item.getText()));
    }

    async getNotificationCount() {
        const items = await this.notifications;
        return items.length;
    }

    async isLoaded() {
        return this.heading.isDisplayed();
    }
}

module.exports = new DashboardPage();
