import { Chrono } from 'chrono-node';
import { createStateStorageService } from './src/application/state-storage.mjs';
import { createDataTransferService } from './src/application/data-transfer.mjs';
import { createOpenTabsService } from './src/application/open-tabs-service.mjs';
import { createReleaseService } from './src/application/release-service.mjs';
import { createSettingsService, nextTheme } from './src/application/settings-service.mjs';
import { createBrowserApiFromGlobal } from './src/infrastructure/browser-api.mjs';
import { createTabsRepository } from './src/infrastructure/tabs-repository.mjs';
import { faviconServiceUrl } from './src/domain/browser-tabs.mjs';
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
import { createDragController } from './src/ui/controllers/drag-controller.mjs';
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
const browserApi = createBrowserApiFromGlobal(globalThis);
const tabsRepository = createTabsRepository(browserApi);
const openTabs = createOpenTabsService({
    tabs: tabsRepository,
    idFactory: generateUniqueId
});
const settings = createSettingsService({ storage: browserApi.storage.local });
const dataTransfer = createDataTransferService({
    storage: browserApi.storage.local,
    idFactory: generateUniqueId
});
const releaseNotes = createReleaseService({
    storage: browserApi.storage.local,
    runtime: browserApi.runtime
});
let theme = 'light';
settings.load().then(stored => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('no-transition');
    if (stored.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
    }
    if (stored.storedTheme) {
        theme = stored.storedTheme;
        document.body.className = theme;
    }

    setTimeout(() => {
        sidebar.classList.remove('no-transition');
    }, 100);
}).catch(error => {
    console.error('Error updating sidebar:', error);
});
function toggleTheme(){
    theme = nextTheme(theme);
    document.body.className = theme;
    const emojiPickers = document.querySelectorAll('.emoji-picker-on-top');
    emojiPickers.forEach(picker => {
        picker.className = picker.className.replace(/light|dark/g, theme);
    });
    settings.saveTheme(theme).catch(error => {
        console.error('Could not save the theme:', error);
    });
}
const CHROME_STRING = 'chrome';
const settingsButton = document.querySelector('.settings-button');
const columnsContainer = document.getElementById('columns-container');
const colorOptions = ['tab-default', 'tab-pink', 'tab-yellow', 'tab-blue', 'tab-purple'];
let deletionArea;
let newColumnIndicator = null;
const appState = createStateStore();
const stateStorage = createStateStorageService({
    storage: browserApi.storage.local,
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
const dragController = createDragController(document, {
    columnsContainer,
    getDeletionArea: () => deletionArea,
    getNewColumnIndicator: () => newColumnIndicator,
    onDragStart: () => closeAllMenus()
});
function handleDragStart(event) {
    dragController.handleTabDragStart(event);
}
function handleColumnDragStart(event) {
    dragController.handleColumnDragStart(event);
}
function handleDragEnd(event) {
    dragController.handleDragEnd(event);
}
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
document.documentElement.dataset.browser = userBrowser;

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
    // Browsers without tab groups simply open the tabs; the repository decides.
    const groupTitle = subgroup
        ? (Array.isArray(subgroup) ? subgroup[subgroup.length - 2] : subgroup.title)
        : column.querySelector('.column-title-text')?.textContent;
    openTabs.openUrls(urls, { index: dropPosition, groupTitle }).catch(error => {
        console.error('Could not open saved tabs:', error);
    });
}

/* Column Functions */
function minimizeColumn(column) {
    setColumnMinimized(column, true);
}
function maximizeColumn(column) {
    setColumnMinimized(column, false);
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
    const capturedTabs = (await openTabs.capture(
        openElements.map(element => Number(element.id.slice('opentab-'.length)))
    )).map((capture, index) => ({ ...capture, element: openElements[index] }));

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
        await openTabs.close(capturedTabs.map(captured => captured.browserTabId));
    }
}

