import { cloneCanonicalState, findGroupLocation, removeTabPlacements } from './operations.mjs';

function normalizeId(id) {
    return String(id);
}

function cloneItem(item) {
    return item.type === 'group' ? { ...item, tabIds: [...item.tabIds] } : { ...item };
}

function clampedIndex(index, length) {
    if (!Number.isInteger(index)) return length;
    return Math.max(0, Math.min(index, length));
}

function findTopLevelTabLocation(state, tabId) {
    const normalizedId = normalizeId(tabId);
    for (let columnIndex = 0; columnIndex < state.columns.length; columnIndex += 1) {
        const itemIndex = state.columns[columnIndex].items.findIndex(
            item => item.type === 'tab' && item.tabId === normalizedId
        );
        if (itemIndex !== -1) {
            return {
                columnIndex,
                itemIndex,
                column: state.columns[columnIndex],
                item: state.columns[columnIndex].items[itemIndex]
            };
        }
    }
    return null;
}

function normalizeDragged(state, dragged) {
    const draggedGroupIds = new Set(
        dragged.filter(item => item.type === 'group').map(item => normalizeId(item.groupId))
    );
    const tabsInsideDraggedGroups = new Set();
    draggedGroupIds.forEach(groupId => {
        const location = findGroupLocation(state, groupId);
        if (!location) throw new Error(`Dragged group ${JSON.stringify(groupId)} does not exist.`);
        location.group.tabIds.forEach(tabId => tabsInsideDraggedGroups.add(tabId));
    });

    const seenGroups = new Set();
    const seenTabs = new Set();
    const payload = [];
    for (const descriptor of dragged) {
        if (descriptor.type === 'group') {
            const groupId = normalizeId(descriptor.groupId);
            if (seenGroups.has(groupId)) continue;
            const location = findGroupLocation(state, groupId);
            payload.push(cloneItem(location.group));
            seenGroups.add(groupId);
            continue;
        }
        if (descriptor.type !== 'tab') {
            throw new Error(`Unknown dragged item type ${JSON.stringify(descriptor.type)}.`);
        }
        const tabId = normalizeId(descriptor.tabId);
        if (!state.tabs.has(tabId)) {
            throw new Error(`Dragged tab ${JSON.stringify(tabId)} does not exist.`);
        }
        if (seenTabs.has(tabId) || tabsInsideDraggedGroups.has(tabId)) continue;
        payload.push({ type: 'tab', tabId });
        seenTabs.add(tabId);
    }

    return {
        payload,
        draggedGroupIds,
        draggedTabIds: seenTabs
    };
}

function removeDraggedItems(state, draggedGroupIds, draggedTabIds) {
    const nextState = cloneCanonicalState(state);
    nextState.columns = nextState.columns.map(column => ({
        ...column,
        items: column.items.filter(item => item.type !== 'group' || !draggedGroupIds.has(item.id))
    }));
    return removeTabPlacements(nextState, draggedTabIds);
}

function flattenedTabIds(payload) {
    const seen = new Set();
    return payload.flatMap(item => {
        const tabIds = item.type === 'group' ? item.tabIds : [item.tabId];
        return tabIds.filter(tabId => {
            if (seen.has(tabId)) return false;
            seen.add(tabId);
            return true;
        });
    });
}

function adjustedColumnIndex(state, target, draggedGroupIds, draggedTabIds) {
    const column = state.columns.find(candidate => candidate.id === normalizeId(target.columnId));
    if (!column) throw new Error(`Drop column ${JSON.stringify(target.columnId)} does not exist.`);
    const originalIndex = clampedIndex(target.index, column.items.length);
    const removedBeforeTarget = column.items.slice(0, originalIndex).filter(item => {
        if (item.type === 'tab') return draggedTabIds.has(item.tabId);
        return draggedGroupIds.has(item.id) || item.tabIds.every(tabId => draggedTabIds.has(tabId));
    }).length;
    return originalIndex - removedBeforeTarget;
}

