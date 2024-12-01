import { Chrono } from 'chrono-node';
import 'emoji-picker-element';
let theme = 'light';
chrome.storage.local.get(["sidebarCollapsed", "theme"], (data) => {
    try {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.add('no-transition');
        if (data.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        }
        if (data.theme) {
            theme = data.theme;
            document.body.className = data.theme;
        }

        setTimeout(() => {
            sidebar.classList.remove('no-transition');
        }, 100);
    } catch (error) {
        console.error('Error updating sidebar:', error);
    }
});
function toggleTheme(){
    theme = theme === 'light' ? 'dark' : 'light';
    document.body.className = theme;
    const emojiPickers = document.querySelectorAll('emoji-picker');
    emojiPickers.forEach(picker => {
        picker.className = picker.className.replace(/light|dark/g, theme);
    });
    chrome.storage.local.set({ theme });
}
const scrollAnimation = {
    isScrolling: false,
    scrollX: 0,
    scrollY: 0,
    animationFrameId: null
};
const settingsButton = document.querySelector('.settings-button');
const columnsContainer = document.getElementById('columns-container');
const colorOptions = ['tab-default', 'tab-pink', 'tab-yellow', 'tab-blue', 'tab-purple'];
let dropIndicator = null;
let dropType = null;
let deletionArea = null;
let newColumnIndicator = null;
let lastSelectedIndex = null;
let activeColumnMenu = null;
let activeOptionsMenu = null;
let activeColorMenu = null;
let activeSettingsMenu = null;
let tabs_in_storage = [];
function getToday(tabDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of the day

    const parsedDate = new Date(tabDate);
    parsedDate.setHours(0, 0, 0, 0); // Normalize to start of the day

    const diffTime = parsedDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}
const getRandomEmoji = () => {
    const range = [0x1F34F, 0x1F37F]; // Food and Drink        
    const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    return String.fromCodePoint(codePoint);
};
document.getElementById("add-column").addEventListener("click", () => {
    createColumn();
    saveColumnState();
});

function createDeletionArea() {
    deletionArea = document.createElement('div');
    deletionArea.id = 'deletion-area';

    const deleteIcon = document.createElement('div');
    deleteIcon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>`;
    deleteIcon.alt = 'Delete Icon';
    deleteIcon.classList.add('delete-icon');
    deletionArea.appendChild(deleteIcon);

    deletionArea.addEventListener('dragover', handleDragOver);
    deletionArea.addEventListener('drop', handleDrop);
    deletionArea.addEventListener('dragleave', function(event) {
        if (!deletionArea.contains(event.relatedTarget)) {
            deletionArea.classList.remove('deletion-area-active');
        }
    });
    document.body.appendChild(deletionArea);
}
createDeletionArea();
function closeAllMenus() {
    [activeOptionsMenu, activeColorMenu, activeColumnMenu, activeSettingsMenu].forEach(menu => {
        if (menu) {
            menu.remove();
        }
    });
    activeOptionsMenu = activeColorMenu = activeColumnMenu = activeSettingsMenu = null;
}
function getBrowser() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf('firefox') > -1) {
        return 'firefox';
    }
    else {
        return 'chrome';
    }
}
const userBrowser = getBrowser();

/* Tab and Subgroup Functions */
function deleteTab(id, column = null, li = null) {
    if (!Array.isArray(id)) id = [id];

    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        id.forEach(tabId => {
            const index = tabs.findIndex(tab => tab.id === tabId);
            if (index !== -1) {
                tabs.splice(index, 1); // Remove the tab at the specified index
                //console.log('Tab deleted:', tabId);
            }
        });

        if(column){
            column.remove();
        }
        else if(li){
            li.remove();
        }
        chrome.storage.local.set({ savedTabs: tabs, columnState: saveColumnState(true) }, () => {
            //console.log('Updated storage with remaining columns');
        });
    });
}
function deleteSubgroup(groupId) {
    const li = document.getElementById(groupId);
    const tabIds = Array.from(li.querySelectorAll('.subgroup-favicon')).map(favicon => parseInt(favicon.id.split('-')[1]));
    li.remove();
    deleteTab(tabIds);
}
function ungroupSubgroup(groupId) {
    chrome.storage.local.get(['columnState', 'savedTabs'], (data) => {
        const columnState = data.columnState || [];
        const savedTabs = data.savedTabs || [];

        // Find which column contains the subgroup
        for (let column of columnState) {
            const tabIds = column.tabIds;
            const subgroupIndex = tabIds.findIndex(id => Array.isArray(id) && id[0] === groupId);
            
            if (subgroupIndex !== -1) {
                // Get the subgroup array
                const subgroup = tabIds[subgroupIndex];
                // Remove the subgroup itself
                tabIds.splice(subgroupIndex, 1);
                // Add all tabs from subgroup individually
                const individualTabs = subgroup.slice(1, -2);
                tabIds.splice(subgroupIndex, 0, ...individualTabs);
                
                // Save the updated state
                chrome.storage.local.set({ columnState: columnState, savedTabs: savedTabs }, () => {
                    console.log('Subgroup ungrouped:', groupId);
                });
                break;
            }
        }
    });
}
function saveTab(tabId) {
    const tabIds = Array.isArray(tabId) ? tabId : [tabId];
    const newTabs = [];

    tabIds.forEach(id => {
        const numericId = parseInt(id.replace('tab-', ''));
        chrome.tabs.get(numericId, (tab) => {
            const newTab = {
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl || '',
                id: numericId,
                color: '#FFFFFF'
            };
            newTabs.push(newTab);

            if (newTabs.length === tabIds.length) {
                chrome.storage.local.get("savedTabs", (data) => {
                    const existingTabs = data.savedTabs || [];
                    const updatedTabs = [...existingTabs, ...newTabs];
                    chrome.storage.local.set({ savedTabs: updatedTabs, columnState: saveColumnState(true) }, () => {
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            let activeTab = tabs[0];
                            chrome.tabs.remove(tabIds.map(id => parseInt(id.replace('tab-', ''))), () => {
                                // Ensure the focus remains on the active tab
                                chrome.tabs.update(activeTab.id, { active: true });
                            });
                        });
                    });
                });
            }
        });
    });
}

/* Tab Menu Actions */
function createMenuDropdown(menuItems, button) {
    const menuDropdown = document.createElement("div");
    menuDropdown.className = "options-menu";

    menuItems.forEach(item => {
        if (item.hidden) return;
        const menuItem = document.createElement("button");
        menuItem.classList.add("menu-option");
        menuItem.innerHTML = `
            <span>${item.text}</span>
        `;
        menuItem.addEventListener("click", (e) => {
            e.stopPropagation();
            item.action(e);
            menuDropdown.style.display = "none";
        });
        menuDropdown.appendChild(menuItem);
    });

    // Position the dropdown relative to the button
    const buttonRect = button.getBoundingClientRect();
    menuDropdown.style.position = "fixed";
    menuDropdown.style.top = `${buttonRect.bottom + 5}px`;
    menuDropdown.style.right = `${window.innerWidth - buttonRect.right}px`;

    document.body.appendChild(menuDropdown);
    return menuDropdown;
}
function renameTab(tab, li) {
    li.removeEventListener('dragstart', handleDragStart);
    li.draggable = false;
    const column = li.closest('.column');
    column.draggable = false;
    const subgroup = li.closest('.subgroup-item');
    if (subgroup) subgroup.draggable = false;

    const titleDisplay = li.querySelector(`#title-display-${tab.id}`);
    const titleInput = li.querySelector(`#title-input-${tab.id}`);

    titleInput.classList.remove("hidden");
    titleDisplay.classList.add("hidden");
    titleInput.focus();

    const length = titleInput.value.length;
    titleInput.setSelectionRange(length, length);

    titleInput.addEventListener('keydown', function handleKeydown(event) {
        if (event.key === 'Enter') {
            titleDisplay.textContent = titleInput.value;
            titleInput.classList.add("hidden");
            titleDisplay.classList.remove("hidden");
            titleInput.removeEventListener('keydown', handleKeydown);
        }
    });

    titleInput.addEventListener("blur", function () {
        const newTitle = titleInput.value;
        li.draggable = true;
        column.draggable = true;
        if (subgroup) subgroup.draggable = true;
        chrome.storage.local.get("savedTabs", (data) => {
            const tabs = data.savedTabs || [];
            const tabIndex = tabs.findIndex(t => t.id === tab.id);
            tabs[tabIndex].title = newTitle;
            titleDisplay.textContent = newTitle;
            titleInput.classList.add("hidden");
            titleDisplay.classList.remove("hidden");
            li.addEventListener('dragstart', handleDragStart);
            chrome.storage.local.set({ savedTabs: tabs }, () => {
                //console.log('Tab title saved:', tab.id, newTitle);
            });
        });
    });
}
function editTabNote(tab, li) {
    li.removeEventListener('dragstart', handleDragStart);
    const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
    const noteInput = li.querySelector(`#note-input-${tab.id}`);
    const column = li.closest('.column');

    li.draggable = false;
    column.draggable = false;
    noteInput.classList.remove("hidden");
    noteDisplay.classList.add("hidden");
    noteInput.focus();
    noteInput.style.height = "auto";
    noteInput.style.height = (noteInput.scrollHeight) + "px";

    const length = noteInput.value.length;
    noteInput.setSelectionRange(length, length);
}
function saveTabNote(id, note) {
    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const index = tabs.findIndex(tab => tab.id === id);
        const { parsedDate, remainingNote } = parseAndSaveDate(note);
        tabs[index].note = remainingNote.replace(/\n/g, '<br>'); // Update the note for the tab

        if (parsedDate) {
            tabs[index].parsedDate = parsedDate.getTime(); // Save the timestamp of the date
        }

        chrome.storage.local.set({ savedTabs: tabs }, () => {
            //console.log('Tab note saved:', id, remainingNote);
        });
    });
}
function calculateFormattedDate(parsedDate) {
    if (!parsedDate) {
        return { formattedDate: '', dateDisplayColor: '#e63c30' };
    }

    parsedDate = new Date(parsedDate);
    const diffDays = getToday(parsedDate);
    let formattedDate = '';
    let dateDisplayColor = '#ababab';

    if (diffDays === 0) {
        formattedDate = 'Today';
        dateDisplayColor = '#058527';
    } else if (diffDays === 1) {
        formattedDate = 'Tomorrow';
        dateDisplayColor = '#C76E00';
    } else if (diffDays >= 2 && diffDays <= 7) {
        const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        formattedDate = weekdayNames[parsedDate.getDay()];
    } else {
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getDate()).padStart(2, '0');
        const year = String(parsedDate.getFullYear()).slice(-2);
        formattedDate = `${month}/${day}/${year}`;
    }

    if (diffDays < 0) {
        dateDisplayColor = '#e63c30';
    }

    return { formattedDate, dateDisplayColor };
}
function parseAndSaveDate(note) {
    const chrono = new Chrono();
    const parsedNote = note.replace(/\\\w+/g, '');
    const parsedDate = chrono.parseDate(parsedNote);
    const detectedDateText = parsedDate ? chrono.parse(note)[0].text : '';
    
    // Remove the parsed date from the note
    const remainingNote = parsedDate ? note.replace(detectedDateText, '').trim() : note;
    return { parsedDate, remainingNote, detectedDateText };
}
function removeDate(tab, dateDisplay) {
    tab.parsedDate = null;
    dateDisplay.textContent = '';
    dateDisplay.classList.add('hidden');
    chrome.storage.local.set({ savedTabs: tabs_in_storage }, () => {
        console.log('Tab date removed:', tab.id);
    });
}
function openColorMenu(tab, moreOptionsButton) {
    if (activeColorMenu) {
        activeColorMenu.remove();
        activeColorMenu = null;
        return;
    }
    const colorMenu = document.createElement('div');
    colorMenu.classList.add('color-menu');

    colorOptions.forEach(color => {
        const colorOption = document.createElement('div');
        colorOption.classList.add('color-option', color);
        colorOption.addEventListener('click', () => {
            tab.color = color;
            chrome.storage.local.set({ savedTabs: tabs_in_storage }, () => {
                //console.log('Tab color saved:', tab.id, tab.color);
            });
            closeAllMenus();
        });
        colorMenu.appendChild(colorOption);
    });

    document.body.appendChild(colorMenu);
    const rect = moreOptionsButton.getBoundingClientRect();
    colorMenu.style.top = `${rect.bottom + 5}px`;
    colorMenu.style.right = `${window.innerWidth - rect.right}px`;
    activeColorMenu = colorMenu;
}

