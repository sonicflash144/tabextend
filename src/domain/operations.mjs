function normalizeId(id) {
    return String(id);
}

function normalizedIdSet(ids) {
    const values = Array.isArray(ids) || ids instanceof Set ? ids : [ids];
    return new Set([...values].map(normalizeId));
}

function cloneItem(item) {
    if (item.type === 'group') {
        return { ...item, tabIds: [...item.tabIds] };
    }
    return { ...item };
}

/** Create a fully detached canonical state for immutable transformations. */
export function cloneCanonicalState(state) {
    return {
        ...state,
        tabs: new Map([...state.tabs].map(([id, tab]) => [id, { ...tab }])),
        tabOrder: [...state.tabOrder],
        columns: state.columns.map(column => ({
            ...column,
            items: column.items.map(cloneItem)
        }))
    };
}

function clampedIndex(index, length) {
    if (!Number.isInteger(index)) return length;
    return Math.max(0, Math.min(index, length));
}

export function findGroupLocation(state, groupId) {
    const normalizedId = normalizeId(groupId);
    for (let columnIndex = 0; columnIndex < state.columns.length; columnIndex += 1) {
        const itemIndex = state.columns[columnIndex].items.findIndex(
            item => item.type === 'group' && item.id === normalizedId
        );
        if (itemIndex !== -1) {
            return {
                columnIndex,
                itemIndex,
                column: state.columns[columnIndex],
                group: state.columns[columnIndex].items[itemIndex]
            };
        }
    }
    return null;
}

function removeTabPlacementsFromDraft(state, removedIds) {
    state.columns.forEach(column => {
        column.items = column.items.flatMap(item => {
            if (item.type === 'tab') {
                return removedIds.has(item.tabId) ? [] : [item];
            }
            item.tabIds = item.tabIds.filter(tabId => !removedIds.has(tabId));
            return item.tabIds.length === 0 ? [] : [item];
        });
    });
    return state;
}

function removeTabsFromDraft(state, removedIds) {
    removedIds.forEach(id => state.tabs.delete(id));
    state.tabOrder = state.tabOrder.filter(id => !removedIds.has(id));
    return removeTabPlacementsFromDraft(state, removedIds);
}

export function removeTabPlacements(state, tabIds) {
    const nextState = cloneCanonicalState(state);
    const removedIds = normalizedIdSet(tabIds);
    removeTabPlacementsFromDraft(nextState, removedIds);
    return nextState;
}

export function addTabs(state, tabs, options = {}) {
    const nextState = cloneCanonicalState(state);
    let insertionIndex = clampedIndex(options.index, nextState.tabOrder.length);

    for (const sourceTab of tabs) {
        if (!sourceTab || (typeof sourceTab.id !== 'string' && typeof sourceTab.id !== 'number')) {
            throw new Error('A tab id must be a string or number.');
        }
        const id = normalizeId(sourceTab.id);
        if (nextState.tabs.has(id)) {
            throw new Error(`Tab ${JSON.stringify(id)} already exists.`);
        }
        nextState.tabs.set(id, { ...sourceTab, id });
        nextState.tabOrder.splice(insertionIndex, 0, id);
        insertionIndex += 1;
    }

    return nextState;
}

export function updateTabs(state, tabIds, changes) {
    const ids = [...normalizedIdSet(tabIds)].filter(id => state.tabs.has(id));
    if (ids.length === 0) return state;

    const nextState = cloneCanonicalState(state);
    ids.forEach(id => {
        const currentTab = nextState.tabs.get(id);
        const resolvedChanges =
            typeof changes === 'function' ? changes({ ...currentTab }) : changes;
        nextState.tabs.set(id, {
            ...currentTab,
            ...resolvedChanges,
            id
        });
    });
    return nextState;
}

export function updateTab(state, tabId, changes) {
    return updateTabs(state, [tabId], changes);
}

export function removeTabs(state, tabIds) {
    const removedIds = normalizedIdSet(tabIds);
    if (![...removedIds].some(id => state.tabs.has(id))) return state;

    const nextState = cloneCanonicalState(state);
    return removeTabsFromDraft(nextState, removedIds);
}

export function addColumn(state, column, index = state.columns.length) {
    const id = normalizeId(column.id);
    if (state.columns.some(existing => existing.id === id)) {
        throw new Error(`Column ${JSON.stringify(id)} already exists.`);
    }

    const nextState = cloneCanonicalState(state);
    const nextColumn = {
        ...column,
        id,
        title: typeof column.title === 'string' ? column.title : 'New Column',
        minimized: column.minimized === true,
        items: Array.isArray(column.items) ? column.items.map(cloneItem) : []
    };
    nextState.columns.splice(clampedIndex(index, nextState.columns.length), 0, nextColumn);
    return nextState;
}

