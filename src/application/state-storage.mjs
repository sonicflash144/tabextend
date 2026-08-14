import { migrateToUniqueIds, recoverOrphanedTabs } from '../compatibility/legacy-data.mjs';
import { applyDrop } from '../domain/drop-operations.mjs';
import { addColumn, addTabs } from '../domain/operations.mjs';
import { canonicalStateFromLegacy, canonicalStateToLegacy } from '../domain/state.mjs';

const STATE_STORAGE_KEYS = ['columnState', 'bgTabs', 'savedTabs'];

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTempMarker(tab) {
    return (
        isObject(tab) &&
        Object.prototype.hasOwnProperty.call(tab, 'temp') &&
        !Object.prototype.hasOwnProperty.call(tab, 'id')
    );
}

function defaultColumn() {
    return {
        id: 'defaultColumn',
        title: 'New Column',
        minimized: false,
        emoji: null,
        items: []
    };
}

/**
 * Coordinate the canonical state store with the legacy browser-storage
 * contract. UI-specific responses to synchronized state remain in the page
 * composition root.
 */
export function createStateStorageService(options) {
    const {
        storage,
        stateStore,
        idFactory,
        now = () => Date.now(),
        createDefaultColumn = defaultColumn
    } = options;

    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new Error('A storage adapter with get and set methods is required.');
    }
    if (
        !stateStore ||
        typeof stateStore.getState !== 'function' ||
        typeof stateStore.replace !== 'function'
    ) {
        throw new Error('A canonical state store is required.');
    }
    if (typeof idFactory !== 'function') {
        throw new Error('An id factory is required.');
    }

    function appendBackgroundTabs(state, backgroundTabs) {
        if (!Array.isArray(backgroundTabs) || backgroundTabs.length === 0) {
            return state;
        }

        const tabs = backgroundTabs.map(tab =>
            typeof tab.id === 'number' ? { ...tab, id: String(idFactory(tab.id)) } : tab
        );
        let nextState = state;
        if (nextState.columns.length === 0) {
            nextState = addColumn(nextState, createDefaultColumn());
        }
        nextState = addTabs(nextState, tabs);
        return applyDrop(nextState, {
            dragged: tabs.map(tab => ({ type: 'tab', tabId: String(tab.id) })),
            target: {
                type: 'column',
                columnId: nextState.columns[0].id,
                index: nextState.columns[0].items.length
            }
        });
    }

    function persistenceUpdates(nextState, options = {}) {
        const { includeTabs = true, includeColumns = true, extra = {} } = options;
        const legacyState = canonicalStateToLegacy(
            nextState,
            includeTabs ? { tempMarker: now() } : {}
        );
        const updates = { ...extra };
        if (includeTabs) updates.savedTabs = legacyState.savedTabs;
        if (includeColumns) updates.columnState = legacyState.columnState;
        return updates;
    }

    async function persist(nextState, persistOptions = {}) {
        stateStore.replace(nextState);
        await storage.set(persistenceUpdates(nextState, persistOptions));
        return nextState;
    }

    function prepareInitialization(data = {}) {
        let savedTabs = Array.isArray(data.savedTabs) ? data.savedTabs : [];
        let columnState = Array.isArray(data.columnState) ? data.columnState : [];
        const backgroundTabs = Array.isArray(data.bgTabs) ? data.bgTabs : [];

        const migration = migrateToUniqueIds(savedTabs, columnState, idFactory);
        savedTabs = migration.savedTabs.filter(tab => !isTempMarker(tab));
        columnState = migration.columnState;

        const recovery = recoverOrphanedTabs(savedTabs, columnState, idFactory);
        let state = canonicalStateFromLegacy(recovery.savedTabs, recovery.columnState);
        state = appendBackgroundTabs(state, backgroundTabs);

        return {
            state,
            migrated: migration.migrated,
            recovered: recovery.recovered,
            consumedBackgroundTabs: backgroundTabs.length
        };
    }

    async function initialize() {
        const data = await storage.get(STATE_STORAGE_KEYS);
        const result = prepareInitialization(data);
        stateStore.replace(result.state);
        const updates = persistenceUpdates(result.state, {
            extra: { bgTabs: [] }
        });
        await storage.set(updates);
        return { ...result, storageUpdates: updates };
    }

    async function reload() {
        const data = await storage.get(['savedTabs', 'columnState']);
        const state = canonicalStateFromLegacy(data.savedTabs || [], data.columnState || []);
        stateStore.replace(state);
        return state;
    }

    async function consumeBackgroundTabs() {
        const data = await storage.get(STATE_STORAGE_KEYS);
        const state = canonicalStateFromLegacy(data.savedTabs || [], data.columnState || []);
        const backgroundTabs = Array.isArray(data.bgTabs) ? data.bgTabs : [];
        const nextState = appendBackgroundTabs(state, backgroundTabs);
        await persist(nextState, { extra: { bgTabs: [] } });
        return {
            state: nextState,
            consumedBackgroundTabs: backgroundTabs.length
        };
    }

    async function synchronize(changes = {}) {
        if (changes.savedTabs || changes.columnState) {
            return { type: 'state', state: await reload() };
        }
        if (!changes.bgTabs) return null;

        const oldBackgroundTabs = changes.bgTabs.oldValue || [];
        const newBackgroundTabs = changes.bgTabs.newValue || [];
        if (JSON.stringify(oldBackgroundTabs) === JSON.stringify(newBackgroundTabs)) {
            return null;
        }

        const result = await consumeBackgroundTabs();
        return { type: 'background-tabs', ...result };
    }

    return {
        appendBackgroundTabs,
        consumeBackgroundTabs,
        initialize,
        persist,
        prepareInitialization,
        reload,
        synchronize
    };
}