/* Column Menu Actions */
function deleteColumn(event) {
    closeAllMenus();
    let column = event;
    if(event instanceof Event){
        column = event.target.closest(".column");
    }
    const tabItems = column.querySelectorAll('.tab-item');
    const tabIds = Array.from(tabItems).map(tabItem => tabItem.id);
    deleteTab(tabIds.map(id => parseInt(id.replace('tab-', ''))), column);
}
function openAllInColumn(column, subgroup = null) {
    closeAllMenus();
    let urls;
    if (subgroup) {
        const favicons = Array.from(column.querySelectorAll(`#${subgroup[0]} .subgroup-favicon`));
        urls = favicons.map(favicon => favicon.dataset.url);
    }
    else{
        const tabItems = column.querySelectorAll('.tab-item:not(.subgroup-item .tab-item)');
        urls = Array.from(tabItems).flatMap(tabItem => {
            if (tabItem.classList.contains('subgroup-item')) {
                const favicons = tabItem.querySelectorAll('.subgroup-favicon');
                return Array.from(favicons).map(favicon => favicon.dataset.url);
            } else {
                return tabItem.dataset.url;
            }
        });
    }
    if(userBrowser === 'firefox'){
        urls.forEach(url => {
            browser.tabs.create({ url, active: false });
        });   
    }
    else{
        // Open all tabs
        const createTabs = urls.map(url => 
            new Promise(resolve => {
                chrome.tabs.create({ url: url, active: false }, resolve);
            })
        );
        // After all tabs are created, group them
        Promise.all(createTabs).then(tabs => {
            const tabIds = tabs.map(tab => tab.id); // Extract tab IDs
            chrome.tabs.group({ tabIds: tabIds }, groupId => {
                // Set the title of the group
                let title;
                if(subgroup){
                    title = subgroup[subgroup.length - 2];
                }
                else{
                    title = column.querySelector('.column-title-text').textContent;
                }
                chrome.tabGroups.update(groupId, { title });
            });
        });
    }
}

/* Column Functions */
function saveColumnState(returnState = false) {
    const columns = columnsContainer.querySelectorAll('.column');
    const columnState = [];
    columns.forEach(column => {
        const columnId = column.id;
        const tabItems = Array.from(column.querySelectorAll('.tab-item')).filter(item => 
            item.classList.contains('tab-item') && !item.closest('.expanded-tabs')
        );
        const tabIds = Array.from(tabItems).map(tabItem => {
            if (tabItem.classList.contains('subgroup-item')) {
                const expandedContainer = tabItem.querySelector('.expanded-tabs');
                const expandedTabList = Array.from(expandedContainer.querySelectorAll('li'));
                const subgroup = [
                    tabItem.id,
                    ...expandedTabList.map(tab => tab.id),
                    tabItem.querySelector('.subgroup-title-text').textContent,
                    tabItem.querySelector('.expand-button').classList.contains('expanded')
                ];
                return subgroup.length > 3 ? subgroup : null;
            } 
            else {
                return tabItem.id;
            }
        }).filter(id => id !== null);
        
        columnState.push({
            id: columnId,
            tabIds: tabIds,
            title: column.querySelector('.column-title-text').textContent,
            minimized: column.classList.contains('minimized'),
            emoji: column.dataset.emoji
        });
    });
    if(returnState) {
        return columnState;
    }
    else{
        chrome.storage.local.set({ columnState }, () => {
            //console.log('Column state saved:', columnState);
        });
    }
}
function minimizeColumn(column) {
    const titleSpan = column.querySelector(".column-title-text");
    const titleInput = column.querySelector(".column-title-input");
    const maximizeButton = column.querySelector(".maximize-column");
    const minimizeButton = column.querySelector(".minimize-column");
    const titleGroup = column.querySelector(".title-group");
    const menuContainer = column.querySelector(".menu-container");
    const menuButton = column.querySelector(".more-options");
    const headerContainer = column.querySelector(".header-container");

    column.classList.add("minimized");
    titleSpan.classList.add("vertical-text");
    titleInput.classList.add("vertical-text");
    titleGroup.classList.add("vertical");
    maximizeButton.style.display = "inline";
    minimizeButton.style.display = "none";
    menuContainer.classList.add("vertical");
    menuButton.classList.add("vertical");
    headerContainer.classList.add("vertical");

    // Hide all tab items in the column
    const tabItems = column.querySelectorAll('.tab-item');
    tabItems.forEach(tabItem => {
        tabItem.style.display = "none";
    });
}
function maximizeColumn(column) {
    const titleSpan = column.querySelector(".column-title-text");
    const titleInput = column.querySelector(".column-title-input");
    const titleGroup = column.querySelector(".title-group");
    const maximizeButton = column.querySelector(".maximize-column");
    const minimizeButton = column.querySelector(".minimize-column");
    const menuContainer = column.querySelector(".menu-container");
    const menuButton = column.querySelector(".more-options");
    const headerContainer = column.querySelector(".header-container");

    column.classList.remove("minimized");
    titleSpan.classList.remove("vertical-text");
    titleInput.classList.remove("vertical-text");
    titleGroup.classList.remove("vertical");
    maximizeButton.style.display = "none";
    minimizeButton.style.display = "inline";
    menuContainer.classList.remove("vertical");
    menuButton.classList.remove("vertical");
    headerContainer.classList.remove("vertical");

    // Show all tab items in the column
    const tabItems = column.querySelectorAll('.tab-item');
    tabItems.forEach(tabItem => {
        tabItem.style.display = "flex";
    });
}

