describe('Login Page', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('should login successfully with valid credentials', () => {
    cy.get('#username').clear().type('testuser');
    cy.get('#password').clear().type('password123');
    cy.get('.login-btn').click();

    cy.url().should('include', '/dashboard');
    cy.get('h1').should('contain.text', 'Welcome');
    cy.title().should('eq', 'Dashboard - MyApp');
  });

  it('should show error for invalid credentials', () => {
    cy.get('#username').type('wronguser');
    cy.get('#password').type('wrongpass');
    cy.get('.login-btn').click();

    cy.get('.error-message').should('be.visible');
    cy.get('.error-message').should('contain.text', 'Invalid credentials');
  });

  it('should navigate to forgot password', () => {
    cy.contains('Forgot Password?').click();
    cy.url().should('include', '/forgot-password');
    cy.get('[data-testid="email-input"]').should('be.visible');
  });

  afterEach(() => {
    cy.screenshot();
  });
});
