*** Settings ***
Library    SeleniumLibrary
Library    Collections

*** Variables ***
${TIMEOUT}    10s

*** Keywords ***
Login As
    [Arguments]    ${user}    ${pass}
    Go To    ${BASE_URL}/login
    Input Text    id:username    ${user}
    Input Text    id:password    ${pass}
    Click Element    css:button[type="submit"]
    Wait Until Element Is Visible    css:.dashboard    timeout=${TIMEOUT}

Select From Dropdown
    [Arguments]    ${locator}    ${value}
    Click Element    ${locator}
    Select From List By Value    ${locator}    ${value}

Wait And Click
    [Arguments]    ${locator}
    Wait Until Element Is Visible    ${locator}    timeout=${TIMEOUT}
    Click Element    ${locator}

Get Element Count
    [Arguments]    ${locator}
    ${elements}=    Get WebElements    ${locator}
    ${count}=    Get Length    ${elements}
    [Return]    ${count}
