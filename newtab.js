import { Chrono } from 'chrono-node';
import 'emoji-picker-element';
import { createStateStorageService } from './src/application/state-storage.mjs';
import { createDataTransferService } from './src/application/data-transfer.mjs';
import { createDropWorkflow } from './src/application/drop-workflow.mjs';
import { createOpenTabsService } from './src/application/open-tabs-service.mjs';
import { createReleaseService } from './src/application/release-service.mjs';
import { createSettingsService, nextTheme } from './src/application/settings-service.mjs';
import { createBrowserApiFromGlobal } from './src/infrastructure/browser-api.mjs';
import { createStateStore, getTab } from './src/domain/state.mjs';
import {
    addColumn,
    removeColumn,
    removeGroup,
    removeTabs,
    ungroup,
    updateColumn,
    updateGroup,
    updateTab,
    updateTabs
} from './src/domain/operations.mjs';
import { isFileUrl } from './src/domain/browser-tabs.mjs';
import {
    createDeletionArea as renderDeletionArea,
    setColumnMinimized
} from './src/ui/rendering.mjs';
import { createBoardView } from './src/ui/board-view.mjs';
import { createOpenFailureReporter } from './src/ui/open-failure.mjs';
import { createOpenTabsView } from './src/ui/open-tabs-view.mjs';
import { createTabPresenter, TAB_COLOR_CLASSES } from './src/ui/tab-presentation.mjs';
import { createBoardMenuController } from './src/ui/controllers/board-menu-controller.mjs';
import { createDragController } from './src/ui/controllers/drag-controller.mjs';
import { createMenuController } from './src/ui/controllers/menu-controller.mjs';
import { createSelectionController } from './src/ui/controllers/selection-controller.mjs';
import { createSettingsMenuController } from './src/ui/controllers/settings-menu-controller.mjs';
import { textToLegacyStoredNote } from './src/security/content.mjs';

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

const getRandomEmoji = () => {
    const range = [0x1f34f, 0x1f37f]; // Food and Drink
    const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    return String.fromCodePoint(codePoint);
};

function createNewColumn() {
    return {
        id: `column-${Date.now()}`,
        title: 'New Column',
        minimized: false,
        emoji: getRandomEmoji(),
        items: []
    };
}

function getBrowser() {
    let userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf('chrome') > -1) {
        userAgent = 'chrome';
    } else if (userAgent.indexOf('firefox') > -1) {
        userAgent = 'firefox';
    } else if (userAgent.indexOf('safari') > -1) {
        userAgent = 'safari';
    } else {
        userAgent = 'chrome';
    }
    return userAgent;
}