/* Tab Drag and Drop */
function handleDragStart(event) {
    event.stopPropagation();
    closeAllMenus();
    const tabItem = event.target.closest('.tab-item');
    if(!tabItem) return;
    event.dataTransfer.setData("text/plain", tabItem.id);
    event.dataTransfer.setDragImage(tabItem, 0, 0);
    dropType = "list-item";

    const draggedItems = document.querySelectorAll('.selected');
    const isDraggedItemSelected = tabItem.classList.contains('selected');
    
    if (isDraggedItemSelected && draggedItems.length > 1) {
        draggedItems.forEach(item => item.classList.add('dragging'));
    } 
    // If dragging an unselected item, only add dragging to that item
    else {
        draggedItems.forEach(item => item.classList.remove('selected'));
        tabItem.classList.add('dragging');
    }
}
function calculateDropPosition(event, tabItems, isMinimized = false) {
    if(isMinimized){
        return tabItems.length;
    } 

    // If dragging a subgroup, filter out items that are inside subgroups
    const draggedElement = document.querySelector('.dragging');
    if (draggedElement && draggedElement.classList.contains('subgroup-item')) {
        tabItems = tabItems.filter(item => !item.closest('.expanded-tabs'));
    }

    let dropPosition = tabItems.length;
    for (let i = 0; i < tabItems.length; i++) {
        const tabRect = tabItems[i].getBoundingClientRect();
        if (event.clientY < tabRect.top + tabRect.height / 2) {
            dropPosition = i;
            break;
        }
    }
    return dropPosition;
}

/* Column Drag and Drop */
function handleColumnDragStart(event) {
    closeAllMenus();
    if (event.target.closest('.tab-item')) {
        event.preventDefault();
        return;
    }
    const column = event.target.closest('.column');
    if(!column) return;

    // Remove .selected class from all items
    const draggedItems = document.querySelectorAll('.selected');
    draggedItems.forEach(item => item.classList.remove('selected'));

    event.dataTransfer.setData("text/plain", column.id);
    event.dataTransfer.setDragImage(column, 0, 0);
    dropType = "column";
    column.classList.add("dragging");
}
function calculateColumnDropPosition(event, columns) {
    let dropPosition = columns.length;
    for (let i = 0; i < columns.length; i++) {
        const columnRect = columns[i].getBoundingClientRect();
        if (event.clientX < columnRect.left + columnRect.width / 2) {
            dropPosition = i;
            break;
        }
    }
    return dropPosition;
}

