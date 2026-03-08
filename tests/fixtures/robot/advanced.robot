*** Settings ***
Library    SeleniumLibrary
Library    OperatingSystem
Resource   common.resource

*** Variables ***
${SCREENSHOT_DIR}    ./screenshots

*** Test Cases ***
Handle Frames
    [Tags]    frames
    Go To    ${BASE_URL}/frames
    Select Frame    css:iframe#content-frame
    Element Should Be Visible    css:p.inner-content
    Unselect Frame
    Element Should Be Visible    css:p.outer-content

Handle Multiple Windows
    [Tags]    windows
    Go To    ${BASE_URL}/links
    Click Element    link:Open New Window
    Switch Window    NEW
    Title Should Be    New Window Page
    Close Window
    Switch Window    MAIN

Take Screenshots
    [Tags]    screenshots
    Go To    ${BASE_URL}/visual
    Capture Page Screenshot    ${SCREENSHOT_DIR}/visual.png
    ${element}=    Get WebElement    css:div.hero
    Capture Element Screenshot    css:div.hero    ${SCREENSHOT_DIR}/hero.png

Handle Cookies
    [Tags]    cookies
    Go To    ${BASE_URL}
    Add Cookie    test-cookie    hello-world
    ${cookie}=    Get Cookie    test-cookie
    Should Be Equal    ${cookie.value}    hello-world
    Delete All Cookies

Execute JavaScript
    [Tags]    javascript
    Go To    ${BASE_URL}
    ${result}=    Execute JavaScript    return 5 + 10
    Should Be Equal As Numbers    ${result}    15
    Execute JavaScript    document.title = "Modified"
    Title Should Be    Modified

Handle Dropdowns And Forms
    [Tags]    forms
    Go To    ${BASE_URL}/form
    Select From List By Value    id:country    us
    Select From List By Label    id:country    United States
    Select Checkbox    id:agree
    Checkbox Should Be Selected    id:agree
    ${placeholder}=    Get Element Attribute    id:email    placeholder
    Should Be Equal    ${placeholder}    Enter email

Hover And Scroll
    [Tags]    interaction
    Go To    ${BASE_URL}/page
    Scroll Element Into View    css:footer
    Mouse Over    css:div.menu-trigger
    Element Should Be Visible    css:ul.submenu

Drag And Drop
    [Tags]    interaction
    Go To    ${BASE_URL}/dnd
    Drag And Drop    css:div.draggable    css:div.droppable

Wait For Elements
    [Tags]    waits
    Go To    ${BASE_URL}/async
    Wait Until Element Is Visible    css:div.loading    timeout=5s
    Wait Until Element Is Not Visible    css:div.loading    timeout=15s
    Wait Until Element Contains    css:div.result    Success
    Wait Until Page Contains    All loaded