async function deleteDroppedItems(items) {
    let nextState = appState.getState();
    const browserTabIds = [];
    items.forEach(item => {
        if (item.id.startsWith('opentab-')) {
            browserTabIds.push(Number(item.id.slice('opentab-'.length)));
        } else if (item.classList.contains('subgroup-item')) {
            nextState = removeGroup(nextState, item.id, { deleteTabs: true });
        } else if (item.id.startsWith('tab-')) {
            nextState = removeTabs(nextState, item.id.slice('tab-'.length));
        }
    });
    if (nextState !== appState.getState()) persistCanonicalState(nextState);
    if (browserTabIds.length > 0) await openTabs.close(browserTabIds);
}

/** Reopen dropped items as browser tabs, in the order they were dropped. */
async function reopenDroppedItems(items, index) {
    let nextState = appState.getState();
    let browserIndex = index;
    for (const item of items) {
        if (item.id.startsWith('opentab-')) {
            await openTabs.move(Number(item.id.slice('opentab-'.length)), browserIndex);
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
            await openTabs.openInBackground(item.dataset.url, browserIndex);
            nextState = removeTabs(nextState, item.id.slice('tab-'.length));
        }
        browserIndex += 1;
    }
    if (nextState !== appState.getState()) persistCanonicalState(nextState);
}

/** Apply a drop the drag controller has already interpreted. */
async function applyDropDescriptor(descriptor) {
    switch (descriptor.type) {
        case 'delete-column':
            deleteColumn(descriptor.column);
            return;
        case 'move-column':
            persistCanonicalState(
                moveColumn(appState.getState(), descriptor.column.id, descriptor.index),
                { includeTabs: false }
            );
            return;
        case 'delete-items':
            await deleteDroppedItems(descriptor.items);
            return;
        case 'new-column': {
            const columnId = `column-${Date.now()}`;
            const nextState = addColumn(appState.getState(), {
                id: columnId,
                title: 'New Column',
                minimized: false,
                emoji: getRandomEmoji(),
                items: []
            });
            await persistItemsDrop(descriptor.items, {
                type: 'column',
                columnId,
                index: 0
            }, nextState);
            return;
        }
        case 'open-tabs':
            await reopenDroppedItems(descriptor.items, descriptor.index);
            return;
        case 'group':
            await persistItemsDrop(descriptor.items, {
                type: 'group',
                groupId: descriptor.groupId,
                index: descriptor.index
            });
            return;
        case 'item':
            await persistItemsDrop(descriptor.items, {
                type: 'item',
                item: descriptor.item
            });
            return;
        case 'column':
            await persistItemsDrop(descriptor.items, {
                type: 'column',
                columnId: descriptor.columnId,
                index: descriptor.index
            });
            return;
    }
}

async function handleDrop(event) {
    event.preventDefault();
    const descriptor = dragController.resolveDrop(event);
    if (descriptor) await applyDropDescriptor(descriptor);
}

/* Display Helper Functions */
function getFaviconUrl(tabUrl) {
    const faviconUrl = faviconServiceUrl(tabUrl);
    if (!faviconUrl) console.error("Invalid favicon URL:", tabUrl);
    return faviconUrl;
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
    openTabs.list().then((tabs) => {
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
                openTabs.closeKeepingFocus(tab.id).catch(error => {
                    console.error('Could not close the open tab:', error);
                });
            });

            li.setAttribute("data-tab-id", tab.id);
            li.setAttribute("data-index", index);

            tabInfoLeft.addEventListener("click", (event) => handleFaviconClick(li, event));

            // Add click event listener to switch to the tab
            tabTitle.addEventListener("click", () => {
                const allItems = document.querySelectorAll('li');
                allItems.forEach(item => item.classList.remove('selected'));
                openTabs.activate(tab.id).catch(error => {
                    console.error('Could not switch to the open tab:', error);
                });
            });

            openTabsList.appendChild(li);
        });
    }).catch(error => {
        console.error('Could not read the open tabs:', error);
    });
}