/* General Drag and Drop */
function startScrollAnimation(container) {
    function animate() {
        if (!scrollAnimation.isScrolling) return;

        if (scrollAnimation.scrollX !== 0 || scrollAnimation.scrollY !== 0) {
            container.scrollBy(scrollAnimation.scrollX, scrollAnimation.scrollY);
            scrollAnimation.animationFrameId = requestAnimationFrame(animate);
        } else {
            stopScrollAnimation();
        }
    }
    scrollAnimation.animationFrameId = requestAnimationFrame(animate);
}
function stopScrollAnimation() {
    scrollAnimation.isScrolling = false;
    scrollAnimation.scrollX = 0;
    scrollAnimation.scrollY = 0;
    if (scrollAnimation.animationFrameId) {
        cancelAnimationFrame(scrollAnimation.animationFrameId);
        scrollAnimation.animationFrameId = null;
    }
}
function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    /* Auto Scroll */
    const scrollThreshold = 240;
    const maxScrollSpeed = 15;
    const containerRect = columnsContainer.getBoundingClientRect();
    function calculateScrollSpeed(distance) {
        if (distance <= 0) return 0;
        if (distance >= scrollThreshold) return 0;
        
        // Create a smooth acceleration curve
        const scrollProgress = 1 - (distance / scrollThreshold);
        return maxScrollSpeed * Math.pow(scrollProgress, 2);
    }
    const leftSpeed = calculateScrollSpeed(event.clientX - containerRect.left);
    const rightSpeed = calculateScrollSpeed(containerRect.right - event.clientX);
    const topSpeed = calculateScrollSpeed(event.clientY - containerRect.top);
    const bottomSpeed = calculateScrollSpeed(containerRect.bottom - event.clientY);
    scrollAnimation.scrollX = -leftSpeed + rightSpeed;
    scrollAnimation.scrollY = -topSpeed + bottomSpeed;
    if (!scrollAnimation.isScrolling && (scrollAnimation.scrollX !== 0 || scrollAnimation.scrollY !== 0)) {
        scrollAnimation.isScrolling = true;
        startScrollAnimation(columnsContainer);
    } 
    else if (scrollAnimation.scrollX === 0 && scrollAnimation.scrollY === 0) {
        stopScrollAnimation();
    }

    /* Deletion Area and New Column Indicator */
    deletionArea.style.display = 'flex';
    if (deletionArea.contains(event.target)) {
        deletionArea.classList.add('deletion-area-active');
        dropIndicator.style.display = 'none';
        return;
    } 
    else if (newColumnIndicator.contains(event.target)) {
        newColumnIndicator.classList.add('new-column-indicator-active');
        dropIndicator.style.display = 'none';
        return;
    }
    
    const column = event.target.closest('.column');
    const openTabsList = event.target.closest('#open-tabs-list');
    const spaceContainer = document.getElementById('space-container');
    const spaceContainerRect = spaceContainer.getBoundingClientRect();
    const spaceContainerLeft = spaceContainerRect.left;
    const spaceContainerRight = spaceContainerRect.right;
    const containerScrollTop = openTabsList ? sidebar.scrollTop : columnsContainer.scrollTop;

    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        const dropIndicatorContainer = document.createElement('div');
        dropIndicatorContainer.className = 'drop-indicator-container';
        dropIndicatorContainer.appendChild(dropIndicator);
        document.body.appendChild(dropIndicatorContainer);
    }

    /* List Item Drag Over */
    if (dropType === "list-item") {
        newColumnIndicator.style.display = 'flex';
        const sidebar = document.getElementById('sidebar');
        const sidebarRect = sidebar.getBoundingClientRect();
        const element = openTabsList || column;
        if(!element){
            return;
        }
        const rect = element.getBoundingClientRect();
        // Only get top-level tab items (excluding items inside subgroups)
        const listItems = Array.from(element.children).filter(item => 
            item.classList.contains('tab-item') && !item.closest('.expanded-tabs')
        );
        const isMinimized = column && column.classList.contains('minimized');
        const dropPosition = calculateDropPosition(event, listItems, isMinimized);

        let indicatorLeft = rect.left;
        let width = rect.width;
        if(openTabsList){
            indicatorLeft = sidebarRect.left;
            width = sidebarRect.width;
        }
        else{
            // Left boundary
            if (indicatorLeft < spaceContainerLeft) {
                const difference = spaceContainerLeft - indicatorLeft;
                indicatorLeft = spaceContainerLeft;
                width = width - difference;
            }
            // Right boundary 
            if (indicatorLeft + width > spaceContainerRight) {
                width = spaceContainerRight - indicatorLeft;
            }
        }
        dropIndicator.style.width = `${width}px`;
        dropIndicator.style.height = '2px';
        dropIndicator.style.left = `${indicatorLeft}px`;

        const rectTopScroll = rect.top + containerScrollTop;
        const containerRect = openTabsList ? sidebarRect : spaceContainerRect;
        let indicatorTop;
        if (dropPosition === listItems.length) {
            const lastItem = listItems[listItems.length - 1];
            indicatorTop = isMinimized || !lastItem 
                ? rectTopScroll 
                : lastItem.getBoundingClientRect().bottom + containerScrollTop;
        } else {
            indicatorTop = listItems[dropPosition].getBoundingClientRect().top + containerScrollTop;
        }
        indicatorTop = Math.max(indicatorTop, containerRect.top);
        indicatorTop = Math.min(indicatorTop, containerRect.bottom - 2);
        dropIndicator.style.top = `${indicatorTop}px`;

        const draggedTabs = Array.from(document.querySelectorAll('.dragging'));

        // Check if dragging directly over a tab or group
        const targetTab = listItems.find(item => {
            if (item.closest('#open-tabs-list') || item.classList.contains('dragging') || item.closest('.expanded-tabs')) {
                return false;
            }
            // Check if the tab is already in the target subgroup
            const targetSubgroup = item.closest('.subgroup-item');
            if (targetSubgroup && draggedTabs.some(tab => targetSubgroup.contains(tab))) {
                return false;
            }
            const itemRect = item.getBoundingClientRect();
            const itemHeight = itemRect.bottom - itemRect.top;

            // Calculate middle third region
            const middleThirdTop = itemRect.top + itemHeight / 3;
            const middleThirdBottom = itemRect.bottom - itemHeight / 3;

            // Calculate fixed 32px exclusion region
            const fixedMargin = 32;
            const fixedTop = itemRect.top + fixedMargin;
            const fixedBottom = itemRect.bottom - fixedMargin;

            // Use larger region
            return fixedBottom - fixedTop > middleThirdBottom - middleThirdTop
            ? event.clientY >= fixedTop && event.clientY <= fixedBottom
            : event.clientY >= middleThirdTop && event.clientY <= middleThirdBottom;
        });

        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('targeted');
        });
        if (targetTab) {
            targetTab.classList.add('targeted');
            dropIndicator.style.display = 'none';
        } else {
            dropIndicator.style.display = 'block';
        }
        
        let draggedTabsFromSubgroup = null;
        if (draggedTabs.length > 0) {
            const firstSubgroup = draggedTabs[0].closest('.subgroup-item');
            const allFromSameSubgroup = draggedTabs.every(tab => tab.closest('.subgroup-item') === firstSubgroup);

            if (allFromSameSubgroup && !draggedTabs[0].classList.contains('subgroup-item')) {
                draggedTabsFromSubgroup = firstSubgroup;
            }
        }
        const targetInSubgroup = event.target.closest('.subgroup-item');

        // Rearrange tabs within the same subgroup
        if (draggedTabsFromSubgroup && targetInSubgroup && targetInSubgroup === draggedTabsFromSubgroup) {
            const subgroupItems = Array.from(draggedTabsFromSubgroup.querySelectorAll('.tab-item')).filter(item => item.closest('.expanded-tabs'));
            const subgroupDropPosition = calculateDropPosition(event, subgroupItems, isMinimized);

            let subgroupRect = draggedTabsFromSubgroup.getBoundingClientRect();
            let subgroupIndicatorLeft = subgroupRect.left;
            let subgroupWidth = subgroupRect.width;

            dropIndicator.style.width = `${subgroupWidth}px`;
            dropIndicator.style.height = '2px';
            dropIndicator.style.left = `${subgroupIndicatorLeft}px`;

            let subgroupIndicatorTop;
            if (subgroupDropPosition === subgroupItems.length) {
                const lastSubItem = subgroupItems[subgroupDropPosition - 1];
                subgroupIndicatorTop = lastSubItem 
                    ? lastSubItem.getBoundingClientRect().bottom + containerScrollTop
                    : subgroupRect.top + containerScrollTop;
            } else {
                subgroupIndicatorTop = subgroupItems[subgroupDropPosition].getBoundingClientRect().top + containerScrollTop;
            }

            dropIndicator.style.top = `${subgroupIndicatorTop}px`;
        }
    }
    /* Column Drag Over */
    else if (dropType === "column") {
        newColumnIndicator.style.display = 'none';
        dropIndicator.style.display = 'block';

        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);

        let indicatorLeft;
        const width = 2;
        let height = containerRect.height;

        // Left boundary
        if (indicatorLeft < spaceContainerLeft) {
            indicatorLeft = spaceContainerLeft;
        }
        // Right boundary
        if (indicatorLeft > spaceContainerRight - width) {
            indicatorLeft = spaceContainerRight - width;
        }

        if (dropPosition === columns.length) {
            const lastColumn = columns[columns.length - 1];
            indicatorLeft = lastColumn ? lastColumn.getBoundingClientRect().right : containerRect.left;
        } else {
            const targetColumn = columns[dropPosition];
            indicatorLeft = targetColumn.getBoundingClientRect().left;
        }

        dropIndicator.style.width = `${width}px`;
        dropIndicator.style.height = `${height}px`;
        dropIndicator.style.left = `${indicatorLeft}px`;
        dropIndicator.style.top = `${containerRect.top + containerScrollTop}px`;
    }
}
function handleDrop(event) {
    event.preventDefault();
    const eventDropData = event.dataTransfer.getData("text/plain");

    /* Column Drop */
    const droppedColumn = document.getElementById(eventDropData);
    if (droppedColumn && droppedColumn.classList.contains('column')) {
        if(deletionArea.contains(event.target)) {
            deleteColumn(droppedColumn);
            return;
        }

        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);

        if (dropPosition === columns.length) {
            columnsContainer.appendChild(droppedColumn);
        }
        else {
            columnsContainer.insertBefore(droppedColumn, columns[dropPosition]);
        }

        // Ensure newColumnIndicator is the last element
        columnsContainer.appendChild(newColumnIndicator);

        saveColumnState();
        return;
    }

    /* List Item Drop */
    const column = event.target.closest('.column') || event.target.closest('#open-tabs-list');
    const columnState = saveColumnState(true);
    const isMinimized = column && column.classList.contains('minimized');
    if (!column && !deletionArea.contains(event.target) && !newColumnIndicator.contains(event.target)) {
        return;
    }
    const tabId = eventDropData;
    const tabItem = document.querySelector(`li#${tabId}`);
    if (!tabItem || !tabItem.classList.contains('tab-item')){
        return;
    }

    const draggedTabs = Array.from(document.querySelectorAll('.dragging'));
    const itemsToProcess = draggedTabs.length > 1 ? draggedTabs : [tabItem];
    const draggedTabIds = Array.from(itemsToProcess).map(item => item.id);

    const tabIdsToDelete = [];
    const itemIdsToSave = [];
    const itemsToInsert = [];

    if(deletionArea.contains(event.target)) {
        let deletedSubgroup = false;
        itemsToProcess.forEach(item => {
            const itemId = item.id;
            if (itemId.startsWith('tab-')) {
                tabIdsToDelete.push(parseInt(itemId.replace('tab-', '')));
                item.remove();
            }
            else if (itemId.startsWith('opentab')) {
                chrome.tabs.remove(parseInt(itemId.replace('opentab-', '')), () => {
                    //console.log('Tab closed:', itemId);
                });
                item.remove();
            }
            else if (itemId.startsWith('group')) {
                deleteSubgroup(itemId);
                deletedSubgroup = true;
            }
        });
        if(!deletedSubgroup){
            deleteTab(tabIdsToDelete);
        }
        return;
    }
    else if(newColumnIndicator.contains(event.target)) {
        const newColumn = createColumn();
        itemsToProcess.forEach(item => {
            if(item.id.startsWith('opentab-')) {
                itemIdsToSave.push(item.id.replace('opentab-', ''));
            }
            newColumn.appendChild(item);
        });
        if(itemIdsToSave.length > 0) {
            saveTab(itemIdsToSave);
        }
        else{
            saveColumnState();
        }
        return;
    }

    const columnIndex = columnState.findIndex(col => col.id === column.id);
    const tabItems = Array.from(column.querySelectorAll('.tab-item')).filter(item => !item.closest('.expanded-tabs'));
    const dropPosition = calculateDropPosition(event, tabItems, isMinimized);

    const firstSubgroup = itemsToProcess[0].closest('.subgroup-item');
    const allFromSameSubgroup = itemsToProcess.every(item => item.closest('.subgroup-item') === firstSubgroup);
    const draggedTabsFromSubgroup = allFromSameSubgroup ? firstSubgroup : null;
    const targetIsSubgroup = event.target.closest('.subgroup-item');

    // Rearranging tabs within a subgroup
    if (targetIsSubgroup && draggedTabsFromSubgroup && targetIsSubgroup === draggedTabsFromSubgroup) {
        const tabIds = columnState[columnIndex].tabIds;
        const subgroupId = targetIsSubgroup.id;
        const subgroupIndex = tabIds.findIndex(id => Array.isArray(id) && id[0] === subgroupId);
        const subgroupItems = Array.from(targetIsSubgroup.querySelectorAll('.tab-item')).filter(item => item.closest('.expanded-tabs'));
        let targetIndex = calculateDropPosition(event, subgroupItems, isMinimized) + 1;
        if (subgroupIndex !== -1) {
            let subgroup = tabIds[subgroupIndex];

            // Adjust targetIndex based on the position of dragged tabs
            draggedTabIds.forEach(draggedTabId => {
                const tabIndex = subgroup.indexOf(draggedTabId);
                if (tabIndex !== -1 && tabIndex < targetIndex) {
                    targetIndex--;
                }
            });

            subgroup = subgroup.filter(tabId => !draggedTabIds.includes(tabId));
            subgroup.splice(targetIndex, 0, ...draggedTabIds);
            columnState[columnIndex].tabIds[subgroupIndex] = subgroup;

            chrome.storage.local.set({ columnState }, () => {
                //console.log('Rearranged tabs within subgroup:', columnState);
            });
        }
        return;
    }

    // Dropped directly on top of another tab or group
    const targetTab = tabItems.find(item => {
        if (item.closest('#open-tabs-list') || item.classList.contains('dragging') || item.closest('.expanded-tabs')) {
            return false;
        }
        // Check if the tab is already in the target subgroup
        const targetSubgroup = item.closest('.subgroup-item');
        if (targetSubgroup && draggedTabs.some(tab => targetSubgroup.contains(tab))) {
            return false;
        }
        const itemRect = item.getBoundingClientRect();
        const itemHeight = itemRect.bottom - itemRect.top;

        // Calculate middle third region
        const middleThirdTop = itemRect.top + itemHeight / 3;
        const middleThirdBottom = itemRect.bottom - itemHeight / 3;

        // Calculate fixed 32px exclusion region
        const fixedMargin = 32;
        const fixedTop = itemRect.top + fixedMargin;
        const fixedBottom = itemRect.bottom - fixedMargin;

        // Use larger region
        return fixedBottom - fixedTop > middleThirdBottom - middleThirdTop
        ? event.clientY >= fixedTop && event.clientY <= fixedBottom
        : event.clientY >= middleThirdTop && event.clientY <= middleThirdBottom;
    });

    if (targetTab) {
        const targetTabId = targetTab.id;
        let _draggedTabIds = draggedTabIds.slice().map(id => id.replace('opentab-', 'tab-'));
        const generateGroupId = () => `group-${Date.now()}`;
        const removeTabsFromSource = (draggedTabIds) => {
            draggedTabIds.forEach(draggedTabId => {
                for (let colIndex = 0; colIndex < columnState.length; colIndex++) {
                    const sourceTabIds = columnState[colIndex].tabIds;
    
                    // Check for tab as individual item
                    const sourceIndex = sourceTabIds.findIndex(id => id === draggedTabId);
                    if (sourceIndex !== -1) {
                        sourceTabIds.splice(sourceIndex, 1);
                        break;
                    }
    
                    // Check for tab within subgroups
                    const sourceSubgroupIndex = sourceTabIds.findIndex(id => 
                        Array.isArray(id) && id.includes(draggedTabId)
                    );
                    if (sourceSubgroupIndex !== -1) {
                        const sourceSubgroup = sourceTabIds[sourceSubgroupIndex];
                        const tabIndexInSubgroup = sourceSubgroup.indexOf(draggedTabId);
                        if (tabIndexInSubgroup !== -1) {
                            sourceSubgroup.splice(tabIndexInSubgroup, 1);
                            // Remove empty subgroup
                            if (sourceSubgroup.length <= 3) {
                                sourceTabIds.splice(sourceSubgroupIndex, 1);
                            }
                            break;
                        }
                    }
                }
            });
        };
    
        if (columnIndex !== -1) {
            const tabIds = columnState[columnIndex].tabIds;
            let targetTabIdIndex = tabIds.findIndex(id => id === targetTabId || (Array.isArray(id) && id[0] === targetTabId));
    
            if (targetTabIdIndex !== -1) {
                let sourceSubgroup = null;
                let sourceColumnIndex = -1;
                let tabsToAdd = [];
                for (let i = 0; i < columnState.length; i++) {
                    const col = columnState[i];
                    const subgroup = col.tabIds.find(id => Array.isArray(id) && id[0] === _draggedTabIds[0]);
                    if (subgroup) {
                        sourceSubgroup = subgroup;
                        tabsToAdd = sourceSubgroup.slice(1, -2);
                        sourceColumnIndex = i;
                        break;
                    }
                }
    
                const draggedIsSubgroup = tabItem.classList.contains('subgroup-item');
                // Source is existing subgroup and target is regular tab
                if (draggedIsSubgroup && !Array.isArray(tabIds[targetTabIdIndex])) {
                    const title = sourceSubgroup[sourceSubgroup.length - 2];
                    const expanded = sourceSubgroup[sourceSubgroup.length - 1];
                    tabIds[targetTabIdIndex] = [generateGroupId(), tabIds[targetTabIdIndex], ...tabsToAdd, title, expanded];
    
                    // Remove the source subgroup from its original column
                    if (sourceColumnIndex !== -1) {
                        const sourceTabIds = columnState[sourceColumnIndex].tabIds;
                        const sourceIndex = sourceTabIds.findIndex(id => Array.isArray(id) && id[0] === _draggedTabIds[0]);
                        if (sourceIndex !== -1) {
                            sourceTabIds.splice(sourceIndex, 1);
                        }
                    }
                } 
                // Merging two subgroups
                else if (draggedIsSubgroup && Array.isArray(tabIds[targetTabIdIndex])) {
                    tabIds[targetTabIdIndex].splice(tabIds[targetTabIdIndex].length - 2, 0, ...tabsToAdd);
    
                    // Remove the source subgroup from its original column
                    if (sourceColumnIndex !== -1) {
                        const sourceTabIds = columnState[sourceColumnIndex].tabIds;
                        const sourceIndex = sourceTabIds.findIndex(id => Array.isArray(id) && id[0] === _draggedTabIds[0]);
                        if (sourceIndex !== -1) {
                            sourceTabIds.splice(sourceIndex, 1);
                        }
                    }
                }
                // Source is regular tab and target is an existing subgroup
                else if (Array.isArray(tabIds[targetTabIdIndex])) {
                    removeTabsFromSource(_draggedTabIds);
                    targetTabIdIndex = tabIds.findIndex(id => id === targetTabId || (Array.isArray(id) && id[0] === targetTabId));
                    tabIds[targetTabIdIndex].splice(tabIds[targetTabIdIndex].length - 2, 0, ..._draggedTabIds);
                }
                // Creating new subgroup from regular tabs
                else {
                    removeTabsFromSource(_draggedTabIds);
                    targetTabIdIndex = tabIds.findIndex(id => id === targetTabId || (Array.isArray(id) && id[0] === targetTabId));
                    tabIds[targetTabIdIndex] = [generateGroupId(), tabIds[targetTabIdIndex], ..._draggedTabIds, "New Group", true];
                }
            }
            columnState[columnIndex].tabIds = tabIds;
    
            const isOpenTabsList = draggedTabIds.some(id => id.startsWith('opentab-'));
            if (isOpenTabsList) {
                let updatedTabs = [];
                draggedTabIds.filter(draggedTabId => draggedTabId.startsWith('opentab-')).forEach(draggedTabId => {
                    const originalDraggedTabId = draggedTabId;
                    draggedTabId = draggedTabId.replace('opentab-', 'tab-');
                    const numericId = parseInt(draggedTabId.replace('tab-', ''));
                    chrome.tabs.get(numericId, (tab) => {
                        if (originalDraggedTabId.startsWith('opentab-')) {
                            const newTab = {
                                title: tab.title,
                                url: tab.url,
                                favIconUrl: tab.favIconUrl || '',
                                id: numericId,
                                color: '#FFFFFF'
                            };
                            updatedTabs.push(newTab);
                        }
                    });
                });
                chrome.storage.local.get('savedTabs', (data) => {
                    let existingTabs = data.savedTabs || [];
                    updatedTabs = existingTabs.concat(updatedTabs);
    
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        let activeTab = tabs[0];
                        _draggedTabIds.forEach(draggedTabId => {
                            const numericId = parseInt(draggedTabId.replace('tab-', ''));
                            chrome.tabs.remove(numericId, () => {
                                chrome.tabs.update(activeTab.id, { active: true });
                            });
                        });
    
                        chrome.storage.local.set({ columnState: columnState, savedTabs: updatedTabs }, () => {
                            //console.log('Updated storage with new tab:', updatedTabs);
                        });
                    });
                });
            }
            else {
                chrome.storage.local.set({ columnState }, () => {
                    //console.log('Updated column state with subgroup:', columnState);
                });
            }
    
        }
        return;
    }

    let earlyExit = false;
    itemsToProcess.forEach(item => {
        const columnId = column.id;
        let itemId = item.id;
 
        if (columnId !== 'open-tabs-list' && itemId.startsWith('opentab')) {
            itemId = itemId.replace('opentab-', 'tab-');
            item.id = itemId;
            itemIdsToSave.push(itemId);
        }
        else if (columnId === 'open-tabs-list' && itemId.startsWith('tab')) {
            window.open(item.dataset.url, '_blank');
            tabIdsToDelete.push(parseInt(itemId.replace('tab-', '')));
        }
        else if (columnId === 'open-tabs-list' && itemId.startsWith('group')) {
            const column = columnState.find(col => 
                col.tabIds.some(id => Array.isArray(id) && id[0] === itemId)
            );
        
            if (column) {
                const columnElement = document.getElementById(column.id);
                const subgroup = column.tabIds.find(id => Array.isArray(id) && id[0] === itemId);
        
                if (subgroup) {
                    openAllInColumn(columnElement, subgroup);
                    deleteSubgroup(itemId);
                    earlyExit = true;
                    return;
                }
            }
        }

        itemsToInsert.push({ item, dropPosition });

        //Rearranging tabs in open-tabs-list
        if (columnId === 'open-tabs-list' && itemId.startsWith('opentab')) {
            chrome.tabs.move(parseInt(itemId.split('-')[1]), { index: dropPosition }, () => {
                //console.log('Tab moved:', itemId, 'to index:', dropPosition);
            });
        }
    });
    if(earlyExit) return;

    itemsToInsert.forEach(({ item, dropPosition }) => {
        if (dropPosition === tabItems.length) {
            column.appendChild(item);
        } else {
            column.insertBefore(item, tabItems[dropPosition]);
        }
    });
    if (itemIdsToSave.length > 0) {
        saveTab(itemIdsToSave);
    }
    if (tabIdsToDelete.length > 0) {
        deleteTab(tabIdsToDelete);
    }
    if (itemIdsToSave.length === 0 && tabIdsToDelete.length === 0) {
        saveColumnState();
    }

    if(isMinimized){
        const updatedTabs = column.querySelectorAll('.tab-item');
        updatedTabs.forEach(tabItem => {
            tabItem.style.display = "none";
        });
    }
}
function handleDragEnd(event) {
    stopScrollAnimation();
    document.querySelectorAll('.tab-item.dragging').forEach(item => {
        item.classList.remove("dragging");
    });
    event.target.closest('.column')?.classList.remove("dragging");
    if (deletionArea){
        deletionArea.style.display = 'none';
        deletionArea.classList.remove('deletion-area-active');
    } 
    if (newColumnIndicator){
        newColumnIndicator.style.display = 'none';
        newColumnIndicator.classList.remove('new-column-indicator-active');
    } 
    if (dropIndicator) dropIndicator.style.display = 'none';
    document.querySelectorAll('.tab-item').forEach(item => {
        item.style.outline = 'none';
    });
}

