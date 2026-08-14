import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStateStorageService } from '../../src/application/state-storage.mjs';
import { updateColumn, updateTab } from '../../src/domain/operations.mjs';
import {
    canonicalStateFromLegacy,
    createStateStore,
    getTab
} from '../../src/domain/state.mjs';

function createStorage(initial = {}) {
    const values = structuredClone(initial);
    const writes = [];

    return {
        values,
        writes,
        async get(keys) {
            if (keys === null) return structuredClone(values);
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requestedKeys
                .filter(key => Object.prototype.hasOwnProperty.call(values, key))
                .map(key => [key, structuredClone(values[key])]));
        },
        async set(updates) {
            const detached = structuredClone(updates);
            writes.push(detached);
            Object.assign(values, detached);
        }
    };
}

function createService(storage, options = {}) {
    const stateStore = createStateStore();
    const service = createStateStorageService({
        storage,
        stateStore,
        idFactory: options.idFactory || (() => 'generated'),
        now: options.now || (() => 1000),
        createDefaultColumn: options.createDefaultColumn
    });
    return { service, stateStore };
}

test('initializes empty storage as valid empty canonical state', async () => {
    const storage = createStorage();
    const { service, stateStore } = createService(storage, { now: () => 25 });

    const result = await service.initialize();

    assert.equal(result.migrated, false);
    assert.equal(result.recovered, 0);
    assert.equal(result.consumedBackgroundTabs, 0);
    assert.equal(result.state.tabs.size, 0);
    assert.deepEqual(result.state.tabOrder, []);
    assert.deepEqual(result.state.columns, []);
    assert.equal(stateStore.getState(), result.state);
    assert.deepEqual(storage.values, {
        savedTabs: [{ temp: 25 }],
        columnState: [],
        bgTabs: []
    });
});

test('initializes canonical state through migration, recovery, and background-tab consumption', async () => {
    const storage = createStorage({
        savedTabs: [
            { id: 1, title: 'Placed', url: 'https://example.com/placed' },
            { id: 'orphan', title: 'Orphan', url: 'https://example.com/orphan' },
            { temp: 10 }
        ],
        columnState: [{
            id: 'column-1',
            title: 'Column',
            tabIds: ['tab-1']
        }],
        bgTabs: [{
            id: 2,
            title: 'Background',
            url: 'https://example.com/background'
        }]
    });
    const { service, stateStore } = createService(storage, {
        idFactory: oldId => oldId === 1
            ? 'migrated-1'
            : oldId === 2
                ? 'background-2'
                : 'recovery',
        now: () => 5000
    });

    const result = await service.initialize();

    assert.equal(result.migrated, true);
    assert.equal(result.recovered, 1);
    assert.equal(result.consumedBackgroundTabs, 1);
    assert.equal(stateStore.getState(), result.state);
    assert.equal(getTab(result.state, 'migrated-1').title, 'Placed');
    assert.equal(getTab(result.state, 'background-2').title, 'Background');
    assert.deepEqual(result.state.columns[0].items, [
        { type: 'tab', tabId: 'migrated-1' },
        { type: 'tab', tabId: 'background-2' }
    ]);
    assert.equal(result.state.columns[1].recovered, true);
    assert.deepEqual(storage.values.bgTabs, []);
    assert.deepEqual(storage.values.savedTabs.map(tab => tab.id ?? tab.temp), [
        'migrated-1',
        'orphan',
        'background-2',
        5000
    ]);
});

test('initialization migrates every numeric tab reference inside historical groups', async () => {
    const storage = createStorage({
        savedTabs: [
            { id: 1, title: 'One', url: 'https://example.com/one' },
            { id: 2, title: 'Two', url: 'https://example.com/two' }
        ],
        columnState: [{
            id: 'column-1',
            title: 'Column',
            tabIds: [[
                'group-1',
                'tab-1',
                'tab-2',
                'Group',
                true
            ]]
        }],
        bgTabs: []
    });
    const { service } = createService(storage, {
        idFactory: oldId => `migrated-${oldId}`
    });

    const result = await service.initialize();

    assert.equal(result.migrated, true);
    assert.deepEqual(result.state.columns[0].items, [{
        type: 'group',
        id: 'group-1',
        tabIds: ['migrated-1', 'migrated-2'],
        title: 'Group',
        expanded: true
    }]);
    assert.deepEqual(storage.values.columnState[0].tabIds, [[
        'group-1',
        'tab-migrated-1',
        'tab-migrated-2',
        'Group',
        true
    ]]);
});

test('creates a default column when pending background tabs are the first saved data', async () => {
    const storage = createStorage({
        savedTabs: [],
        columnState: [],
        bgTabs: [{ id: 'background', title: 'Background', url: 'https://example.com' }]
    });
    const { service } = createService(storage, {
        createDefaultColumn: () => ({
            id: 'first-column',
            title: 'New Column',
            minimized: false,
            emoji: '🍏',
            items: []
        })
    });

    const result = await service.initialize();

    assert.equal(result.state.columns[0].id, 'first-column');
    assert.deepEqual(result.state.columns[0].items, [
        { type: 'tab', tabId: 'background' }
    ]);
});

