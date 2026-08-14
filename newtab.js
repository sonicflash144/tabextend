import { Chrono } from 'chrono-node';
import 'emoji-picker-element';
import {
    CURRENT_EXPORT_FORMAT_VERSION,
    prepareImportData
} from './src/compatibility/legacy-data.mjs';
import { createStateStorageService } from './src/application/state-storage.mjs';
import { importStorageSafely } from './src/infrastructure/import-transaction.mjs';
import { createChromeApiAdapters } from './src/infrastructure/chrome-api.mjs';
import {
    createStateStore,
    getTab
} from './src/domain/state.mjs';
import {
    addColumn,
    addTabs,
    moveColumn,
    removeColumn,
    removeGroup,
    removeTabs,
    ungroup,
    updateColumn,
    updateGroup,
    updateTab
} from './src/domain/operations.mjs';
import { applyDrop } from './src/domain/drop-operations.mjs';
import {
    createDeletionArea as renderDeletionArea,
    createMenuDropdown as renderMenuDropdown,
    createColumnView,
    createNewColumnIndicator,
    createOpenTabView,
    createSavedTabView,
    createSubgroupPreview,
    createSubgroupView,
    getColorClass,
    setColumnMinimized,
    setSubgroupExpanded
} from './src/ui/rendering.mjs';
import { createEditableTitleController } from './src/ui/controllers/editable-title-controller.mjs';
import { createMenuController } from './src/ui/controllers/menu-controller.mjs';
import { createSelectionController } from './src/ui/controllers/selection-controller.mjs';
import {
    legacyNoteToDisplayText,
    legacyNoteToEditableText,
    safeImageUrl,
    safePageUrl,
    textToLegacyStoredNote
} from './src/security/content.mjs';
const chrome = createChromeApiAdapters(globalThis.chrome);
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
const CHROME_STRING = 'chrome';
const settingsButton = document.querySelector('.settings-button');
const columnsContainer = document.getElementById('columns-container');
const colorOptions = ['tab-default', 'tab-pink', 'tab-yellow', 'tab-blue', 'tab-purple'];
let dropIndicator = null;
let dropType = null;
let deletionArea;
let newColumnIndicator = null;
const appState = createStateStore();
const stateStorage = createStateStorageService({
    storage: chrome.storage.local,
    stateStore: appState,
    idFactory: generateUniqueId,
    createDefaultColumn: () => ({
        id: 'defaultColumn',
        title: 'New Column',
        minimized: false,
        emoji: getRandomEmoji(),
        items: []
    })
});
const menuController = createMenuController();
const selectionController = createSelectionController(document);

function persistCanonicalState(nextState, options = {}) {
    stateStorage.persist(nextState, options).catch(error => {
        console.error('Could not persist canonical state:', error);
    });
    return nextState;
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

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
    const nextState = addColumn(appState.getState(), {
        id: `column-${Date.now()}`,
        title: 'New Column',
        minimized: false,
        emoji: getRandomEmoji(),
        items: []
    });
    persistCanonicalState(nextState, { includeTabs: false });
});

deletionArea = renderDeletionArea(document);
function closeAllMenus() {
    menuController.closeAll();
}
function getBrowser() {
    let userAgent = navigator.userAgent.toLowerCase();
    if(userAgent.indexOf(CHROME_STRING) > -1){
        userAgent = CHROME_STRING;
    }
    else if (userAgent.indexOf('firefox') > -1) {
        userAgent = 'firefox';
    }
    else if (userAgent.indexOf('safari') > -1) {
        userAgent = 'safari';
    }
    else {
        userAgent = CHROME_STRING;
    }
    return userAgent;
}
const userBrowser = getBrowser();

/* Tab and Subgroup Functions */
function deleteTab(id) {
    const tabIds = Array.isArray(id) ? id : [id];
    persistCanonicalState(removeTabs(appState.getState(), tabIds));
}
function deleteSubgroup(groupId) {
    persistCanonicalState(removeGroup(appState.getState(), groupId, { deleteTabs: true }));
}
function ungroupSubgroup(groupId) {
    persistCanonicalState(ungroup(appState.getState(), groupId));
}

