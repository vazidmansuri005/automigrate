exports.config = {
    runner: 'local',
    specs: ['./test/specs/**/*.js'],
    maxInstances: 5,
    capabilities: [{
        browserName: 'chrome',
        'goog:chromeOptions': { args: ['--headless'] }
    }, {
        browserName: 'firefox'
    }],
    baseUrl: 'https://app.example.com',
    waitforTimeout: 15000,
    reporters: ['spec', 'allure'],
    screenshotPath: './screenshots',
};
