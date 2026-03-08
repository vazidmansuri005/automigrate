*** Settings ***
Library    SeleniumLibrary
Resource   common.resource
Suite Setup    Open Browser    ${BASE_URL}    chrome
Suite Teardown    Close Browser

*** Variables ***
${BASE_URL}    https://example.com
${USERNAME}    testuser
${PASSWORD}    secret123
${LOGIN_BTN}    css:button[type="submit"]

*** Test Cases ***
Valid Login
    [Documentation]    Verify successful login with valid credentials
    [Tags]    smoke    login
    Go To    ${BASE_URL}/login
    Input Text    id:username    ${USERNAME}
    Input Text    id:password    ${PASSWORD}
    Click Element    ${LOGIN_BTN}
    Wait Until Element Is Visible    css:.dashboard    timeout=10s
    Element Should Be Visible    css:.welcome-message
    Element Text Should Be    css:.welcome-message    Welcome, testuser

Invalid Login Shows Error
    [Tags]    negative    login
    Go To    ${BASE_URL}/login
    Input Text    id:username    invalid
    Input Text    id:password    wrongpass
    Click Element    ${LOGIN_BTN}
    Wait Until Element Is Visible    css:.error-message    timeout=5s
    Element Should Contain    css:.error-message    Invalid credentials

Logout After Login
    [Tags]    smoke    login
    Login As    ${USERNAME}    ${PASSWORD}
    Click Element    css:button.logout
    Wait Until Element Is Visible    css:.login-form
    Location Should Be    ${BASE_URL}/login