/* Tab Menu Actions */
function createMenuDropdown(menuItems, button) {
    return renderMenuDropdown(document, menuItems, button);
}
function renameTab(tab, li) {
    li.removeEventListener('dragstart', handleDragStart);
    li.draggable = false;
    const column = li.closest('.column');
    column.draggable = false;
    const subgroup = li.closest('.subgroup-item');
    if (subgroup) subgroup.draggable = false;

    const titleDisplay = li.querySelector('.tab-title');
    const titleInput = li.querySelector('.tab-info-right input[type="text"]');

    // Store original value for cancel functionality (Escape key)
    const originalTitle = titleInput.value;

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
        else if (event.key === 'Escape') {
            // Restore original value to cancel the edit
            titleInput.value = originalTitle;
            titleInput.blur();
            titleInput.removeEventListener('keydown', handleKeydown);
        }
    });

    titleInput.addEventListener("blur", function () {
        const newTitle = titleInput.value;
        li.draggable = true;
        column.draggable = true;
        if (subgroup) subgroup.draggable = true;
        titleDisplay.textContent = newTitle;
        titleInput.classList.add("hidden");
        titleDisplay.classList.remove("hidden");
        li.addEventListener('dragstart', handleDragStart);
        persistCanonicalState(
            updateTab(appState.getState(), tab.id, { title: newTitle }),
            { includeColumns: false }
        );
    });
}
function editTabNote(tab, li) {
    li.removeEventListener('dragstart', handleDragStart);
    const noteDisplay = li.querySelector('.note-display');
    const noteInput = li.querySelector('.tab-note');
    const column = li.closest('.column');
    const subgroup = li.closest('.subgroup-item');

    // Store original value for cancel functionality (Escape key)
    noteInput.dataset.originalValue = noteInput.value;

    li.draggable = false;
    column.draggable = false;
    if (subgroup) subgroup.draggable = false;
    noteInput.classList.remove("hidden");
    noteDisplay.classList.add("hidden");
    noteInput.focus();
    noteInput.style.height = "auto";
    noteInput.style.height = (noteInput.scrollHeight) + "px";

    const length = noteInput.value.length;
    noteInput.setSelectionRange(length, length);
}
function saveTabNote(id, note) {
    const { parsedDate, remainingNote } = parseAndSaveDate(note);
    const changes = {
        note: textToLegacyStoredNote(remainingNote)
    };
    if (parsedDate) changes.parsedDate = parsedDate.getTime();
    persistCanonicalState(
        updateTab(appState.getState(), id, changes),
        { includeColumns: false }
    );
}
function calculateFormattedDate(parsedDate) {
    if (!parsedDate) {
        return { formattedDate: '', dateDisplayColor: '#e63c30' };
    }

    parsedDate = new Date(parsedDate);
    const diffDays = getToday(parsedDate);
    let formattedDate;
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
    const today = new Date();
    const parsedDate = chrono.parseDate(parsedNote, today, { forwardDate: true });
    const detectedDateText = parsedDate ? chrono.parse(note)[0].text : '';
    
    // Remove the parsed date from the note
    const remainingNote = parsedDate ? note.replace(detectedDateText, '').trim() : note;
    return { parsedDate, remainingNote, detectedDateText };
}
function removeDate(tabIds, dateDisplay) {
    if (!Array.isArray(tabIds)) tabIds = [tabIds];
    const nextState = tabIds.reduce(
        (state, tabId) => updateTab(state, tabId, { parsedDate: null }),
        appState.getState()
    );
    dateDisplay.textContent = '';
    dateDisplay.classList.add('hidden');
    persistCanonicalState(nextState, { includeColumns: false });
}
function openColorMenu(tabIds, moreOptionsButton) {
    if (!Array.isArray(tabIds)) tabIds = [tabIds];
    menuController.toggle('color', 'color', () => {
        const colorMenu = document.createElement('div');
        colorMenu.classList.add('color-menu');
        colorOptions.forEach(color => {
            const colorOption = document.createElement('div');
            colorOption.classList.add('color-option', color);
            colorOption.addEventListener('click', () => {
                const nextState = tabIds.reduce(
                    (state, tabId) => updateTab(state, tabId, { color }),
                    appState.getState()
                );
                persistCanonicalState(nextState, { includeColumns: false });
                closeAllMenus();
            });
            colorMenu.appendChild(colorOption);
        });
        document.body.appendChild(colorMenu);
        const rect = moreOptionsButton.getBoundingClientRect();
        colorMenu.style.top = `${rect.bottom + 5}px`;
        colorMenu.style.right = `${window.innerWidth - rect.right}px`;
        return colorMenu;
    });
}
/* Column Menu Actions */
function deleteColumn(event) {
    closeAllMenus();
    let column = event;
    if(event instanceof Event){
        column = event.target.closest(".column");
    }
    persistCanonicalState(removeColumn(appState.getState(), column.id, { deleteTabs: true }));
}
function openAllInColumn(column, subgroup = null, dropPosition = null) {
    closeAllMenus();
    let urls;
    if (subgroup) {
        const subgroupId = Array.isArray(subgroup) ? subgroup[0] : subgroup.id;
        const subgroupElement = document.getElementById(subgroupId);
        const favicons = subgroupElement && column.contains(subgroupElement)
            ? Array.from(subgroupElement.querySelectorAll('.subgroup-favicon'))
            : [];
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
    urls = urls.filter(Boolean);
    if (urls.length === 0) return;
    if(userBrowser !== CHROME_STRING){
        urls.forEach((url, i) => {
            const createProperties = { url: url, active: false };
            if (dropPosition !== null) {
                createProperties.index = dropPosition + i;
            }
            chrome.tabs.create(createProperties);
        });   
    }
    else{
        // Open all tabs
        const createTabs = urls.map((url, i) => 
            new Promise(resolve => {
                const createProperties = { url: url, active: false };
                if (dropPosition !== null) {
                    createProperties.index = dropPosition + i;
                }
                chrome.tabs.create(createProperties, resolve);
            })
        );
        // After all tabs are created, group them
        Promise.all(createTabs).then(tabs => {
            const tabIds = tabs.map(tab => tab.id); // Extract tab IDs
            chrome.tabs.group({ tabIds: tabIds }, groupId => {
                // Set the title of the group
                let title;
                if(subgroup){
                    title = Array.isArray(subgroup)
                        ? subgroup[subgroup.length - 2]
                        : subgroup.title;
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
function minimizeColumn(column) {
    setColumnMinimized(column, true);
}
function maximizeColumn(column) {
    setColumnMinimized(column, false);
}

/* Tab Drag and Drop */
function handleDragStart(event) {
    // Don't initiate tab drag if dragging from an input/textarea (e.g., text selection)
    if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
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
    // Don't initiate column drag if dragging from an input/textarea (e.g., text selection)
    if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    
    const column = event.target.closest('.column');
    if(!column) return;
    
    // Don't initiate drag if the column is in edit mode (draggable is false)
    if (!column.draggable) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    closeAllMenus();
    if (event.target.closest('.tab-item')) {
        event.preventDefault();
        return;
    }

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
    const sidebar = document.getElementById('sidebar');
    const sidebarRect = sidebar.getBoundingClientRect();
    const sidebarCheck = event.target.closest('#sidebar');
    const openTabsList = document.getElementById('open-tabs-list');
    const spaceContainer = document.getElementById('space-container');
    const spaceContainerRect = spaceContainer.getBoundingClientRect();
    const spaceContainerLeft = spaceContainerRect.left;
    const spaceContainerRight = spaceContainerRect.right;
    const containerScrollTop = sidebarCheck ? sidebar.scrollTop : columnsContainer.scrollTop;

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
        let element;
        if(sidebarCheck){
            element = openTabsList;
        }
        else if(column){
            element = column;
        }
        else{
            dropIndicator.style.display = 'none';
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
        if(sidebarCheck){
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

        if (dropPosition === columns.length) {
            const lastColumn = columns[columns.length - 1];
            indicatorLeft = lastColumn ? lastColumn.getBoundingClientRect().right : containerRect.left;
        } else {
            const targetColumn = columns[dropPosition];
            indicatorLeft = targetColumn.getBoundingClientRect().left;
        }

        // Keep the indicator within the visible column container.
        if (indicatorLeft < spaceContainerLeft) {
            indicatorLeft = spaceContainerLeft;
        }
        if (indicatorLeft > spaceContainerRight - width) {
            indicatorLeft = spaceContainerRight - width;
        }

        dropIndicator.style.width = `${width}px`;
        dropIndicator.style.height = `${height}px`;
        dropIndicator.style.left = `${indicatorLeft}px`;
        dropIndicator.style.top = `${containerRect.top + containerScrollTop}px`;
    }
}
function descriptorForSavedElement(element) {
    if (element.id.startsWith('tab-')) {
        return { type: 'tab', tabId: element.id.slice('tab-'.length) };
    }
    if (element.classList.contains('subgroup-item')) {
        return { type: 'group', groupId: element.id };
    }
    return null;
}

async function persistItemsDrop(elements, target, initialState = appState.getState()) {
    const openElements = elements.filter(element => element.id.startsWith('opentab-'));
    const capturedTabs = await Promise.all(openElements.map(async element => {
        const browserTabId = Number(element.id.slice('opentab-'.length));
        const tab = await chrome.tabs.get(browserTabId);
        const id = generateUniqueId();
        return {
            element,
            browserTabId,
            savedTab: {
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
                id,
                color: '#FFFFFF'
            }
        };
    }));

    let nextState = capturedTabs.length > 0
        ? addTabs(initialState, capturedTabs.map(captured => captured.savedTab))
        : initialState;
    const capturedByElement = new Map(
        capturedTabs.map(captured => [captured.element, captured.savedTab.id])
    );
    const dragged = elements.map(element => {
        if (capturedByElement.has(element)) {
            return { type: 'tab', tabId: capturedByElement.get(element) };
        }
        return descriptorForSavedElement(element);
    }).filter(Boolean);

    nextState = applyDrop(nextState, {
        dragged,
        target,
        groupIdFactory: () => `group-${generateUniqueId()}`
    });
    persistCanonicalState(nextState);

    if (capturedTabs.length > 0) {
        await chrome.tabs.remove(capturedTabs.map(captured => captured.browserTabId));
    }
}

function targetItemAtPointer(event, tabItems, draggedItems) {
    return tabItems.find(item => {
        if (item.closest('#open-tabs-list') || item.classList.contains('dragging') || item.closest('.expanded-tabs')) {
            return false;
        }
        const targetSubgroup = item.closest('.subgroup-item');
        if (targetSubgroup && draggedItems.some(tab => targetSubgroup.contains(tab))) {
            return false;
        }
        const itemRect = item.getBoundingClientRect();
        const itemHeight = itemRect.bottom - itemRect.top;
        const middleThirdTop = itemRect.top + itemHeight / 3;
        const middleThirdBottom = itemRect.bottom - itemHeight / 3;
        const fixedTop = itemRect.top + 32;
        const fixedBottom = itemRect.bottom - 32;
        return fixedBottom - fixedTop > middleThirdBottom - middleThirdTop
            ? event.clientY >= fixedTop && event.clientY <= fixedBottom
            : event.clientY >= middleThirdTop && event.clientY <= middleThirdBottom;
    });
}

async function handleDrop(event) {
    event.preventDefault();
    const eventDropData = event.dataTransfer.getData("text/plain");
    const droppedColumn = document.getElementById(eventDropData);
    if (droppedColumn && droppedColumn.classList.contains('column')) {
        if (deletionArea.contains(event.target)) {
            deleteColumn(droppedColumn);
            return;
        }
        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);
        persistCanonicalState(
            moveColumn(appState.getState(), droppedColumn.id, dropPosition),
            { includeTabs: false }
        );
        return;
    }

    const draggedItems = Array.from(document.querySelectorAll('.dragging'));
    const tabItem = draggedItems.find(item => item.id === eventDropData) ||
        Array.from(document.querySelectorAll('.tab-item')).find(item => item.id === eventDropData);
    if (!tabItem) return;
    const itemsToProcess = draggedItems.length > 1 ? draggedItems : [tabItem];

    if (deletionArea.contains(event.target)) {
        let nextState = appState.getState();
        const browserTabIds = [];
        itemsToProcess.forEach(item => {
            if (item.id.startsWith('opentab-')) {
                browserTabIds.push(Number(item.id.slice('opentab-'.length)));
            } else if (item.classList.contains('subgroup-item')) {
                nextState = removeGroup(nextState, item.id, { deleteTabs: true });
            } else if (item.id.startsWith('tab-')) {
                nextState = removeTabs(nextState, item.id.slice('tab-'.length));
            }
        });
        if (nextState !== appState.getState()) persistCanonicalState(nextState);
        if (browserTabIds.length > 0) await chrome.tabs.remove(browserTabIds);
        return;
    }

    if (newColumnIndicator.contains(event.target)) {
        const columnId = `column-${Date.now()}`;
        const nextState = addColumn(appState.getState(), {
            id: columnId,
            title: 'New Column',
            minimized: false,
            emoji: getRandomEmoji(),
            items: []
        });
        await persistItemsDrop(itemsToProcess, {
            type: 'column',
            columnId,
            index: 0
        }, nextState);
        return;
    }

    const columnElement = event.target.closest('.column');
    const sidebar = event.target.closest('#sidebar');
    const destination = columnElement || (sidebar && document.getElementById('open-tabs-list'));
    if (!destination) return;
    const isMinimized = destination.classList.contains('minimized');
    const tabItems = Array.from(destination.querySelectorAll('.tab-item'))
        .filter(item => !item.closest('.expanded-tabs'));
    const dropPosition = calculateDropPosition(event, tabItems, isMinimized);

    if (destination.id === 'open-tabs-list') {
        let nextState = appState.getState();
        let browserIndex = dropPosition;
        for (const item of itemsToProcess) {
            if (item.id.startsWith('opentab-')) {
                await chrome.tabs.move(Number(item.id.slice('opentab-'.length)), { index: browserIndex });
            } else if (item.classList.contains('subgroup-item')) {
                const sourceColumn = nextState.columns.find(column =>
                    column.items.some(candidate => candidate.type === 'group' && candidate.id === item.id)
                );
                const group = sourceColumn?.items.find(candidate =>
                    candidate.type === 'group' && candidate.id === item.id
                );
                if (sourceColumn && group) {
                    openAllInColumn(document.getElementById(sourceColumn.id), group, browserIndex);
                    browserIndex += group.tabIds.length;
                    nextState = removeGroup(nextState, group.id, { deleteTabs: true });
                    continue;
                }
            } else if (item.id.startsWith('tab-')) {
                await chrome.tabs.create({ url: item.dataset.url, active: false, index: browserIndex });
                nextState = removeTabs(nextState, item.id.slice('tab-'.length));
            }
            browserIndex += 1;
        }
        if (nextState !== appState.getState()) persistCanonicalState(nextState);
        return;
    }

    const firstSubgroup = itemsToProcess[0].closest('.subgroup-item');
    const allFromSameSubgroup = itemsToProcess.every(item => item.closest('.subgroup-item') === firstSubgroup);
    const draggedSubgroup = itemsToProcess.some(item => item.classList.contains('subgroup-item'));
    const targetSubgroup = event.target.closest('.subgroup-item');
    if (!draggedSubgroup && firstSubgroup && allFromSameSubgroup && targetSubgroup === firstSubgroup) {
        const subgroupItems = Array.from(firstSubgroup.querySelectorAll('.expanded-tabs .tab-item'));
        await persistItemsDrop(itemsToProcess, {
            type: 'group',
            groupId: firstSubgroup.id,
            index: calculateDropPosition(event, subgroupItems, false)
        });
        return;
    }

    const targetItem = targetItemAtPointer(event, tabItems, draggedItems);
    if (targetItem) {
        const itemTarget = targetItem.classList.contains('subgroup-item')
            ? { type: 'group', groupId: targetItem.id }
            : { type: 'tab', tabId: targetItem.id.slice('tab-'.length) };
        await persistItemsDrop(itemsToProcess, {
            type: 'item',
            item: itemTarget
        });
        return;
    }

    await persistItemsDrop(itemsToProcess, {
        type: 'column',
        columnId: destination.id,
        index: dropPosition
    });
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
function getFaviconUrl(tabUrl) {
    try {
        const url = new URL(tabUrl);
        return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    } catch (error) {
        console.error("Invalid favicon URL:", tabUrl, error);
        return '';
    }
}
function toggleSubgroupExpandedState(expandButton) {
    return setSubgroupExpanded(expandButton);
}
function createTabItem(tab){
    const navigableUrl = safePageUrl(tab.url);
    let colorClass = tab.color;
    if (!colorOptions.includes(colorClass)) {
        colorClass = getColorClass(tab.color);
    }
    const { formattedDate, dateDisplayColor } = calculateFormattedDate(tab.parsedDate);
    const {
        item: li,
        infoLeft: tabInfoLeft,
        noteDisplay,
        noteInput,
        dateDisplay,
        moreOptionsButton
    } = createSavedTabView(document, {
        tab,
        navigableUrl,
        faviconUrl: safeImageUrl(tab.favIconUrl),
        colorClass,
        formattedDate,
        dateDisplayColor,
        noteDisplayText: legacyNoteToDisplayText(tab.note),
        noteEditableText: legacyNoteToEditableText(tab.note),
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd
    });

    tabInfoLeft.addEventListener("click", (event) => handleFaviconClick(li, event));

    moreOptionsButton.addEventListener('click', (event) => {
        event.stopPropagation();
    
        const selectedItems = document.querySelectorAll('.selected');
        const isCurrentTabSelected = li.classList.contains('selected');
        
        // Only clear selection if clicking an unselected tab's menu
        if (!isCurrentTabSelected) selectionController.clear();

        let menuItems;
        // Show limited menu for multi-selection
        if (selectedItems.length > 1 && isCurrentTabSelected) {
            const selectedTabIds = Array.from(selectedItems).map(item =>
                item.id.slice('tab-'.length)
            );
            const hasDate = selectedTabIds.some(tabId => {
                const tab = getTab(appState.getState(), tabId);
                return tab && tab.parsedDate;
            });
        
            menuItems = [
                { text: "Clear Date", action: () => { removeDate(selectedTabIds, dateDisplay); closeAllMenus() }, hidden: !hasDate },
                { text: "Color", action: () => openColorMenu(selectedTabIds, moreOptionsButton) },
                { text: "Delete", action: () => deleteTab(selectedTabIds) }
            ];
        } else {
            // Show full menu for single item
            const noteButtonText = tab.note && tab.note.trim() !== '' ? 'Edit Note' : 'Add Note';
            menuItems = [
                { text: "Rename", action: () => { renameTab(tab, li); closeAllMenus() } },            
                { text: noteButtonText, action: () => { editTabNote(tab, li); closeAllMenus() } },
                { text: "Clear Date", action: () => { removeDate(tab.id, dateDisplay); closeAllMenus() }, hidden: !formattedDate },
                { text: "Color", action: () => openColorMenu(tab.id, moreOptionsButton) },
                { text: "Delete", action: () => deleteTab(tab.id) }
            ];
        }
        menuController.toggle('options', tab.id, () =>
            createMenuDropdown(menuItems, moreOptionsButton)
        );
    });
    
    noteDisplay.addEventListener("click", function () {
        editTabNote(tab, li);
    });
    
    noteInput.addEventListener("blur", function () {
        const note = noteInput.value;
        const column = li.closest('.column');
        const subgroup = li.closest('.subgroup-item');
        li.draggable = true;
        column.draggable = true;
        if (subgroup) subgroup.draggable = true;
        saveTabNote(tab.id, note);
        noteDisplay.textContent = legacyNoteToDisplayText(note);
        noteInput.classList.add("hidden");
        noteDisplay.classList.remove("hidden");
        li.addEventListener('dragstart', handleDragStart);
    });

    // Store original value for cancel functionality
    noteInput.dataset.originalValue = noteInput.value;

    noteInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
            noteInput.blur();
        }
        else if (event.key === "Escape") {
            // Restore original value to cancel the edit
            noteInput.value = noteInput.dataset.originalValue || '';
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
        const chrono = new Chrono();
        const parsedNote = note.replace(/\\\w+/g, '');
        const today = new Date();
        const parsedDate = chrono.parseDate(parsedNote, today, { forwardDate: true });
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
    const { titleGroup } = createEditableTitle({
        initialText: title,
        groupClass: 'title-group',
        inputClass: 'column-title-input',
        spanClass: 'column-title-text',
        container: 'h2',
        defaultText: 'New Column',
        onSave: (value) => {
            column.dataset.title = value;
            persistCanonicalState(
                updateColumn(appState.getState(), column.id, {
                    title: value || 'New Column'
                }),
                { includeTabs: false }
            );
        }
    });
    const columnId = id || `column-${Date.now()}`;
    const {
        column,
        minimizeButton,
        maximizeButton,
        menuButton,
        emojiButton,
        emojiPicker
    } = createColumnView(document, {
        id: columnId,
        minimized,
        emoji,
        theme,
        titleGroup,
        fallbackEmoji: getRandomEmoji(),
        onDragStart: handleColumnDragStart,
        onDragEnd: handleDragEnd
    });

    minimizeButton.addEventListener('click', () => {
        minimizeColumn(column);
        persistCanonicalState(
            updateColumn(appState.getState(), column.id, { minimized: true }),
            {
                includeTabs: false,
                extra: { animation: { columnId: column.id, minimized: true } }
            }
        );
    });
    maximizeButton.addEventListener('click', () => {
        maximizeColumn(column);
        persistCanonicalState(
            updateColumn(appState.getState(), column.id, { minimized: false }),
            {
                includeTabs: false,
                extra: { animation: { columnId: column.id, minimized: false } }
            }
        );
    });
    menuButton.addEventListener("click", (e) => {
        e.stopPropagation();

        selectionController.clear();

        const menuItems = [
            { text: "Open All", action: () => openAllInColumn(column) },
            { text: "Delete Column", action: () => deleteColumn(column) }
        ];
        menuController.toggle('column', column.id, () =>
            createMenuDropdown(menuItems, menuButton)
        );
    });
    emojiPicker.addEventListener('emoji-click', (event) => {
        const newEmoji = event.detail.unicode;
        emojiButton.textContent = newEmoji;
        column.dataset.emoji = newEmoji;
        emojiPicker.style.display = 'none';
        persistCanonicalState(
            updateColumn(appState.getState(), column.id, { emoji: newEmoji }),
            { includeTabs: false }
        );
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
    columnsContainer.appendChild(column);
    return column;
}
function createEditableTitle(options = {}) {
    return createEditableTitleController(document, options);
}
function handleFaviconClick(li, event) {
    closeAllMenus();
    selectionController.handleItemClick(li, event);
}

/* Tab Display */
function displaySavedTabs(state) {
    const columnsContainer = document.getElementById("columns-container");
    columnsContainer.replaceChildren();

    state.columns.forEach(columnData => {
            const column = createColumn(columnData.title, columnData.id, columnData.minimized, columnData.emoji);
            columnData.items.forEach(item => {
                if(item.type === 'group'){
                    const group = item;
                    const { titleGroup } = createEditableTitle({
                        initialText: group.title,
                        groupClass: 'subgroup-title-group',
                        inputClass: 'subgroup-title',
                        spanClass: 'subgroup-title-text',
                        defaultText: 'New Group',
                        onSave: value => persistCanonicalState(
                            updateGroup(appState.getState(), group.id, {
                                title: value || 'New Group'
                            }),
                            { includeTabs: false }
                        )
                    });
                    const {
                        item: li,
                        faviconsContainer,
                        expandedContainer,
                        expandButton,
                        moreOptionsButton
                    } = createSubgroupView(document, {
                        group,
                        titleGroup,
                        onDragStart: handleDragStart,
                        onDragEnd: handleDragEnd
                    });
                
                    group.tabIds.forEach(tabId => {
                        const tab = getTab(state, tabId);
                        if (tab) {
                            const navigableUrl = safePageUrl(tab.url);
                            let colorClass = tab.color;
                            if (!colorOptions.includes(colorClass)) {
                                colorClass = getColorClass(tab.color);
                            }
                            faviconsContainer.appendChild(createSubgroupPreview(document, {
                                tab,
                                navigableUrl,
                                faviconUrl: safeImageUrl(tab.favIconUrl),
                                colorClass
                            }));

                            const expandedTab = createTabItem(tab);
                            expandedContainer.appendChild(expandedTab);
                        }
                    });

                    moreOptionsButton.addEventListener('click', (event) => {
                        event.stopPropagation();

                        selectionController.clear();
                    
                        const menuItems = [
                            { text: "Open All", action: () => { openAllInColumn(column, group); closeAllMenus(); } },
                            { text: "Ungroup", action: () => { ungroupSubgroup(group.id); closeAllMenus(); } },
                            { text: "Delete", action: () => { deleteSubgroup(group.id); closeAllMenus(); } }
                        ];
                    
                        menuController.toggle('options', group.id, () =>
                            createMenuDropdown(menuItems, moreOptionsButton)
                        );
                    });

                    column.appendChild(li);

                    expandButton.addEventListener('click', () => {
                        const expanded = toggleSubgroupExpandedState(expandButton);
                        persistCanonicalState(
                            updateGroup(appState.getState(), group.id, { expanded }),
                            { includeTabs: false }
                        );
                    });                        
                    if (group.expanded) {
                        setSubgroupExpanded(expandButton, true);
                    }

                    return;
                }
                const tab = getTab(state, item.tabId);
                if (tab) {
                    const li = createTabItem(tab);
                    column.appendChild(li);
                }
            });
            if(columnData.minimized) {
                minimizeColumn(column);
            }
        });
        newColumnIndicator = createNewColumnIndicator(document);
        columnsContainer.appendChild(newColumnIndicator);
}
function fetchOpenTabs() {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const excludedPrefixes = [
            `${CHROME_STRING}://`,
            'edge://',
            'opera://',
            'vivaldi://',
            'brave://',
            'moz-extension://',
            'about:',
            'file://',
            'safari-web-extension://'
        ];      
        tabs = tabs.filter(tab => 
            (!excludedPrefixes.some(prefix => tab.url.startsWith(prefix))) && tab.url !== ""
        );
        const sidebar = document.getElementById('sidebar');
        const isCollapsed = sidebar.classList.contains('collapsed');
        const classes = ['tab-item'];
        if (isCollapsed) {
            classes.push('collapsed');
        }

        const openTabsList = document.getElementById("open-tabs-list");
        openTabsList.replaceChildren();

        tabs.forEach((tab, index) => {
            const {
                item: li,
                infoLeft: tabInfoLeft,
                title: tabTitle,
                closeButton
            } = createOpenTabView(document, {
                tab,
                classes,
                faviconUrl: safeImageUrl(tab.favIconUrl || getFaviconUrl(tab.url)),
                onDragStart: handleDragStart,
                onDragEnd: handleDragEnd
            });
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

            tabInfoLeft.addEventListener("click", (event) => handleFaviconClick(li, event));

            // Add click event listener to switch to the tab
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
chrome.storage.onChanged.addListener(async changes => {
    try {
        const synchronized = await stateStorage.synchronize(changes);
        if (synchronized?.type === 'state') {
            console.log("Changes detected", changes);
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
            displaySavedTabs(synchronized.state);
            return;
        }
        if (synchronized?.type === 'background-tabs') return;
    } catch (error) {
        console.error('Could not synchronize extension storage:', error);
        return;
    }

    if (changes.sidebarCollapsed) {
        if(changes.sidebarCollapsed.newValue) {
            document.getElementById('sidebar').classList.add('collapsed');
        } 
        else {
            document.getElementById('sidebar').classList.remove('collapsed');
        }
    }
});
fetchOpenTabs();

async function initializeStoredState() {
    try {
        const result = await stateStorage.initialize();
        if (result.migrated) {
            console.log("Migrated tab IDs to unique format");
        }
        if (result.recovered > 0) {
            console.log(`Recovered ${result.recovered} orphaned tab(s)`);
        }
        displaySavedTabs(result.state);
    } catch (error) {
        console.error('Could not initialize extension storage:', error);
    }
}

initializeStoredState();

document.querySelector('.minimize-sidebar').addEventListener('click', () => {
    chrome.storage.local.set({ sidebarCollapsed: true }, () => {
        //console.log("Sidebar collapsed state saved");
        document.querySelectorAll('#open-tabs-list .tab-item').forEach(tab => {
            tab.classList.add('collapsed');
        });
    });
});
document.querySelector('.maximize-sidebar').addEventListener('click', () => {
    chrome.storage.local.set({ sidebarCollapsed: false }, () => {
        //console.log("Sidebar expanded state saved");
        document.querySelectorAll('#open-tabs-list .tab-item').forEach(tab => {
            tab.classList.remove('collapsed');
        });
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
        selectionController.clear();
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
document.addEventListener('drop', handleDrop);
document.addEventListener('dragover', handleDragOver);

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
        if (menuController.isOpen('settings', 'settings')) {
            closeAllMenus();
            return;
        }

        const settingsNotification = document.querySelector('.notification-circle:not(.inline-notification)');
        if (settingsNotification) {
            settingsNotification.remove();
            chrome.storage.local.set({ release: release });
        }

        let releaseNotesNotification = document.querySelector('.inline-notification');

        const menuItems = [
            { text: theme === 'dark' ? "Toggle Light Theme" : "Toggle Dark Theme", action: () => { toggleTheme(); closeAllMenus() } },
            { text: "Export Data", action: () => { exportAllData(); closeAllMenus(); } },
            { text: "Import Data", action: () => { importAllData(); closeAllMenus(); } },
            { text: "What's New", action: () => { 
                if (releaseNotesNotification) {
                    releaseNotesNotification.remove();
                }
                chrome.tabs.create({ url: 'https://tabsmagic.com/releasenotes', active: true });
                closeAllMenus();
                whatsNewClicked = true;
                chrome.storage.local.set({ whatsNewClicked: true });
            }},
            { text: "Feedback", action: () => { chrome.tabs.create({ url: 'https://tabsmagic.com/contact', active: true }); closeAllMenus() } }
        ];
        const settingsMenu = menuController.open('settings', 'settings', () =>
            createMenuDropdown(menuItems, settingsButton)
        );

        if (!whatsNewClicked) {
            const whatsNewButton = Array
                .from(settingsMenu.querySelectorAll('button.menu-option'))
                .find(btn => btn.textContent.trim().startsWith("What's New"));

            if (whatsNewButton) {
                releaseNotesNotification = document.createElement('div');
                releaseNotesNotification.classList.add('notification-circle', 'inline-notification');
                whatsNewButton.insertBefore(releaseNotesNotification, whatsNewButton.firstChild);
            }
        }
    });
});

function exportAllData() {
    chrome.storage.local.get(null, (all) => {
        try {
            const exportedData = { ...all };
            delete exportedData.tabsMagicImportBackup;
            delete exportedData.animation;
            const payload = {
                formatVersion: CURRENT_EXPORT_FORMAT_VERSION,
                exportedAt: new Date().toISOString(),
                exportedData
            };
            const json = JSON.stringify(payload, null, 2);

            // Trigger download
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tabextend-export-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        } catch (e) {
            console.error('Export failed:', e);
        }
    });
}
const IMPORT_BACKUP_KEY = 'tabsMagicImportBackup';

const importStorageAdapter = chrome.storage.local;

function importAllData() {
    if (!confirm('Importing will overwrite existing data. Proceed?')) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const parsed = JSON.parse(text);
                const prepared = prepareImportData(parsed, {
                    idFactory: generateUniqueId,
                    now: () => Date.now()
                });

                if (!prepared.valid) {
                    alert(`Import rejected:\n${prepared.errors.slice(0, 8).join('\n')}`);
                    return;
                }

                await importStorageSafely({
                    storage: importStorageAdapter,
                    data: prepared.data,
                    backupKey: IMPORT_BACKUP_KEY,
                    now: () => new Date().toISOString()
                });

                if (prepared.recovered > 0) {
                    console.log(`Recovered ${prepared.recovered} unreferenced imported tab(s)`);
                }
                location.reload();

            } catch (err) {
                console.error('Import failed:', err);
                if (err.rollbackError) {
                    console.error('Import rollback failed:', err.rollbackError);
                    alert(`Import failed and automatic rollback also failed. Your pre-import backup may still be available in extension storage.\n\n${err.message}`);
                    return;
                }
                const stateMessage = err.rolledBack
                    ? 'The attempted changes were rolled back.'
                    : 'No imported data was written.';
                alert(`Import failed. ${stateMessage}\n\n${err.message}`);
            }
        };
        reader.readAsText(file);
    });

    input.click();
}