test('repeated initialization neither duplicates recovered nor consumed background tabs', async () => {
    let generatedIds = 0;
    const storage = createStorage({
        savedTabs: [{ id: 'orphan', title: 'Orphan', url: 'https://example.com/orphan' }],
        columnState: [],
        bgTabs: [{ id: 'background', title: 'Background', url: 'https://example.com/background' }]
    });
    const { service } = createService(storage, {
        idFactory: () => `generated-${generatedIds += 1}`
    });

    const first = await service.initialize();
    const second = await service.initialize();

    assert.equal(first.recovered, 1);
    assert.equal(first.consumedBackgroundTabs, 1);
    assert.equal(second.recovered, 0);
    assert.equal(second.consumedBackgroundTabs, 0);
    assert.equal(second.state.columns.filter(column => column.recovered).length, 1);
    assert.deepEqual(second.state.tabOrder, ['orphan', 'background']);
    assert.equal(new Set(second.state.tabOrder).size, 2);
    assert.deepEqual(storage.values.bgTabs, []);
});

test('persists selected legacy state slices and replaces the canonical store', async () => {
    const storage = createStorage({
        savedTabs: [{ id: 'one', title: 'One', url: 'https://example.com' }],
        columnState: [{ id: 'column-1', title: 'Old', tabIds: ['tab-one'] }]
    });
    const { service, stateStore } = createService(storage);
    const state = canonicalStateFromLegacy(
        storage.values.savedTabs,
        storage.values.columnState
    );
    const nextState = updateColumn(state, 'column-1', { title: 'Updated' });

    await service.persist(nextState, {
        includeTabs: false,
        extra: { animation: { columnId: 'column-1', minimized: false } }
    });

    assert.equal(stateStore.getState(), nextState);
    assert.deepEqual(storage.writes[0], {
        animation: { columnId: 'column-1', minimized: false },
        columnState: [{
            id: 'column-1',
            title: 'Updated',
            minimized: false,
            tabIds: ['tab-one']
        }]
    });
    assert.equal(storage.values.savedTabs[0].title, 'One');
});

test('full persistence writes both legacy slices with exactly one temporary marker', async () => {
    const storage = createStorage();
    const { service } = createService(storage, { now: () => 9000 });
    const state = canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com', customTabData: { pinned: true } },
            { temp: 100 }
        ],
        [{
            id: 'column-1',
            title: 'Column',
            minimized: true,
            emoji: '📚',
            customColumnData: 'preserved',
            tabIds: ['tab-one']
        }]
    );

    await service.persist(state);

    assert.deepEqual(storage.values.savedTabs, [
        {
            id: 'one',
            title: 'One',
            url: 'https://example.com',
            customTabData: { pinned: true }
        },
        { temp: 9000 }
    ]);
    assert.deepEqual(storage.values.columnState, [{
        id: 'column-1',
        title: 'Column',
        minimized: true,
        emoji: '📚',
        customColumnData: 'preserved',
        tabIds: ['tab-one']
    }]);
    assert.equal(storage.values.savedTabs.filter(tab => 'temp' in tab).length, 1);
});

test('tab-only persistence leaves columns untouched and preserves tab metadata', async () => {
    const originalColumns = [{
        id: 'column-1',
        title: 'Stored Column',
        minimized: false,
        storageOnlyMetadata: 42,
        tabIds: ['tab-one']
    }];
    const storage = createStorage({
        savedTabs: [{
            id: 'one',
            title: 'One',
            url: 'https://example.com',
            customTabData: { source: 'legacy' }
        }],
        columnState: originalColumns
    });
    const { service } = createService(storage, { now: () => 75 });
    const state = canonicalStateFromLegacy(storage.values.savedTabs, storage.values.columnState);
    const nextState = updateTab(state, 'one', { title: 'Updated' });

    await service.persist(nextState, { includeColumns: false });

    assert.deepEqual(storage.values.columnState, originalColumns);
    assert.deepEqual(storage.writes[0], {
        savedTabs: [{
            id: 'one',
            title: 'Updated',
            url: 'https://example.com',
            customTabData: { source: 'legacy' }
        }, { temp: 75 }]
    });
});

test('persistence and initialization surface storage failures', async () => {
    const writeFailure = new Error('storage quota exceeded');
    const storage = createStorage();
    storage.set = async () => {
        throw writeFailure;
    };
    const { service } = createService(storage);
    const state = canonicalStateFromLegacy([], []);

    await assert.rejects(service.persist(state), writeFailure);
    await assert.rejects(service.initialize(), writeFailure);
});

test('synchronizes external state changes and consumes background-only changes', async () => {
    const storage = createStorage({
        savedTabs: [{ id: 'one', title: 'One', url: 'https://example.com' }],
        columnState: [{ id: 'column-1', title: 'Column', tabIds: ['tab-one'] }],
        bgTabs: []
    });
    const { service, stateStore } = createService(storage);

    const stateResult = await service.synchronize({
        savedTabs: { oldValue: [], newValue: storage.values.savedTabs }
    });
    assert.equal(stateResult.type, 'state');
    assert.equal(getTab(stateStore.getState(), 'one').title, 'One');

    storage.values.bgTabs = [{
        id: 'two',
        title: 'Two',
        url: 'https://example.com/two'
    }];
    const backgroundResult = await service.synchronize({
        bgTabs: { oldValue: [], newValue: storage.values.bgTabs }
    });

    assert.equal(backgroundResult.type, 'background-tabs');
    assert.equal(backgroundResult.consumedBackgroundTabs, 1);
    assert.equal(getTab(stateStore.getState(), 'two').title, 'Two');
    assert.deepEqual(storage.values.bgTabs, []);
});

test('ignores unrelated and unchanged background storage events', async () => {
    const storage = createStorage();
    const { service } = createService(storage);

    assert.equal(await service.synchronize({ theme: { newValue: 'dark' } }), null);
    assert.equal(await service.synchronize({
        bgTabs: { oldValue: [], newValue: [] }
    }), null);
    assert.equal(storage.writes.length, 0);
});
