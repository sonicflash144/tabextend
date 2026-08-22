import { applyDrop } from '../domain/drop-operations.mjs';
import {
    addColumn,
    addTabs,
    moveColumn,
    removeColumn,
    removeReopenedGroup,
    removeTabs
} from '../domain/operations.mjs';
import { findGroup, getColumn, getColumnTabs, getGroupTabs, getTab } from '../domain/state.mjs';
import { safePageUrl } from '../security/content.mjs';

/** Pair stored tabs with URLs the browser may navigate to. */
export function navigableTabs(tabs) {
    return tabs.map(tab => ({ tab, url: safePageUrl(tab.url) })).filter(entry => entry.url);
}

/**
 * Apply resolved drag/drop requests without depending on DOM elements. The UI
 * controller supplies stable tab, group, column, and browser-tab identities;
 * this workflow owns browser operations and canonical state changes.
 */
export function createDropWorkflow(options) {
    const { stateStore, persist, tabs, reportOpenFailure, idFactory, createColumn } = options;

    if (!stateStore || typeof stateStore.getState !== 'function') {
        throw new Error('A canonical state store is required.');
    }
    if (typeof persist !== 'function') throw new Error('A persistence callback is required.');
    if (!tabs || typeof tabs.capture !== 'function') {
        throw new Error('An open-tabs service is required.');
    }
    if (typeof reportOpenFailure !== 'function') {
        throw new Error('An open-failure reporter is required.');
    }
    if (typeof idFactory !== 'function') throw new Error('An id factory is required.');
    if (typeof createColumn !== 'function') throw new Error('A column factory is required.');

    /** Open stored tabs and return only the entries the browser accepted. */
    async function openSavedTabs(entries, groupTitle, index = null) {
        if (entries.length === 0) return [];
        const urls = entries.map(entry => entry.url);
        try {
            const { opened, refused } = await tabs.openUrls(urls, { index, groupTitle });
            if (refused.length > 0) {
                reportOpenFailure(
                    'Could not open saved tabs:',
                    refused[0].error,
                    refused.map(result => result.url)
                );
            }
            const openedUrls = new Set(opened.map(result => result.url));
            return entries.filter(entry => openedUrls.has(entry.url));
        } catch (error) {
            // Grouping can fail after creating the tabs. Treat the result as
            // unknown so no saved item is removed from the board.
            reportOpenFailure('Could not open saved tabs:', error, urls);
            return [];
        }
    }

    async function openSavedTabInBackground(url, index) {
        try {
            await tabs.openInBackground(url, index);
            return true;
        } catch (error) {
            reportOpenFailure('Could not reopen the saved tab:', error, [url]);
            return false;
        }
    }

    function openAllInColumn(columnId) {
        const state = stateStore.getState();
        const column = getColumn(state, columnId);
        if (!column) return Promise.resolve([]);
        return openSavedTabs(navigableTabs(getColumnTabs(state, columnId)), column.title);
    }

    function openAllInGroup(groupId, index = null) {
        const state = stateStore.getState();
        const { group } = findGroup(state, groupId);
        if (!group) return Promise.resolve([]);
        return openSavedTabs(navigableTabs(getGroupTabs(state, groupId)), group.title, index);
    }

    async function persistItemsDrop(dragged, target, initialState = stateStore.getState()) {
        const openItems = dragged.filter(item => item.type === 'open-tab');
        const captures = await tabs.capture(openItems.map(item => item.browserTabId));

        let nextState =
            captures.length > 0
                ? addTabs(
                      initialState,
                      captures.map(capture => capture.savedTab)
                  )
                : initialState;
        const capturedByBrowserId = new Map(
            captures.map(capture => [capture.browserTabId, capture.savedTab.id])
        );
        const domainDragged = dragged
            .map(item =>
                item.type === 'open-tab'
                    ? { type: 'tab', tabId: capturedByBrowserId.get(item.browserTabId) }
                    : item
            )
            .filter(item => item.type !== 'tab' || item.tabId !== undefined);

        nextState = applyDrop(nextState, {
            dragged: domainDragged,
            target,
            groupIdFactory: () => `group-${idFactory()}`
        });
        persist(nextState);

        if (captures.length > 0) {
            await tabs.close(captures.map(capture => capture.browserTabId));
        }
        return nextState;
    }

    async function deleteDroppedItems(dragged) {
        const initialState = stateStore.getState();
        const browserTabIds = [];
        const savedTabIds = new Set();
        dragged.forEach(item => {
            if (item.type === 'open-tab') {
                browserTabIds.push(item.browserTabId);
            } else if (item.type === 'group') {
                const { group } = findGroup(initialState, item.groupId);
                group?.tabIds.forEach(tabId => savedTabIds.add(tabId));
            } else if (item.type === 'tab') {
                savedTabIds.add(item.tabId);
            }
        });
        const nextState = removeTabs(initialState, savedTabIds);
        if (nextState !== initialState) persist(nextState);
        if (browserTabIds.length > 0) await tabs.close(browserTabIds);
        return nextState;
    }

    /** Reopen dropped items as browser tabs, in their requested order. */
    async function reopenDroppedItems(dragged, index) {
        let nextState = stateStore.getState();
        let browserIndex = index;
        for (const item of dragged) {
            if (item.type === 'open-tab') {
                await tabs.move(item.browserTabId, browserIndex);
            } else if (item.type === 'group') {
                const { group } = findGroup(nextState, item.groupId);
                if (group) {
                    const opened = await openSavedTabs(
                        navigableTabs(getGroupTabs(nextState, group.id)),
                        group.title,
                        browserIndex
                    );
                    browserIndex += opened.length;
                    nextState = removeReopenedGroup(
                        nextState,
                        group.id,
                        opened.map(entry => entry.tab.id)
                    );
                    continue;
                }
            } else if (item.type === 'tab') {
                const [entry] = navigableTabs([getTab(nextState, item.tabId)].filter(Boolean));
                const opened = entry
                    ? await openSavedTabInBackground(entry.url, browserIndex)
                    : true;
                if (opened) nextState = removeTabs(nextState, item.tabId);
            }
            browserIndex += 1;
        }
        if (nextState !== stateStore.getState()) persist(nextState);
        return nextState;
    }

    async function apply(descriptor) {
        switch (descriptor.type) {
            case 'delete-column':
                persist(
                    removeColumn(stateStore.getState(), descriptor.columnId, { deleteTabs: true })
                );
                return;
            case 'move-column':
                persist(moveColumn(stateStore.getState(), descriptor.columnId, descriptor.index), {
                    includeTabs: false
                });
                return;
            case 'delete-items':
                await deleteDroppedItems(descriptor.dragged);
                return;
            case 'new-column': {
                const column = createColumn();
                const nextState = addColumn(stateStore.getState(), column);
                await persistItemsDrop(
                    descriptor.dragged,
                    { type: 'column', columnId: column.id, index: 0 },
                    nextState
                );
                return;
            }
            case 'open-tabs':
                await reopenDroppedItems(descriptor.dragged, descriptor.index);
                return;
            case 'group':
                await persistItemsDrop(descriptor.dragged, {
                    type: 'group',
                    groupId: descriptor.groupId,
                    index: descriptor.index
                });
                return;
            case 'item':
                await persistItemsDrop(descriptor.dragged, {
                    type: 'item',
                    item: descriptor.item
                });
                return;
            case 'column':
                await persistItemsDrop(descriptor.dragged, {
                    type: 'column',
                    columnId: descriptor.columnId,
                    index: descriptor.index
                });
                return;
        }
    }

    return {
        apply,
        deleteDroppedItems,
        openAllInColumn,
        openAllInGroup,
        openSavedTabs,
        persistItemsDrop,
        reopenDroppedItems
    };
}