/* Display Helper Functions */
function toggleSubgroupExpandedState(expandButton) {
    const isExpanded = expandButton.classList.toggle('expanded');
    const faviconsContainer = expandButton.closest('.tab-group-container').querySelector('.favicons-container');
    const expandedContainer = expandButton.closest('.tab-group-container').querySelector('.expanded-tabs');

    // Update button appearance
    expandButton.innerHTML = isExpanded 
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up"><path d="m18 15-6-6-6 6"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;

    if (isExpanded) {
        faviconsContainer.style.display = 'none';
        expandedContainer.style.display = 'flex';
    } else {
        faviconsContainer.style.display = 'flex';
        expandedContainer.style.display = 'none';
    }
    return isExpanded;
}
function createDraggableListItem(options = {}) {
    const {
        id,
        isSubgroup = false,
        classes = []
    } = options;

    const li = document.createElement("li");
    li.classList.add("tab-item", ...classes);
    if (isSubgroup) {
        li.classList.add("subgroup-item");
    }
    li.draggable = true;
    li.id = id;
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragend", handleDragEnd);

    return li;
}
function getColorClass(color) {
    switch (color) {
        case '#FFFFFF':
            return 'default-color';
        case '#ffc4c4':
        case '#f7c2d6':
            return 'tab-pink';
        case '#fffdc4':
        case '#f9ffc4':
            return 'tab-yellow';
        case '#b0e5ff':
        case '#c6e2e9':
            return 'tab-blue';
        case '#ebc4ff':
        case '#e9c8fa':
            return 'tab-purple';
        default:
            return 'default-color';
    }
}
function createTabItem(tab){
    const li = createDraggableListItem({
        id: `tab-${tab.id}`
    });
    li.dataset.url = tab.url;

    let colorClass = tab.color;
    if (!colorOptions.includes(colorClass)) {
        colorClass = getColorClass(tab.color);
    }
    li.classList.add(colorClass);

    // Calculate the formatted date when displaying
    const { formattedDate, dateDisplayColor } = calculateFormattedDate(tab.parsedDate);
    li.innerHTML += `
        <div class="tab-info-container">
            <div class="tab-info-left">
                <img src="${tab.favIconUrl}">
            </div>
            <div class="tab-info-right">
                <span class="tab-title" data-url="${tab.url}" id="title-display-${tab.id}">${tab.title}</span>
                <input type="text" class="hidden" id="title-input-${tab.id}" value="${tab.title}">
                <div class="note-display fixed-width" id="note-display-${tab.id}">${tab.note ? tab.note.replace(/\\/g, '').replace(/\n/g, '<br>') : ''}</div>
                <textarea class="tab-note hidden" id="note-input-${tab.id}">${tab.note ? tab.note.replace(/<br>/g, '\n') : ''}</textarea>
                <div class="date-display ${formattedDate ? '' : 'hidden'}" id="date-display-${tab.id}">${formattedDate || ''}</div>
            </div>
            <div class="tab-actions">
                <button class="more-options" data-index="${tab.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" class="main-grid-item-icon" fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>                
                </button>
            </div>
        </div>
    `;

    const dateDisplay = li.querySelector(`#date-display-${tab.id}`);
    dateDisplay.style.backgroundColor = dateDisplayColor;

    const favicon = li.querySelector(".tab-info-left");
    favicon.addEventListener("click", (event) => handleFaviconClick(li, event));

    const tabLink = li.querySelector('.tab-title');
    tabLink.addEventListener('click', () => {
        window.location.href = tabLink.dataset.url;
    });
    
    const moreOptionsButton = li.querySelector('.more-options');
    moreOptionsButton.addEventListener('click', (event) => {
        event.stopPropagation();

        const selectedItems = document.querySelectorAll('.selected');
        selectedItems.forEach(item => {
            item.classList.remove('selected');
        });
    
        if (activeOptionsMenu && activeOptionsMenu.dataset.tabId === tab.id.toString()) {
            closeAllMenus();
            return;
        }
        closeAllMenus();
    
        const noteButtonText = tab.note && tab.note.trim() !== '' ? 'Edit Note' : 'Add Note';
        const menuItems = [
            { text: "Rename", action: () => { renameTab(tab, li); closeAllMenus() } },            
            { text: noteButtonText, action: () => { editTabNote(tab, li); closeAllMenus() } },
            { text: "Clear Date", action: () => { removeDate(tab, dateDisplay); closeAllMenus() }, hidden: !formattedDate },
            { text: "Color", action: () => openColorMenu(tab, moreOptionsButton) },
            { text: "Delete", action: () => deleteTab(tab.id, null, li) }
        ];
    
        activeOptionsMenu = createMenuDropdown(menuItems, moreOptionsButton);
        activeOptionsMenu.dataset.tabId = tab.id.toString();
    });
    
    const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
    const noteInput = li.querySelector(`#note-input-${tab.id}`);
    
    noteDisplay.addEventListener("click", function () {
        editTabNote(tab, li);
    });
    
    noteInput.addEventListener("blur", function () {
        const note = noteInput.value;
        saveTabNote(tab.id, note);
        noteDisplay.innerHTML = note ? note.replace(/\\/g, '').replace(/\n/g, '<br>') : '';
        noteInput.classList.add("hidden");
        noteDisplay.classList.remove("hidden");
        li.addEventListener('dragstart', handleDragStart);
    });

    noteInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
            noteInput.blur();
        }
        else if (event.key === "Enter" && event.shiftKey) {
            const start = noteInput.selectionStart;
            const end = noteInput.selectionEnd;
            noteInput.value = noteInput.value.substring(0, start) + "\n" + noteInput.value.substring(end);
            noteInput.selectionStart = noteInput.selectionEnd = start + 1;
            event.preventDefault();
        }
    });

    noteInput.addEventListener("input", function () {
        noteInput.style.height = "auto";
        noteInput.style.height = (noteInput.scrollHeight) + "px";

        const note = noteInput.value;
        // Update the date display in real-time
        const dateDisplay = li.querySelector(`#date-display-${tab.id}`);
        const chrono = new Chrono();
        const parsedNote = note.replace(/\\\w+/g, '');
        const parsedDate = chrono.parseDate(parsedNote);
        if (parsedDate) {
            const { formattedDate, dateDisplayColor } = calculateFormattedDate(parsedDate);
            dateDisplay.textContent = formattedDate;
            dateDisplay.classList.remove('hidden');
            dateDisplay.style.backgroundColor = dateDisplayColor;
        } 
        else if(formattedDate) {
            dateDisplay.textContent = formattedDate;
            dateDisplay.classList.remove('hidden');
            dateDisplay.style.backgroundColor = dateDisplayColor;
        }
        else {
            dateDisplay.classList.add('hidden');
        }
    });

    return li;
}
function createColumn(title, id, minimized = false, emoji = null) {
    const columnsContainer = document.getElementById("columns-container");
    const column = document.createElement("div");
    column.classList.add("column");
    if (minimized) column.classList.add("minimized");
    if (id) {
        column.id = id;
    } else {
        column.id = `column-${Date.now()}`;
    }

    column.draggable = true;
    column.addEventListener('dragstart', handleColumnDragStart);
    column.addEventListener('dragend', handleDragEnd);

    // Create a container for the title and buttons
    const headerContainer = document.createElement("div");
    headerContainer.classList.add("header-container");

    // Add minimize button to the column
    const minimizeButton = document.createElement("button");
    minimizeButton.classList.add("minimize-column");
    minimizeButton.title = "Minimize Column";
    minimizeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-to-line"> <path d="M3 19V5"/><path d="m13 6-6 6 6 6"/><path d="M7 12h14"/></svg>`;    
    minimizeButton.addEventListener("click", () => {
        minimizeColumn(column);
        chrome.storage.local.set({ columnState: saveColumnState(true), animation: {columnId: column.id, minimized: true} }, () => {
            //console.log(`${column.id} minimized`);
        });
    });

    // Add maximize button to the column
    const maximizeButton = document.createElement("button");
    maximizeButton.classList.add("maximize-column");
    maximizeButton.title = "Maximize Column";
    maximizeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-maximize-2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`;
    maximizeButton.addEventListener("click", () => {
        maximizeColumn(column);
        chrome.storage.local.set({ columnState: saveColumnState(true), animation: {columnId: column.id, minimized: false} }, () => {
            //console.log(`${column.id} maximized`);
        });
    });

    // Add title input to the column
    const { titleGroup } = createEditableTitle({
        initialText: title,
        groupClass: 'title-group',
        inputClass: 'column-title-input',
        spanClass: 'column-title-text',
        container: 'h2',
        defaultText: 'New Column',
        onSave: (value) => {
            column.dataset.title = value;
            saveColumnState();
        }
    });

    // Create three-dot menu container
    const menuContainer = document.createElement("div");
    menuContainer.classList.add("menu-container");
    
    // Create three-dot menu button
    const menuButton = document.createElement("button");
    menuButton.classList.add("more-options");
    menuButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>`;
    menuContainer.appendChild(menuButton);
    menuButton.addEventListener("click", (e) => {
        e.stopPropagation();

        const selectedItems = document.querySelectorAll('.selected');
        selectedItems.forEach(item => {
            item.classList.remove('selected');
        });

        if(activeColumnMenu && activeColumnMenu.dataset.columnId === column.id){
            closeAllMenus();
            return;
        }
        closeAllMenus();

        const menuItems = [
            { text: "Open All", action: () => openAllInColumn(column) },
            { text: "Delete Column", action: () => deleteColumn(column) }
        ];
        
        activeColumnMenu = createMenuDropdown(menuItems, menuButton);
        activeColumnMenu.dataset.columnId = column.id;
    });

    // Create emoji button and span
    const emojiButton = document.createElement("button");
    emojiButton.classList.add("emoji-button");
    emojiButton.textContent = emoji || getRandomEmoji();
    column.dataset.emoji = emojiButton.textContent;

    // Create and configure the emoji picker element
    const emojiPicker = document.createElement('emoji-picker');
    emojiPicker.classList.add('emoji-picker-on-top', theme);
    emojiPicker.style.display = 'none';
    emojiPicker.addEventListener('emoji-click', (event) => {
        const newEmoji = event.detail.unicode;
        emojiButton.textContent = newEmoji;
        column.dataset.emoji = newEmoji;
        emojiPicker.style.display = 'none';
        saveColumnState();
    });

    // Toggle emoji picker when clicking the emoji button
    emojiButton.addEventListener('click', () => {
        // Hide all other pickers
        const allPickers = document.querySelectorAll('.emoji-picker-on-top');
        allPickers.forEach(picker => {
            if (picker !== emojiPicker) {
                picker.style.display = 'none';
            }
        });
        
        if (emojiPicker.style.display === 'none') {
            const rect = emojiButton.getBoundingClientRect();
            emojiPicker.style.top = `${rect.bottom + 4}px`;
            emojiPicker.style.left = `${rect.left}px`;
            emojiPicker.style.display = 'block';
        } 
        else {
            emojiPicker.style.display = 'none';
        }
    });

    headerContainer.appendChild(minimizeButton);
    headerContainer.appendChild(maximizeButton);
    titleGroup.insertBefore(emojiPicker, titleGroup.firstChild);
    titleGroup.insertBefore(emojiButton, titleGroup.firstChild);
    headerContainer.appendChild(titleGroup);
    headerContainer.appendChild(menuContainer);

    // Append header container to the column
    column.appendChild(headerContainer);
    columnsContainer.appendChild(column);

    return column;
}
function createEditableTitle(options = {}) {
    const {
        initialText = '',
        groupClass = '',
        inputClass = '',
        spanClass = '',
        onSave = () => {},
        defaultText = 'New Title',
        container = 'span' // h2 or span
    } = options;

    const titleGroup = document.createElement("div");
    titleGroup.classList.add(groupClass);

    const titleSpan = document.createElement(container);
    titleSpan.classList.add(spanClass);
    titleSpan.textContent = initialText || defaultText;
    
    const titleInput = document.createElement("input");
    titleInput.type = "text"; 
    titleInput.classList.add(inputClass);
    titleInput.style.display = "none";

    // Switch to edit mode
    titleSpan.addEventListener("click", () => {
        titleInput.value = titleSpan.textContent;
        titleInput.style.display = "inline";
        titleSpan.style.display = "none";
        titleInput.focus();
        const length = titleInput.value.length;
        titleInput.setSelectionRange(length, length);
        const column = titleSpan.closest('.column');
        column.draggable = false;
        if(groupClass === 'subgroup-title-group'){
            const subgroup = titleSpan.closest('.subgroup-item');
            subgroup.draggable = false;
        }
    });

    // Switch back to display mode
    titleInput.addEventListener("blur", () => {
        const column = titleInput.closest('.column');
        column.draggable = true;
        if(groupClass === 'subgroup-title-group'){
            const subgroup = titleSpan.closest('.subgroup-item');
            subgroup.draggable = true;
        }
        const trimmedValue = titleInput.value.trim();
        titleSpan.textContent = trimmedValue || defaultText;
        titleInput.style.display = "none";
        titleSpan.style.display = "inline";
        onSave(trimmedValue);
    });

    // Save on Enter
    titleInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            titleInput.blur();
        }
    });

    titleGroup.appendChild(titleInput);
    titleGroup.appendChild(titleSpan);

    return {
        titleGroup,
        titleInput,
        titleSpan
    };
}
function handleFaviconClick(li, event) {
    event.stopPropagation();
    closeAllMenus();
    const draggedItems = document.querySelectorAll('.selected');
    const allItems = Array.from(document.querySelectorAll('li'));
    const currentIndex = allItems.indexOf(li);

    if (event.ctrlKey || event.metaKey) {
        // Toggle selection with Ctrl/Cmd click
        li.classList.toggle('selected');
    } else if (event.shiftKey && lastSelectedIndex !== null) {
        // Select range with Shift click
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        for (let i = start; i <= end; i++) {
            allItems[i].classList.add('selected');
        }
    } else {
        // Single selection
        if (draggedItems.length === 1 && draggedItems[0] === li) {
            // Clear selection if the only selected item is clicked again
            li.classList.remove('selected');
        } else {
            draggedItems.forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
        }
    }

    lastSelectedIndex = currentIndex;
}