const browserApi = createBrowserApiFromGlobal(globalThis);
const openTabs = createOpenTabsService({
    browserApi,
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
const openFailures = createOpenFailureReporter({
    showAlert: message => alert(message),
    logError: (message, error) => console.error(message, error),
    canOpenFileUrls: browserApi.capabilities.fileUrlNavigation,
    hasFileUrlAccessSetting: browserApi.capabilities.fileUrlAccessSetting
});
const settingsButton = document.querySelector('.settings-button');
const columnsContainer = document.getElementById('columns-container');
const colorOptions = TAB_COLOR_CLASSES;
const userBrowser = getBrowser();
let theme = 'light';
let deletionArea;
let newColumnIndicator = null;
let boardMenus;
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
const tabPresenter = createTabPresenter({ chrono: new Chrono() });
const menuController = createMenuController();
const selectionController = createSelectionController(document);
const dropWorkflow = createDropWorkflow({
    stateStore: appState,
    persist: persistCanonicalState,
    tabs: openTabs,
    reportOpenFailure: (message, error, urls) => openFailures.report(message, error, urls),
    idFactory: generateUniqueId,
    createColumn: createNewColumn
});
const dragController = createDragController(document, {
    columnsContainer,
    getDeletionArea: () => deletionArea,
    getNewColumnIndicator: () => newColumnIndicator,
    onDragStart: () => closeAllMenus()
});

function persistCanonicalState(nextState, options = {}) {
    stateStorage.persist(nextState, options).catch(error => {
        console.error('Could not persist canonical state:', error);
    });
    return nextState;
}

function toggleTheme() {
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

function saveTabNote(id, note) {
    const { parsedDate, remainingNote } = tabPresenter.parseNote(note);
    const changes = {
        note: textToLegacyStoredNote(remainingNote)
    };
    if (parsedDate) changes.parsedDate = parsedDate.getTime();
    persistCanonicalState(updateTab(appState.getState(), id, changes), { includeColumns: false });
}
function openAllInColumn(columnId) {
    closeAllMenus();
    dropWorkflow.openAllInColumn(columnId);
}

/** Reopen a group, resolving with the entries the browser opened. */
function openAllInGroup(groupId, index = null) {
    closeAllMenus();
    return dropWorkflow.openAllInGroup(groupId, index);
}

/* Column Functions */
function minimizeColumn(column) {
    setColumnMinimized(column, true);
}
function maximizeColumn(column) {
    setColumnMinimized(column, false);
}

async function handleDrop(event) {
    event.preventDefault();
    const descriptor = dragController.resolveDrop(event);
    // One drop explains its refusals once, however many tabs it reopened.
    if (descriptor) await openFailures.batch(() => dropWorkflow.apply(descriptor));
}

/* Tab Display */
function handleFaviconClick(li, event) {
    closeAllMenus();
    selectionController.handleItemClick(li, event);
}

/**
 * An extension page may not navigate to a local file, so those links open
 * through the tabs API instead, in a new tab. Every other link keeps the
 * browser's own handling, including modifier clicks.
 */
function openTabLink(tab, url) {
    if (!isFileUrl(url)) return false;
    openTabs.openPage(url).catch(error => {
        openFailures.report('Could not open the local file:', error, [url]);
    });
    return true;
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
        onTabOpen: openTabLink,
        onTabMenu: context => boardMenus.openTabMenu(context),
        onColumnMenu: context => boardMenus.openColumnMenu(context),
        onGroupMenu: context => boardMenus.openGroupMenu(context),
        onNoteSave: (tab, note) => saveTabNote(tab.id, note),
        onTitleSave: (tab, title) =>
            persistCanonicalState(updateTab(appState.getState(), tab.id, { title }), {
                includeColumns: false
            }),
        onColumnRename: (column, value) =>
            persistCanonicalState(
                updateColumn(appState.getState(), column.id, {
                    title: value || 'New Column'
                }),
                { includeTabs: false }
            ),
        onColumnMinimizedChange: (column, minimized) =>
            persistCanonicalState(updateColumn(appState.getState(), column.id, { minimized }), {
                includeTabs: false,
                extra: { animation: { columnId: column.id, minimized } }
            }),
        onColumnEmojiChange: (column, emoji) =>
            persistCanonicalState(updateColumn(appState.getState(), column.id, { emoji }), {
                includeTabs: false
            }),
        onGroupRename: (group, value) =>
            persistCanonicalState(
                updateGroup(appState.getState(), group.id, {
                    title: value || 'New Group'
                }),
                { includeTabs: false }
            ),
        onGroupExpandedChange: (group, expanded) =>
            persistCanonicalState(updateGroup(appState.getState(), group.id, { expanded }), {
                includeTabs: false
            })
    }
});
boardMenus = createBoardMenuController(document, {
    menuController,
    selectionController,
    colors: colorOptions,
    getTab: tabId => getTab(appState.getState(), tabId),
    beginTitleEdit: boardView.beginTitleEdit,
    beginNoteEdit: boardView.beginNoteEdit,
    handlers: {
        onClearDates: tabIds => {
            const nextState = updateTabs(appState.getState(), tabIds, { parsedDate: null });
            persistCanonicalState(nextState, { includeColumns: false });
        },
        onColorChange: (tabIds, color) => {
            const nextState = updateTabs(appState.getState(), tabIds, { color });
            persistCanonicalState(nextState, { includeColumns: false });
        },
        onDeleteTabs: tabIds => persistCanonicalState(removeTabs(appState.getState(), tabIds)),
        onOpenColumn: openAllInColumn,
        onDeleteColumn: columnId => {
            closeAllMenus();
            persistCanonicalState(
                removeColumn(appState.getState(), columnId, { deleteTabs: true })
            );
        },
        onOpenGroup: openAllInGroup,
        onUngroup: groupId => persistCanonicalState(ungroup(appState.getState(), groupId)),
        onDeleteGroup: groupId =>
            persistCanonicalState(removeGroup(appState.getState(), groupId, { deleteTabs: true }))
    }
});

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
    openTabs
        .list()
        .then(tabs => openTabsView.render(tabs))
        .catch(error => {
            console.error('Could not read the open tabs:', error);
        });
}

