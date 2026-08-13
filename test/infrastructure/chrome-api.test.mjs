import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createChromeApiAdapters
} from '../../src/infrastructure/chrome-api.mjs';
import { createStorageRepository } from '../../src/infrastructure/storage-repository.mjs';

function createEvent() {
    const listeners = new Set();
    return {
        addListener(listener) { listeners.add(listener); },
        removeListener(listener) { listeners.delete(listener); },
        hasListener(listener) { return listeners.has(listener); },
        emit(...args) { listeners.forEach(listener => listener(...args)); }
    };
}

function createFakeChrome() {
    const values = { theme: 'dark' };
    const runtime = {
        lastError: null,
        getManifest: () => ({ version: '1.2.3' }),
        onInstalled: createEvent()
    };
    const local = {
        get(keys, callback) {
            const selected = {};
            const requested = keys === null ? Object.keys(values) : Array.isArray(keys) ? keys : [keys];
            requested.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(values, key)) selected[key] = values[key];
            });
            callback(selected);
        },
        set(updates, callback) {
            Object.assign(values, updates);
            callback();
        },
        remove(keys, callback) {
            (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
            callback();
        },
        clear(callback) {
            Object.keys(values).forEach(key => delete values[key]);
            callback();
        }
    };
    const tabs = {
        get(id, callback) { callback({ id, title: `Tab ${id}` }); },
        query(queryInfo, callback) { callback([{ id: 10, queryInfo }]); },
        create(properties, callback) { callback({ id: 11, ...properties }); },
        remove(ids, callback) { callback(); },
        update(id, properties, callback) { callback({ id, ...properties }); },
        move(id, properties, callback) { callback({ id, ...properties }); },
        group(properties, callback) { callback(42); },
        onUpdated: createEvent(),
        onRemoved: createEvent(),
        onMoved: createEvent(),
        onActivated: createEvent()
    };
    return {
        runtime,
        storage: { local, onChanged: createEvent() },
        tabs,
        tabGroups: { update(id, properties, callback) { callback({ id, ...properties }); } },
        contextMenus: {
            create(properties, callback) { callback(properties.id); },
            update(id, properties, callback) { callback({ id, ...properties }); },
            onClicked: createEvent()
        },
        action: { onClicked: createEvent() },
        values
    };
}

test('storage repository supports promise reads and writes', async () => {
    const chromeApi = createFakeChrome();
    const repository = createStorageRepository(chromeApi);

    await repository.set({ sidebarCollapsed: true });
    assert.deepEqual(await repository.get(['theme', 'sidebarCollapsed']), {
        theme: 'dark',
        sidebarCollapsed: true
    });
    await repository.remove('theme');
    assert.deepEqual(await repository.get(null), { sidebarCollapsed: true });
});

test('storage repository preserves callback compatibility', async () => {
    const repository = createStorageRepository(createFakeChrome());
    const result = await new Promise(resolve => {
        repository.get('theme', (data, error) => resolve({ data, error }));
    });

    assert.deepEqual(result.data, { theme: 'dark' });
    assert.equal(result.error, null);
});

test('promise API rejects chrome.runtime.lastError', async () => {
    const chromeApi = createFakeChrome();
    chromeApi.storage.local.get = (keys, callback) => {
        chromeApi.runtime.lastError = { message: 'storage unavailable' };
        callback({});
        chromeApi.runtime.lastError = null;
    };
    const repository = createStorageRepository(chromeApi);

    await assert.rejects(repository.get('theme'), /storage unavailable/);
});

test('callback API reports errors without exposing runtime.lastError', async () => {
    const chromeApi = createFakeChrome();
    chromeApi.tabs.query = (queryInfo, callback) => {
        chromeApi.runtime.lastError = { message: 'tabs unavailable' };
        callback([]);
        chromeApi.runtime.lastError = null;
    };
    const api = createChromeApiAdapters(chromeApi);
    const result = await new Promise(resolve => {
        api.tabs.query({}, (tabs, error) => resolve({ tabs, error }));
    });

    assert.deepEqual(result.tabs, []);
    assert.match(result.error.message, /tabs unavailable/);
});

test('tab and tab-group adapters preserve arguments and results', async () => {
    const api = createChromeApiAdapters(createFakeChrome());

    assert.deepEqual(await api.tabs.get(7), { id: 7, title: 'Tab 7' });
    assert.deepEqual(await api.tabs.create({ url: 'https://example.com' }), {
        id: 11,
        url: 'https://example.com'
    });
    assert.equal(await api.tabs.group({ tabIds: [10, 11] }), 42);
    assert.deepEqual(await api.tabGroups.update(42, { title: 'Group' }), {
        id: 42,
        title: 'Group'
    });
});

test('event adapters subscribe and unsubscribe listeners', () => {
    const chromeApi = createFakeChrome();
    const api = createChromeApiAdapters(chromeApi);
    let calls = 0;
    const listener = () => { calls += 1; };

    api.tabs.onUpdated.addListener(listener);
    chromeApi.tabs.onUpdated.emit(1, {}, {});
    assert.equal(calls, 1);
    assert.equal(api.tabs.onUpdated.hasListener(listener), true);
    api.tabs.onUpdated.removeListener(listener);
    chromeApi.tabs.onUpdated.emit(1, {}, {});
    assert.equal(calls, 1);
});

test('runtime adapter exposes manifest data', () => {
    const api = createChromeApiAdapters(createFakeChrome());
    assert.equal(api.runtime.getManifest().version, '1.2.3');
});