// Firefox reports removals before the window settles, so it refreshes later.
openTabs.onChanged(fetchOpenTabs, {
    removalDelay: userBrowser === 'firefox' ? 150 : 0
});
browserApi.storage.onChanged.addListener(async changes => {
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

    const sidebarChange = settings.readSidebarChange(changes);
    if (sidebarChange) {
        document.getElementById('sidebar')
            .classList.toggle('collapsed', sidebarChange.sidebarCollapsed);
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

function setSidebarCollapsed(collapsed) {
    settings.saveSidebarCollapsed(collapsed).then(() => {
        document.querySelectorAll('#open-tabs-list .tab-item').forEach(tab => {
            tab.classList.toggle('collapsed', collapsed);
        });
    }).catch(error => {
        console.error('Could not save the sidebar state:', error);
    });
}
document.querySelector('.minimize-sidebar').addEventListener('click', () => {
    setSidebarCollapsed(true);
});
document.querySelector('.maximize-sidebar').addEventListener('click', () => {
    setSidebarCollapsed(false);
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

    const emojiPickers = document.querySelectorAll('.emoji-picker-on-top');
    const emojiButtons = document.querySelectorAll('.emoji-button');
    const isEmojiClick = Array.from(emojiButtons).some(btn => btn.contains(e.target)) || 
                        Array.from(emojiPickers).some(picker => picker.contains(e.target));
    if (!isEmojiClick) {
        emojiPickers.forEach(picker => picker.style.display = 'none');
    }
};
document.addEventListener('click', handleClickOutside);
document.addEventListener('drop', handleDrop);
document.addEventListener('dragover', event => dragController.handleDragOver(event));

releaseNotes.load().then((releaseState) => {
    let whatsNewClicked = releaseState.whatsNewClicked;

    if (releaseState.isNewRelease) {
        const notification = document.createElement('div');
        notification.classList.add('notification-circle');
        settingsButton.appendChild(notification);
    }

    settingsButton.addEventListener('click', () => {
        if (menuController.isOpen('settings', 'settings')) {
            closeAllMenus();
            return;
        }

        const settingsNotification = document.querySelector('.notification-circle:not(.inline-notification)');
        if (settingsNotification) {
            settingsNotification.remove();
            releaseNotes.acknowledgeRelease().catch(error => {
                console.error('Could not save the installed release:', error);
            });
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
                openSettingsPage('https://tabsmagic.com/releasenotes');
                closeAllMenus();
                whatsNewClicked = true;
                releaseNotes.markWhatsNewClicked().catch(error => {
                    console.error('Could not save the release notes state:', error);
                });
            }},
            { text: "Feedback", action: () => { openSettingsPage('https://tabsmagic.com/contact'); closeAllMenus() } }
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
}).catch(error => {
    console.error('Could not read the installed release:', error);
});

function openSettingsPage(url) {
    openTabs.openPage(url).catch(error => {
        console.error('Could not open the page:', error);
    });
}

function downloadExport(exported) {
    const blob = new Blob([exported.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exported.filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

function exportAllData() {
    dataTransfer.createExport()
        .then(downloadExport)
        .catch(error => {
            console.error('Export failed:', error);
        });
}

function reportImportFailure(error) {
    console.error('Import failed:', error);
    if (error.rollbackError) {
        console.error('Import rollback failed:', error.rollbackError);
        alert(`Import failed and automatic rollback also failed. Your pre-import backup may still be available in extension storage.\n\n${error.message}`);
        return;
    }
    const stateMessage = error.rolledBack
        ? 'The attempted changes were rolled back.'
        : 'No imported data was written.';
    alert(`Import failed. ${stateMessage}\n\n${error.message}`);
}

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
                const result = await dataTransfer.importFromText(e.target.result);

                if (!result.imported) {
                    alert(`Import rejected:\n${result.errors.slice(0, 8).join('\n')}`);
                    return;
                }

                if (result.recovered > 0) {
                    console.log(`Recovered ${result.recovered} unreferenced imported tab(s)`);
                }
                location.reload();

            } catch (err) {
                reportImportFailure(err);
            }
        };
        reader.readAsText(file);
    });

    input.click();
}
