const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://staging.example.com',
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
    defaultCommandTimeout: 10000,
    retries: { runMode: 2, openMode: 0 },
    viewportWidth: 1920,
    viewportHeight: 1080,
    video: true,
    screenshotOnRunFailure: true,
  },
});
