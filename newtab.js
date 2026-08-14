import { Chrono } from 'chrono-node';
import 'emoji-picker-element';
import { createStateStorageService } from './src/application/state-storage.mjs';
import { createDataTransferService } from './src/application/data-transfer.mjs';
import { createOpenTabsService } from './src/application/open-tabs-service.mjs';
import { createReleaseService } from './src/application/release-service.mjs';
import { createSettingsService, nextTheme } from './src/application/settings-service.mjs';
import { createBrowserApiFromGlobal } from './src/infrastructure/browser-api.mjs';
import { createTabsRepository } from './src/infrastructure/tabs-repository.mjs';
import {
    createStateStore,
    findGroup,
    getColumn,
    getColumnTabs,
    getGroupTabs,
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
    createColorMenu as renderColorMenu,
    createDeletionArea as renderDeletionArea,
    createMenuDropdown as renderMenuDropdown,
    createNotificationDot,
    setColumnMinimized
} from './src/ui/rendering.mjs';
import { createBoardView } from './src/ui/board-view.mjs';
import { createOpenTabsView } from './src/ui/open-tabs-view.mjs';
import {
    createTabPresenter,
    TAB_COLOR_CLASSES
} from './src/ui/tab-presentation.mjs';
import { createDragController } from './src/ui/controllers/drag-controller.mjs';
import { createMenuController } from './src/ui/controllers/menu-controller.mjs';
import { createSelectionController } from './src/ui/controllers/selection-controller.mjs';
import {
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
const colorOptions = TAB_COLOR_CLASSES;
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

const tabPresenter = createTabPresenter({ chrono: new Chrono() });
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
function saveTabNote(id, note) {
    const { parsedDate, remainingNote } = tabPresenter.parseNote(note);
    const changes = {
        note: textToLegacyStoredNote(remainingNote)
    };
    if (parsedDate) changes.parsedDate = parsedDate.getTime();
    persistCanonicalState(
        updateTab(appState.getState(), id, changes),
        { includeColumns: false }
    );
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
    menuController.toggle('color', 'color', () => renderColorMenu(document, {
        colors: colorOptions,
        button: moreOptionsButton,
        onSelect: color => {
            const nextState = tabIds.reduce(
                (state, tabId) => updateTab(state, tabId, { color }),
                appState.getState()
            );
            persistCanonicalState(nextState, { includeColumns: false });
            closeAllMenus();
        }
    }));
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
/** Only URLs the browser may navigate to are ever reopened. */
function navigableUrls(tabs) {
    return tabs.map(tab => safePageUrl(tab.url)).filter(Boolean);
}

function openSavedTabs(tabs, groupTitle, index = null) {
    const urls = navigableUrls(tabs);
    if (urls.length === 0) return;
    // Browsers without tab groups simply open the tabs; the repository decides.
    openTabs.openUrls(urls, { index, groupTitle }).catch(error => {
        console.error('Could not open saved tabs:', error);
    });
}

function openAllInColumn(columnId) {
    closeAllMenus();
    const state = appState.getState();
    const column = getColumn(state, columnId);
    if (!column) return;
    openSavedTabs(getColumnTabs(state, columnId), column.title);
}

function openAllInGroup(groupId, index = null) {
    closeAllMenus();
    const state = appState.getState();
    const { group } = findGroup(state, groupId);
    if (!group) return;
    openSavedTabs(getGroupTabs(state, groupId), group.title, index);
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
            const { group } = findGroup(nextState, item.id);
            if (group) {
                openAllInGroup(group.id, browserIndex);
                browserIndex += group.tabIds.length;
                nextState = removeGroup(nextState, group.id, { deleteTabs: true });
                continue;
            }
        } else if (item.id.startsWith('tab-')) {
            const tabId = item.id.slice('tab-'.length);
            const [url] = navigableUrls([getTab(nextState, tabId)].filter(Boolean));
            if (url) await openTabs.openInBackground(url, browserIndex);
            nextState = removeTabs(nextState, tabId);
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

/* Tab Display */
function handleFaviconClick(li, event) {
    closeAllMenus();
    selectionController.handleItemClick(li, event);
}
const boardView = createBoardView(document, {
    container: columnsContainer,
    presenter: tabPresenter,
    getTheme: () => theme,
    nextFallbackEmoji: getRandomEmoji,
    handlers: {
        onTabDragStart: handleDragStart,
        onColumnDragStart: handleColumnDragStart,
        onDragEnd: handleDragEnd,
        onTabSelect: handleFaviconClick,
        onTabMenu: openTabMenu,
        onColumnMenu: openColumnMenu,
        onGroupMenu: openGroupMenu,
        onNoteSave: (tab, note) => saveTabNote(tab.id, note),
        onTitleSave: (tab, title) => persistCanonicalState(
            updateTab(appState.getState(), tab.id, { title }),
            { includeColumns: false }
        ),
        onColumnRename: (column, value) => persistCanonicalState(
            updateColumn(appState.getState(), column.id, {
                title: value || 'New Column'
            }),
            { includeTabs: false }
        ),
        onColumnMinimizedChange: (column, minimized) => persistCanonicalState(
            updateColumn(appState.getState(), column.id, { minimized }),
            {
                includeTabs: false,
                extra: { animation: { columnId: column.id, minimized } }
            }
        ),
        onColumnEmojiChange: (column, emoji) => persistCanonicalState(
            updateColumn(appState.getState(), column.id, { emoji }),
            { includeTabs: false }
        ),
        onGroupRename: (group, value) => persistCanonicalState(
            updateGroup(appState.getState(), group.id, {
                title: value || 'New Group'
            }),
            { includeTabs: false }
        ),
        onGroupExpandedChange: (group, expanded) => persistCanonicalState(
            updateGroup(appState.getState(), group.id, { expanded }),
            { includeTabs: false }
        )
    }
});

function openTabMenu(context) {
    const { tab, item, dateDisplay, moreOptionsButton, formattedDate } = context;
    const selectedItems = document.querySelectorAll('.selected');
    const isCurrentTabSelected = item.classList.contains('selected');

    // Only clear the selection when opening an unselected tab's menu.
    if (!isCurrentTabSelected) selectionController.clear();

    let menuItems;
    if (selectedItems.length > 1 && isCurrentTabSelected) {
        // A multi-selection only offers the actions that apply to every tab.
        const selectedTabIds = Array.from(selectedItems).map(selected =>
            selected.id.slice('tab-'.length)
        );
        const hasDate = selectedTabIds.some(tabId => {
            const selectedTab = getTab(appState.getState(), tabId);
            return selectedTab && selectedTab.parsedDate;
        });

        menuItems = [
            { text: "Clear Date", action: () => { removeDate(selectedTabIds, dateDisplay); closeAllMenus() }, hidden: !hasDate },
            { text: "Color", action: () => openColorMenu(selectedTabIds, moreOptionsButton) },
            { text: "Delete", action: () => deleteTab(selectedTabIds) }
        ];
    } else {
        const noteButtonText = tab.note && tab.note.trim() !== '' ? 'Edit Note' : 'Add Note';
        menuItems = [
            { text: "Rename", action: () => { boardView.beginTitleEdit(item); closeAllMenus() } },
            { text: noteButtonText, action: () => { boardView.beginNoteEdit(item); closeAllMenus() } },
            { text: "Clear Date", action: () => { removeDate(tab.id, dateDisplay); closeAllMenus() }, hidden: !formattedDate },
            { text: "Color", action: () => openColorMenu(tab.id, moreOptionsButton) },
            { text: "Delete", action: () => deleteTab(tab.id) }
        ];
    }
    menuController.toggle('options', tab.id, () =>
        createMenuDropdown(menuItems, moreOptionsButton)
    );
}

function openColumnMenu({ column, menuButton }) {
    selectionController.clear();

    const menuItems = [
        { text: "Open All", action: () => openAllInColumn(column.id) },
        { text: "Delete Column", action: () => deleteColumn(column) }
    ];
    menuController.toggle('column', column.id, () =>
        createMenuDropdown(menuItems, menuButton)
    );
}

function openGroupMenu({ group, moreOptionsButton }) {
    selectionController.clear();

    const menuItems = [
        { text: "Open All", action: () => { openAllInGroup(group.id); closeAllMenus(); } },
        { text: "Ungroup", action: () => { ungroupSubgroup(group.id); closeAllMenus(); } },
        { text: "Delete", action: () => { deleteSubgroup(group.id); closeAllMenus(); } }
    ];
    menuController.toggle('options', group.id, () =>
        createMenuDropdown(menuItems, moreOptionsButton)
    );
}

function displaySavedTabs(state) {
    newColumnIndicator = boardView.render(state);
}
const openTabsView = createOpenTabsView(document, {
    list: document.getElementById('open-tabs-list'),
    sidebar: document.getElementById('sidebar'),
    presenter: tabPresenter,
    handlers: {
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
        onSelect: handleFaviconClick,
        onClose: tab => {
            openTabs.closeKeepingFocus(tab.id).catch(error => {
                console.error('Could not close the open tab:', error);
            });
        },
        onActivate: tab => {
            selectionController.clear();
            openTabs.activate(tab.id).catch(error => {
                console.error('Could not switch to the open tab:', error);
            });
        }
    }
});

function fetchOpenTabs() {
    openTabs.list()
        .then(tabs => openTabsView.render(tabs))
        .catch(error => {
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
        settingsButton.appendChild(createNotificationDot(document));
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
                releaseNotesNotification = createNotificationDot(document, { inline: true });
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