export function updateColumn(state, columnId, changes) {
    const id = normalizeId(columnId);
    const columnIndex = state.columns.findIndex(column => column.id === id);
    if (columnIndex === -1) return state;

    const nextState = cloneCanonicalState(state);
    const currentColumn = nextState.columns[columnIndex];
    const resolvedChanges =
        typeof changes === 'function'
            ? changes({ ...currentColumn, items: currentColumn.items.map(cloneItem) })
            : changes;
    nextState.columns[columnIndex] = {
        ...currentColumn,
        ...resolvedChanges,
        id,
        items: currentColumn.items
    };
    return nextState;
}

export function moveColumn(state, columnId, index) {
    const id = normalizeId(columnId);
    const currentIndex = state.columns.findIndex(column => column.id === id);
    if (currentIndex === -1) return state;

    const nextState = cloneCanonicalState(state);
    const [column] = nextState.columns.splice(currentIndex, 1);
    const adjustedIndex = currentIndex < index ? index - 1 : index;
    nextState.columns.splice(clampedIndex(adjustedIndex, nextState.columns.length), 0, column);
    return nextState;
}

function tabIdsInColumn(column) {
    return column.items.flatMap(item => (item.type === 'group' ? item.tabIds : [item.tabId]));
}

export function removeColumn(state, columnId, options = {}) {
    const id = normalizeId(columnId);
    const column = state.columns.find(candidate => candidate.id === id);
    if (!column) return state;

    const nextState = cloneCanonicalState(state);
    nextState.columns = nextState.columns.filter(candidate => candidate.id !== id);
    if (options.deleteTabs) {
        removeTabsFromDraft(nextState, normalizedIdSet(tabIdsInColumn(column)));
    }
    return nextState;
}

export function createGroup(state, columnId, index, group) {
    const id = normalizeId(group.id);
    if (findGroupLocation(state, id)) {
        throw new Error(`Group ${JSON.stringify(id)} already exists.`);
    }
    const normalizedTabIds = [...new Set(group.tabIds.map(normalizeId))];
    const missingTabId = normalizedTabIds.find(tabId => !state.tabs.has(tabId));
    if (missingTabId) {
        throw new Error(`Group refers to missing tab ${JSON.stringify(missingTabId)}.`);
    }

    const nextState = removeTabPlacements(state, normalizedTabIds);
    const column = nextState.columns.find(candidate => candidate.id === normalizeId(columnId));
    if (!column) throw new Error(`Column ${JSON.stringify(columnId)} does not exist.`);

    column.items.splice(clampedIndex(index, column.items.length), 0, {
        ...group,
        type: 'group',
        id,
        tabIds: normalizedTabIds,
        title: typeof group.title === 'string' ? group.title : 'New Group',
        expanded: group.expanded === true
    });
    return nextState;
}

export function updateGroup(state, groupId, changes) {
    const location = findGroupLocation(state, groupId);
    if (!location) return state;

    const nextState = cloneCanonicalState(state);
    const nextLocation = findGroupLocation(nextState, groupId);
    const currentGroup = nextLocation.group;
    const resolvedChanges =
        typeof changes === 'function'
            ? changes({ ...currentGroup, tabIds: [...currentGroup.tabIds] })
            : changes;
    nextLocation.column.items[nextLocation.itemIndex] = {
        ...currentGroup,
        ...resolvedChanges,
        type: 'group',
        id: currentGroup.id,
        tabIds: currentGroup.tabIds
    };
    return nextState;
}

export function ungroup(state, groupId) {
    const location = findGroupLocation(state, groupId);
    if (!location) return state;

    const nextState = cloneCanonicalState(state);
    const nextLocation = findGroupLocation(nextState, groupId);
    nextLocation.column.items.splice(
        nextLocation.itemIndex,
        1,
        ...nextLocation.group.tabIds.map(tabId => ({ type: 'tab', tabId }))
    );
    return nextState;
}

export function removeGroup(state, groupId, options = {}) {
    const location = findGroupLocation(state, groupId);
    if (!location) return state;
    const groupTabIds = [...location.group.tabIds];

    const nextState = cloneCanonicalState(state);
    const nextLocation = findGroupLocation(nextState, groupId);
    nextLocation.column.items.splice(nextLocation.itemIndex, 1);
    if (options.deleteTabs) {
        removeTabsFromDraft(nextState, normalizedIdSet(groupTabIds));
    }
    return nextState;
}

/**
 * Retire a group whose tabs were reopened as browser tabs. Only the tabs the
 * browser actually opened leave the board: if it opened all of them the group
 * goes with them, and otherwise the group stays behind holding whatever it
 * refused, so a local file Chrome would not open is never dropped on the floor.
 */
export function removeReopenedGroup(state, groupId, openedTabIds) {
    const location = findGroupLocation(state, groupId);
    if (!location) return state;

    const opened = new Set((Array.isArray(openedTabIds) ? openedTabIds : []).map(normalizeId));
    const removable = location.group.tabIds.filter(tabId => opened.has(normalizeId(tabId)));
    if (removable.length === 0) return state;
    if (removable.length === location.group.tabIds.length) {
        return removeGroup(state, groupId, { deleteTabs: true });
    }
    return removeTabs(state, removable);
}
