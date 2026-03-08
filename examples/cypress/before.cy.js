/**
 * Cypress test
 * Scenario: User profile — update settings, upload avatar, verify changes persist
 */

describe('User Profile Settings', () => {
  beforeEach(() => {
    // Login via API to skip UI login flow
    cy.request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'Test1234!',
    }).then((response) => {
      cy.setCookie('auth_token', response.body.token);
    });

    cy.visit('/settings/profile');
    cy.get('[data-testid="profile-page"]').should('be.visible');
  });

  afterEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('should update display name and bio', () => {
    // Clear and update display name
    cy.get('[data-testid="display-name-input"]')
      .should('be.visible')
      .clear()
      .type('Jane Test User');

    // Update bio with multi-line text
    cy.get('[data-testid="bio-textarea"]')
      .clear()
      .type('QA Engineer{enter}Automation enthusiast{enter}Coffee lover');

    // Select timezone from dropdown
    cy.get('#timezone-select').select('America/New_York');

    // Toggle email notifications
    cy.get('[data-cy="email-notifications-toggle"]')
      .should('not.be.checked')
      .check();

    // Toggle dark mode
    cy.get('[data-cy="dark-mode-toggle"]').check();
    cy.get('body').should('have.class', 'dark-theme');

    // Save changes
    cy.get('[data-testid="save-profile-btn"]').click();

    // Verify success notification
    cy.get('.notification-banner')
      .should('be.visible')
      .and('contain.text', 'Profile updated successfully');

    // Reload and verify changes persisted
    cy.reload();
    cy.get('[data-testid="display-name-input"]')
      .should('have.value', 'Jane Test User');
    cy.get('[data-testid="bio-textarea"]')
      .should('contain.text', 'QA Engineer');
    cy.get('#timezone-select')
      .should('have.value', 'America/New_York');
    cy.get('[data-cy="email-notifications-toggle"]')
      .should('be.checked');
  });

  it('should upload a profile avatar', () => {
    // Upload avatar image
    cy.get('input[type="file"]#avatar-upload').attachFile('avatar.png');

    // Wait for preview to appear
    cy.get('[data-testid="avatar-preview"]')
      .should('be.visible')
      .find('img')
      .should('have.attr', 'src')
      .and('include', 'blob:');

    // Crop and confirm
    cy.get('[data-testid="crop-confirm-btn"]').click();

    // Verify the avatar updated
    cy.get('[data-testid="current-avatar"]')
      .should('have.attr', 'src')
      .and('not.include', 'default-avatar');

    // Verify success message
    cy.contains('Avatar updated').should('be.visible');
  });

  it('should change password with validation', () => {
    cy.get('[data-testid="change-password-tab"]').click();

    // Enter mismatching passwords first
    cy.get('#current-password').type('Test1234!');
    cy.get('#new-password').type('NewPass123!');
    cy.get('#confirm-password').type('DifferentPass!');

    cy.get('[data-testid="update-password-btn"]').click();

    // Verify validation error
    cy.get('.error-message')
      .should('be.visible')
      .and('have.text', 'Passwords do not match');

    // Fix the confirmation password
    cy.get('#confirm-password')
      .clear()
      .type('NewPass123!');

    cy.get('[data-testid="update-password-btn"]').click();

    // Verify success
    cy.url().should('include', '/settings/profile');
    cy.get('.notification-banner')
      .should('contain.text', 'Password changed');
  });

  it('should handle network errors gracefully', () => {
    // Intercept the save API call and force a failure
    cy.intercept('PUT', '/api/user/profile', {
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    }).as('saveProfile');

    cy.get('[data-testid="display-name-input"]')
      .clear()
      .type('Updated Name');
    cy.get('[data-testid="save-profile-btn"]').click();

    cy.wait('@saveProfile');

    // Verify error notification
    cy.get('.notification-banner.error')
      .should('be.visible')
      .and('contain.text', 'Failed to save');

    // Verify form still has the user's input (not reset)
    cy.get('[data-testid="display-name-input"]')
      .should('have.value', 'Updated Name');
  });
});