function adjustedGroupIndex(state, target, draggedTabIds) {
    const location = findGroupLocation(state, target.groupId);
    if (!location) throw new Error(`Drop group ${JSON.stringify(target.groupId)} does not exist.`);
    const originalIndex = clampedIndex(target.index, location.group.tabIds.length);
    const removedBeforeTarget = location.group.tabIds
        .slice(0, originalIndex)
        .filter(tabId => draggedTabIds.has(tabId)).length;
    return originalIndex - removedBeforeTarget;
}

function dropInColumn(state, originalState, payload, target, draggedGroupIds, draggedTabIds) {
    const column = state.columns.find(candidate => candidate.id === normalizeId(target.columnId));
    if (!column) throw new Error(`Drop column ${JSON.stringify(target.columnId)} does not exist.`);
    const index = adjustedColumnIndex(originalState, target, draggedGroupIds, draggedTabIds);
    column.items.splice(index, 0, ...payload.map(cloneItem));
    return state;
}

function dropInGroup(state, originalState, payload, target, draggedGroupIds, draggedTabIds) {
    const groupId = normalizeId(target.groupId);
    if (draggedGroupIds.has(groupId)) {
        throw new Error('A group cannot be dropped into itself.');
    }
    const index = adjustedGroupIndex(originalState, target, draggedTabIds);
    const location = findGroupLocation(state, groupId);
    if (!location) throw new Error(`Drop group ${JSON.stringify(groupId)} does not exist.`);
    location.group.tabIds.splice(index, 0, ...flattenedTabIds(payload));
    return state;
}

function dropOnItem(state, payload, target, draggedGroupIds, groupIdFactory) {
    if (target.item.type === 'group') {
        const groupId = normalizeId(target.item.groupId);
        if (draggedGroupIds.has(groupId)) {
            throw new Error('A group cannot be dropped onto itself.');
        }
        const location = findGroupLocation(state, groupId);
        if (!location) throw new Error(`Target group ${JSON.stringify(groupId)} does not exist.`);
        const index = clampedIndex(target.index, location.group.tabIds.length);
        location.group.tabIds.splice(index, 0, ...flattenedTabIds(payload));
        return state;
    }

    if (target.item.type !== 'tab') {
        throw new Error(`Unknown drop target type ${JSON.stringify(target.item.type)}.`);
    }
    const tabId = normalizeId(target.item.tabId);
    const location = findTopLevelTabLocation(state, tabId);
    if (!location) throw new Error(`Target tab ${JSON.stringify(tabId)} does not exist.`);
    const sourceGroup = payload.find(item => item.type === 'group');
    const groupMetadata = sourceGroup ? { ...sourceGroup } : { title: 'New Group', expanded: true };
    delete groupMetadata.type;
    delete groupMetadata.id;
    delete groupMetadata.tabIds;
    const id = normalizeId(groupIdFactory());
    if (findGroupLocation(state, id)) {
        throw new Error(`Generated group id ${JSON.stringify(id)} already exists.`);
    }
    location.column.items[location.itemIndex] = {
        ...groupMetadata,
        type: 'group',
        id,
        tabIds: [tabId, ...flattenedTabIds(payload)]
    };
    return state;
}

/**
 * Apply a canonical drag/drop decision without accessing the DOM or browser.
 * Target indexes describe insertion slots in the state before dragged items
 * are removed, matching the indexes calculated by the UI's drag geometry.
 */
export function applyDrop(state, options) {
    const { dragged = [], target, groupIdFactory = () => `group-${Date.now()}` } = options;
    if (!target || dragged.length === 0) return state;

    const { payload, draggedGroupIds, draggedTabIds } = normalizeDragged(state, dragged);
    if (payload.length === 0) return state;

    const nextState = removeDraggedItems(state, draggedGroupIds, draggedTabIds);
    if (target.type === 'column') {
        return dropInColumn(nextState, state, payload, target, draggedGroupIds, draggedTabIds);
    }
    if (target.type === 'group') {
        return dropInGroup(nextState, state, payload, target, draggedGroupIds, draggedTabIds);
    }
    if (target.type === 'item') {
        return dropOnItem(nextState, payload, target, draggedGroupIds, groupIdFactory);
    }
    throw new Error(`Unknown drop target ${JSON.stringify(target.type)}.`);
}