async function initializeStoredState() {
    try {
        const result = await stateStorage.initialize();
        if (result.migrated) {
            console.log('Migrated tab IDs to unique format');
        }
        if (result.recovered > 0) {
            console.log(`Recovered ${result.recovered} orphaned tab(s)`);
        }
        displaySavedTabs(result.state);
    } catch (error) {
        console.error('Could not initialize extension storage:', error);
    }
}

function setSidebarCollapsed(collapsed) {
    settings
        .saveSidebarCollapsed(collapsed)
        .then(() => {
            document.querySelectorAll('#open-tabs-list .tab-item').forEach(tab => {
                tab.classList.toggle('collapsed', collapsed);
            });
        })
        .catch(error => {
            console.error('Could not save the sidebar state:', error);
        });
}

const handleClickOutside = e => {
    const clickedButton = e.target.closest('.more-options, .menu-option, .settings-button');
    const isMoreOptionsButton = clickedButton !== null;

    const allItems = Array.from(document.querySelectorAll('li')).filter(
        item => !item.classList.contains('subgroup-item')
    );
    const isClickInside = allItems.some(item => item.contains(e.target));

    if (!isMoreOptionsButton) {
        closeAllMenus();
    }
    if (!isClickInside) {
        selectionController.clear();
    }

    const emojiPickers = document.querySelectorAll('.emoji-picker-on-top');
    const emojiButtons = document.querySelectorAll('.emoji-button');
    const isEmojiClick =
        Array.from(emojiButtons).some(btn => btn.contains(e.target)) ||
        Array.from(emojiPickers).some(picker => picker.contains(e.target));
    if (!isEmojiClick) {
        emojiPickers.forEach(picker => (picker.style.display = 'none'));
    }
};

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
    dataTransfer
        .createExport()
        .then(downloadExport)
        .catch(error => {
            console.error('Export failed:', error);
        });
}

function reportImportFailure(error) {
    console.error('Import failed:', error);
    if (error.rollbackError) {
        console.error('Import rollback failed:', error.rollbackError);
        alert(
            `Import failed and automatic rollback also failed. Your pre-import backup may still be available in extension storage.\n\n${error.message}`
        );
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
        reader.onload = async e => {
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

const settingsMenu = createSettingsMenuController(document, {
    button: settingsButton,
    menuController,
    releaseService: releaseNotes,
    getTheme: () => theme,
    toggleTheme,
    onExport: exportAllData,
    onImport: importAllData,
    onOpenPage: openSettingsPage,
    onError: (message, error) => console.error(message, error)
});

settings
    .load()
    .then(stored => {
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
    })
    .catch(error => {
        console.error('Error updating sidebar:', error);
    });

document.getElementById('add-column').addEventListener('click', () => {
    const nextState = addColumn(appState.getState(), createNewColumn());
    persistCanonicalState(nextState, { includeTabs: false });
});

deletionArea = renderDeletionArea(document);
document.documentElement.dataset.browser = userBrowser;

// Firefox reports removals before the window settles, so it refreshes later.
openTabs.onChanged(fetchOpenTabs, {
    removalDelay: userBrowser === 'firefox' ? 150 : 0
});
browserApi.storage.onChanged.addListener(async changes => {
    try {
        const synchronized = await stateStorage.synchronize(changes);
        if (synchronized?.type === 'state') {
            console.log('Changes detected', changes);
            if (changes.columnState && changes.animation) {
                const column = document.getElementById(changes.animation.newValue.columnId);
                if (changes.animation.newValue.minimized === true) {
                    minimizeColumn(column);
                } else {
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
        document
            .getElementById('sidebar')
            .classList.toggle('collapsed', sidebarChange.sidebarCollapsed);
    }
});
fetchOpenTabs();

initializeStoredState();

document.querySelector('.minimize-sidebar').addEventListener('click', () => {
    setSidebarCollapsed(true);
});
document.querySelector('.maximize-sidebar').addEventListener('click', () => {
    setSidebarCollapsed(false);
});

document.addEventListener('dragover', function (event) {
    event.preventDefault();
});
document.addEventListener('click', handleClickOutside);
document.addEventListener('drop', handleDrop);
document.addEventListener('dragover', event => dragController.handleDragOver(event));

settingsMenu.start().catch(error => {
    console.error('Could not read the installed release:', error);
});