/* Tab Display */
function displaySavedTabs(tabs) {
    const columnsContainer = document.getElementById("columns-container");
    const mainContent = document.getElementById("main-content");
    mainContent.addEventListener('dragover', handleDragOver);
    mainContent.addEventListener('drop', handleDrop);
    columnsContainer.innerHTML = "";

    chrome.storage.local.get('columnState', (result) => {
        const columnState = result.columnState || [];
        columnState.forEach(columnData => {
            const column = createColumn(columnData.title, columnData.id, columnData.minimized, columnData.emoji);
            columnData.tabIds.forEach(tabId => {
                if(Array.isArray(tabId)){
                    const li = createDraggableListItem({
                        id: tabId[0],
                        isSubgroup: true
                    });

                    const tabGroupContainer = document.createElement("div");
                    tabGroupContainer.classList.add("tab-group-container");
                    
                    const tabInfoContainer = document.createElement("div");
                    tabInfoContainer.classList.add("tab-info-container");
                    
                    const faviconsContainer = document.createElement("div");
                    faviconsContainer.classList.add("favicons-container");

                    const expandedContainer = document.createElement('div');
                    expandedContainer.classList.add('expanded-tabs');
                    expandedContainer.style.display = 'none';
                
                    // Create title elements
                    const { titleGroup } = createEditableTitle({
                        initialText: tabId[tabId.length - 2],
                        groupClass: 'subgroup-title-group',
                        inputClass: 'subgroup-title',
                        spanClass: 'subgroup-title-text',
                        defaultText: 'New Group',
                        onSave: () => saveColumnState()
                    });
                    tabGroupContainer.appendChild(titleGroup);

                    const subgroupTabActions = document.createElement("div");
                    subgroupTabActions.classList.add("subgroup-tab-actions");

                    const expandButton = document.createElement("button");
                    expandButton.classList.add("expand-button");
                    expandButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;
                    subgroupTabActions.appendChild(expandButton);
                
                    tabId.forEach((subTabId, index) => {
                        // Skip the first element which is the groupId and the last element which is the title
                        if (index === 0 || index === tabId.length - 2 || index === tabId.length - 1) return;
                    
                        const tab = tabs.find(t => `${t.id}` === subTabId.split('-')[1]);
                        if (tab) {
                            const faviconWrapper = document.createElement("div");
                            faviconWrapper.classList.add("favicon-wrapper");
                            let colorClass = tab.color;
                            if (!colorOptions.includes(colorClass)) {
                                colorClass = getColorClass(tab.color);
                            }
                            faviconWrapper.classList.add(colorClass);
                            
                            const favicon = document.createElement("img");
                            favicon.src = tab.favIconUrl;
                            favicon.id = `tab-${tab.id}`;
                            favicon.classList.add("subgroup-favicon");
                            favicon.dataset.url = tab.url;
                            
                            const title = document.createElement("div");
                            title.classList.add("favicon-title");
                            title.textContent = tab.title;
                            title.title = tab.title;
                
                            faviconWrapper.appendChild(favicon);
                            faviconWrapper.appendChild(title);
                            faviconWrapper.addEventListener("click", () => {
                                window.location.href = tab.url;
                            });
                            faviconsContainer.appendChild(faviconWrapper);
                        }
                    });

                    const allFaviconWrappers = faviconsContainer.querySelectorAll('.favicon-wrapper');
                    allFaviconWrappers.forEach(wrapper => {
                        const favicon = wrapper.querySelector('.subgroup-favicon');
                        const tabId = parseInt(favicon.id.split('-')[1]);
                        const tab = tabs.find(t => t.id === tabId);
                        
                        const expandedTab = createTabItem(tab);
                        expandedContainer.appendChild(expandedTab);
                    });

                    const moreOptionsButton = document.createElement('button');
                    moreOptionsButton.classList.add('more-options');
                    moreOptionsButton.innerHTML = `
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                    `;
                    subgroupTabActions.appendChild(moreOptionsButton);

                    moreOptionsButton.addEventListener('click', (event) => {
                        event.stopPropagation();

                        const selectedItems = document.querySelectorAll('.selected');
                        selectedItems.forEach(item => {
                            item.classList.remove('selected');
                        });
                    
                        if (activeOptionsMenu && activeOptionsMenu.dataset.tabId === tabId[0]) {
                            closeAllMenus();
                            return;
                        }
                        closeAllMenus();
                    
                        const menuItems = [
                            { text: "Open All", action: () => { openAllInColumn(column, tabId); closeAllMenus(); } },
                            { text: "Ungroup", action: () => { ungroupSubgroup(tabId[0]); closeAllMenus(); } },
                            { text: "Delete", action: () => { deleteSubgroup(tabId[0]); closeAllMenus(); } }
                        ];
                    
                        activeOptionsMenu = createMenuDropdown(menuItems, moreOptionsButton);
                        activeOptionsMenu.dataset.tabId = tabId[0];
                    });

                    titleGroup.appendChild(subgroupTabActions);
                    tabInfoContainer.appendChild(faviconsContainer);
                    tabInfoContainer.appendChild(expandedContainer);
                    tabGroupContainer.appendChild(tabInfoContainer);
                    li.appendChild(tabGroupContainer);                
                    column.appendChild(li);

                    expandButton.addEventListener('click', () => {
                        toggleSubgroupExpandedState(expandButton);
                        saveColumnState();
                    });                        
                    if (tabId[tabId.length - 1]) {
                        toggleSubgroupExpandedState(expandButton);
                    }

                    return;
                }
                const tab = tabs.find(t => `${t.id}` === tabId.split('-')[1]);
                if (tab) {
                    const li = createTabItem(tab);
                    column.appendChild(li);
                }
            });
            if(columnData.minimized) {
                minimizeColumn(column);
            }
        });
        newColumnIndicator = document.createElement('div');
        newColumnIndicator.classList.add('new-column-indicator');
        const newColumnIcon = document.createElement('div');
        newColumnIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" x2="12" y1="11" y2="17" />
            <line x1="9" x2="15" y1="14" y2="14" />
            </svg>
        `;
        newColumnIcon.classList.add('new-column-icon');
        newColumnIndicator.appendChild(newColumnIcon);
        newColumnIndicator.addEventListener('dragleave', (event) => {
            if (!newColumnIndicator.contains(event.relatedTarget)) {
                newColumnIndicator.classList.remove('new-column-indicator-active');
            }
        });
        columnsContainer.appendChild(newColumnIndicator);
    });
}
function fetchOpenTabs() {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const excludedPrefixes = [
            'chrome://',
            'edge://',
            'opera://',
            'vivaldi://',
            'brave://',
            'moz-extension://',
            'about:',
            'file://'
        ];      
        tabs = tabs.filter(tab => 
            !excludedPrefixes.some(prefix => tab.url.startsWith(prefix))
        );
        const openTabsList = document.getElementById("open-tabs-list");
        openTabsList.addEventListener('dragover', handleDragOver);
        openTabsList.addEventListener('drop', handleDrop);
        openTabsList.innerHTML = "";

        tabs.forEach((tab, index) => {
            const li = createDraggableListItem({
                id: `opentab-${tab.id}`
            });

            li.innerHTML += `
                <div class="tab-info-container">
                    <div class="tab-info-left">
                        <img src="${tab.favIconUrl}">
                    </div>
                    <div class="tab-info-right">
                        <span class="tab-title">${tab.title}</span>
                    </div>
                    <div class="tab-actions">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" class="close-button" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                            <line x1="18" x2="6" y1="6" y2="18" />
                            <line x1="6" x2="18" y1="6" y2="18" />
                        </svg>
                    </div>
                </div>
            `;
            
            const closeButton = li.querySelector(".close-button");
            closeButton.addEventListener("click", () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    let activeTab = tabs[0];
                    
                    chrome.tabs.remove(tab.id, () => {
                        chrome.tabs.update(activeTab.id, { active: true });
                    });
                });
            });

            li.setAttribute("data-tab-id", tab.id);
            li.setAttribute("data-index", index);

            const favicon = li.querySelector(".tab-info-left");
            favicon.addEventListener("click", (event) => handleFaviconClick(li, event));

            // Add click event listener to switch to the tab
            const tabTitle = li.querySelector(".tab-title");
            tabTitle.addEventListener("click", () => {
                const allItems = document.querySelectorAll('li');
                allItems.forEach(item => item.classList.remove('selected'));
                chrome.tabs.update(tab.id, { active: true });
            });

            openTabsList.appendChild(li);
        });
    });
}

chrome.tabs.onUpdated.addListener(fetchOpenTabs);
chrome.tabs.onRemoved.addListener(() => {
    if(userBrowser === 'firefox'){
        setTimeout(fetchOpenTabs, 150);
    }
    else{
        fetchOpenTabs();
    }
});
chrome.tabs.onMoved.addListener(fetchOpenTabs);
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.savedTabs || changes.columnState) {
        console.log("Changes detected", changes);
        if(changes.savedTabs){
            tabs_in_storage = changes.savedTabs.newValue.filter(tab => !('temp' in tab));
        }
        if(changes.columnState && changes.animation){
            const column = document.getElementById(changes.animation.newValue.columnId);
            if(changes.animation.newValue.minimized === true){
                minimizeColumn(column);
            }
            else{
                maximizeColumn(column);
            }
            return;
        }
        displaySavedTabs(tabs_in_storage);
    }
    else if (changes.bgTabs) {
        const oldBgTabs = changes.bgTabs.oldValue || [];
        const newBgTabs = changes.bgTabs.newValue || [];

        //Check if bgTabs has changed
        if (JSON.stringify(oldBgTabs) !== JSON.stringify(newBgTabs)) {
            chrome.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
                let columnState = data.columnState || [];
                const bgTabs = data.bgTabs || [];
                let savedTabs = data.savedTabs || [];
                const tabIds = bgTabs.map(tab => tab.id);
    
                if (columnState.length === 0) {
                    columnState.push({ id: "defaultColumn", tabIds: [], title: "New Column" });
                }
                const firstColumn = columnState[0];
                const formattedIds = tabIds.map(id => `tab-${id}`);
                firstColumn.tabIds = firstColumn.tabIds.concat(formattedIds);
                savedTabs = savedTabs.concat(bgTabs);
    
                chrome.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
                    console.log("Migrated bgTabs");
                });
            });
        }
    }
    else if (changes.sidebarCollapsed) {
        if(changes.sidebarCollapsed.newValue) {
            document.getElementById('sidebar').classList.add('collapsed');
        } 
        else {
            document.getElementById('sidebar').classList.remove('collapsed');
        }
    }
});
fetchOpenTabs();

chrome.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
    let columnState = data.columnState || [];
    const bgTabs = data.bgTabs || [];
    let savedTabs = data.savedTabs || [];

    if(bgTabs.length > 0) {
        const tabIds = bgTabs.map(tab => tab.id);
        if (columnState.length === 0) {
            columnState.push({ id: "defaultColumn", tabIds: [], title: "New Column", emoji: getRandomEmoji() });
        }
        const firstColumn = columnState[0];
        const formattedIds = tabIds.map(id => `tab-${id}`);
        firstColumn.tabIds = firstColumn.tabIds.concat(formattedIds);
        savedTabs = savedTabs.concat(bgTabs);
    }

    savedTabs = savedTabs.filter(tab => !('temp' in tab));
    savedTabs.push({"temp": Date.now()});

    chrome.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
        //console.log("Migrated bgTabs");
    });
});

document.querySelector('.minimize-sidebar').addEventListener('click', () => {
    chrome.storage.local.set({ sidebarCollapsed: true }, () => {
        //console.log("Sidebar collapsed state saved");
    });
});
document.querySelector('.maximize-sidebar').addEventListener('click', () => {
    chrome.storage.local.set({ sidebarCollapsed: false }, () => {
        //console.log("Sidebar expanded state saved");
    });
});

document.addEventListener('dragover', function(event) {
    event.preventDefault();
});
const handleClickOutside = (e) => {
    const clickedButton = e.target.closest('.more-options, .menu-option, .settings-button');
    const isMoreOptionsButton = clickedButton !== null;

    const allItems = Array.from(document.querySelectorAll('li')).filter(item => !item.classList.contains('subgroup-item'));
    const isClickInside = allItems.some(item => item.contains(e.target));

    if (!isMoreOptionsButton) {
        closeAllMenus();
    }
    if (!isClickInside) {
        allItems.forEach(item => item.classList.remove('selected'));
    }

    const emojiPickers = document.querySelectorAll('emoji-picker');
    const emojiButtons = document.querySelectorAll('.emoji-button');
    const isEmojiClick = Array.from(emojiButtons).some(btn => btn.contains(e.target)) || 
                        Array.from(emojiPickers).some(picker => picker.contains(e.target));
    if (!isEmojiClick) {
        emojiPickers.forEach(picker => picker.style.display = 'none');
    }
};
document.addEventListener('click', handleClickOutside);

chrome.storage.local.get(['release', 'whatsNewClicked'], (data) => {
    const release = chrome.runtime.getManifest().version;
    const previousRelease = data.release;
    let whatsNewClicked = data.whatsNewClicked || false;

    if (previousRelease !== release) {
        const notification = document.createElement('div');
        notification.classList.add('notification-circle');
        settingsButton.appendChild(notification);
        whatsNewClicked = false;
        chrome.storage.local.set({ whatsNewClicked: false });
    }

    settingsButton.addEventListener('click', () => {
        if (activeSettingsMenu) {
            closeAllMenus();
            return;
        }
        closeAllMenus();

        const settingsNotification = document.querySelector('.notification-circle:not(.inline-notification)');
        if (settingsNotification) {
            settingsNotification.remove();
            chrome.storage.local.set({ release: release });
        }

        let releaseNotesNotification = document.querySelector('.inline-notification');

        const menuItems = [
            { text: theme === 'dark' ? "Toggle Light Theme" : "Toggle Dark Theme", action: () => { toggleTheme(); closeAllMenus() } },
            { text: "What's New", action: () => { 
                if (releaseNotesNotification) {
                    releaseNotesNotification.remove();
                }
                window.open('https://tabsmagic.com/releasenotes', '_blank');
                closeAllMenus();
                whatsNewClicked = true;
                chrome.storage.local.set({ whatsNewClicked: true });
            }},
            { text: "Feedback", action: () => { window.open('https://tabsmagic.com/contact', '_blank'); closeAllMenus() } },
        ];
        activeSettingsMenu = createMenuDropdown(menuItems, settingsButton);

        if (!whatsNewClicked) {
            const releaseNotesMenuItem = activeSettingsMenu.querySelector('button:nth-child(2)');
            releaseNotesNotification = document.createElement('div');
            releaseNotesNotification.classList.add('notification-circle', 'inline-notification');
            releaseNotesMenuItem.insertBefore(releaseNotesNotification, releaseNotesMenuItem.firstChild);
        }
    });
});