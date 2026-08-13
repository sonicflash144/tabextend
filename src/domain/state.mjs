export const CANONICAL_STATE_VERSION = 1;

const TAB_PREFIX = 'tab-';

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTempMarker(tab) {
    return isObject(tab) && Object.prototype.hasOwnProperty.call(tab, 'temp') &&
        !Object.prototype.hasOwnProperty.call(tab, 'id');
}

function tabIdFromReference(reference) {
    if (typeof reference !== 'string' || !reference.startsWith(TAB_PREFIX)) return null;
    return reference.slice(TAB_PREFIX.length);
}

function canonicalItemFromLegacy(item) {
    if (!Array.isArray(item)) {
        const tabId = tabIdFromReference(item);
        return tabId === null ? null : { type: 'tab', tabId };
    }
    if (item.length < 4) return null;
    return {
        type: 'group',
        id: String(item[0]),
        tabIds: item.slice(1, -2).map(tabIdFromReference).filter(id => id !== null),
        title: typeof item[item.length - 2] === 'string' ? item[item.length - 2] : 'New Group',
        expanded: item[item.length - 1] === true
    };
}

/** Convert existing storage/export arrays into the application domain model. */
export function canonicalStateFromLegacy(savedTabs = [], columnState = []) {
    const tabs = new Map();
    const tabOrder = [];
    for (const tab of savedTabs) {
        if (!isObject(tab) || isTempMarker(tab) ||
            (typeof tab.id !== 'string' && typeof tab.id !== 'number')) continue;
        const id = String(tab.id);
        tabs.set(id, { ...tab, id });
        if (!tabOrder.includes(id)) tabOrder.push(id);
    }

    const columns = columnState.filter(isObject).map(column => {
        const { tabIds, ...columnMetadata } = column;
        return {
            ...columnMetadata,
            id: String(column.id),
            title: typeof column.title === 'string' ? column.title : 'New Column',
            minimized: column.minimized === true,
            emoji: typeof column.emoji === 'string' ? column.emoji : null,
            items: (Array.isArray(tabIds) ? tabIds : [])
                .map(canonicalItemFromLegacy)
                .filter(Boolean)
        };
    });

    return {
        schemaVersion: CANONICAL_STATE_VERSION,
        tabs,
        tabOrder,
        columns
    };
}

function legacyReference(tabId) {
    return `${TAB_PREFIX}${tabId}`;
}

/** Convert the domain model back to the exact legacy persistence shape. */
export function canonicalStateToLegacy(state, options = {}) {
    const { tempMarker } = options;
    const savedTabs = state.tabOrder
        .map(id => state.tabs.get(id))
        .filter(Boolean)
        .map(tab => ({ ...tab, id: String(tab.id) }));
    if (tempMarker !== undefined) savedTabs.push({ temp: tempMarker });

    const columnState = state.columns.map(column => {
        const { items, ...columnMetadata } = column;
        const legacyColumn = {
            ...columnMetadata,
            tabIds: items.map(item => {
                if (item.type === 'group') {
                    return [
                        item.id,
                        ...item.tabIds.map(legacyReference),
                        item.title,
                        item.expanded
                    ];
                }
                return legacyReference(item.tabId);
            })
        };
        if (legacyColumn.emoji === null) delete legacyColumn.emoji;
        return legacyColumn;
    });

    return { savedTabs, columnState };
}

export function getSavedTabs(state) {
    return state.tabOrder.map(id => state.tabs.get(id)).filter(Boolean);
}

export function getTab(state, tabId) {
    return state.tabs.get(String(tabId)) || null;
}

export function replaceColumnsFromLegacy(state, columnState) {
    const legacy = canonicalStateToLegacy(state);
    return canonicalStateFromLegacy(legacy.savedTabs, columnState);
}

export function validateCanonicalState(state) {
    const errors = [];
    if (!isObject(state)) return { valid: false, errors: ['State must be an object.'] };
    if (state.schemaVersion !== CANONICAL_STATE_VERSION) {
        errors.push(`Unsupported canonical state version ${state.schemaVersion}.`);
    }
    if (!(state.tabs instanceof Map)) errors.push('tabs must be a Map.');
    if (!Array.isArray(state.tabOrder)) errors.push('tabOrder must be an array.');
    if (!Array.isArray(state.columns)) errors.push('columns must be an array.');
    if (errors.length > 0) return { valid: false, errors };

    const orderedIds = new Set();
    state.tabOrder.forEach((id, index) => {
        if (orderedIds.has(id)) errors.push(`tabOrder contains duplicate id ${JSON.stringify(id)}.`);
        orderedIds.add(id);
        if (!state.tabs.has(id)) errors.push(`tabOrder[${index}] refers to missing tab ${JSON.stringify(id)}.`);
    });
    for (const id of state.tabs.keys()) {
        if (!orderedIds.has(id)) errors.push(`Tab ${JSON.stringify(id)} is missing from tabOrder.`);
    }

    const columnIds = new Set();
    const groupIds = new Set();
    state.columns.forEach((column, columnIndex) => {
        if (columnIds.has(column.id)) errors.push(`Duplicate column id ${JSON.stringify(column.id)}.`);
        columnIds.add(column.id);
        if (!Array.isArray(column.items)) {
            errors.push(`columns[${columnIndex}].items must be an array.`);
            return;
        }
        column.items.forEach((item, itemIndex) => {
            const path = `columns[${columnIndex}].items[${itemIndex}]`;
            if (item.type === 'tab') {
                if (!state.tabs.has(item.tabId)) errors.push(`${path} refers to missing tab ${JSON.stringify(item.tabId)}.`);
                return;
            }
            if (item.type !== 'group') {
                errors.push(`${path} has unknown type ${JSON.stringify(item.type)}.`);
                return;
            }
            if (groupIds.has(item.id)) errors.push(`Duplicate group id ${JSON.stringify(item.id)}.`);
            groupIds.add(item.id);
            item.tabIds.forEach(tabId => {
                if (!state.tabs.has(tabId)) errors.push(`${path} refers to missing tab ${JSON.stringify(tabId)}.`);
            });
        });
    });

    return { valid: errors.length === 0, errors };
}

export function createStateStore(initialState = canonicalStateFromLegacy()) {
    let currentState = initialState;
    const listeners = new Set();
    return {
        getState() {
            return currentState;
        },
        replace(nextState) {
            currentState = nextState;
            listeners.forEach(listener => listener(currentState));
            return currentState;
        },
        replaceLegacy(savedTabs, columnState) {
            return this.replace(canonicalStateFromLegacy(savedTabs, columnState));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}
