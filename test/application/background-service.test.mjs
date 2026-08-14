import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createBackgroundService,
    SAVE_TAB_MENU_ID
} from '../../src/application/background-service.mjs';
import {
    BACKGROUND_TABS_KEY,
    createBackgroundTabQueue
} from '../../src/application/background-tab-queue.mjs';

function createEvent() {
    const listeners = new Set();
    return {
        addListener(listener) {
            listeners.add(listener);
        },
        removeListener(listener) {
            listeners.delete(listener);
        },
        async emit(...args) {
            for (const listener of listeners) await listener(...args);
        }
    };
}

function createStorage(initial = {}) {
    const values = { ...initial };
    return {
        values,
        async get(keys) {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
                requested.filter(key => key in values).map(key => [key, values[key]])
            );
        },
        async set(updates) {
            Object.assign(values, updates);
        }
    };
}

function createBrowserApi(tabs = [], capabilities = {}) {
    const calls = [];
    return {
        calls,
        capabilities,
        runtime: { onInstalled: createEvent() },
        action: { onClicked: createEvent() },
        contextMenus: {
            onClicked: createEvent(),
            async create(properties) {
                calls.push(['menuCreate', properties]);
            },
            async update(menuId, changes) {
                calls.push(['menuUpdate', menuId, changes]);
            }
        },
        tabs: {
            onUpdated: createEvent(),
            onActivated: createEvent(),
            async get(tabId) {
                calls.push(['get', tabId]);
                return tabs.find(tab => tab.id === tabId);
            },
            async create(properties) {
                calls.push(['create', properties]);
            },
            async remove(tabId) {
                calls.push(['remove', tabId]);
            }
        }
    };
}

function createService(options = {}) {
    const browserApi = createBrowserApi(options.tabs || [], options.capabilities || {});
    const storage = createStorage(options.stored || {});
    let counter = 0;
    const queue = createBackgroundTabQueue({
        storage,
        idFactory: () => `id-${++counter}`
    });
    const errors = [];
    const service = createBackgroundService({
        browserApi,
        queue,
        onError: error => errors.push(error)
    });
    service.start();
    return { browserApi, errors, queue, service, storage };
}

test('requires a browser API and a queue', () => {
    assert.throws(
        () => createBackgroundService({ browserApi: {}, queue: { enqueue() {} } }),
        /tabs and contextMenus/
    );
    assert.throws(
        () => createBackgroundService({ browserApi: createBrowserApi(), queue: {} }),
        /background tab queue/
    );
});

test('creates the save menu hidden on install', async () => {
    const { browserApi } = createService();

    await browserApi.runtime.onInstalled.emit();

    assert.deepEqual(browserApi.calls, [
        [
            'menuCreate',
            {
                id: SAVE_TAB_MENU_ID,
                title: 'Save to Tabs Magic',
                contexts: ['page', 'selection'],
                visible: false
            }
        ]
    ]);
});

test('shows the save menu only on savable pages', async () => {
    const { browserApi } = createService({ tabs: [{ id: 3, url: 'about:blank' }] });

    await browserApi.tabs.onUpdated.emit(1, {}, { url: 'https://example.com' });
    await browserApi.tabs.onUpdated.emit(2, {}, { url: 'chrome://extensions' });
    await browserApi.tabs.onUpdated.emit(3, {}, {});
    await browserApi.tabs.onActivated.emit({ tabId: 3 });

    assert.deepEqual(browserApi.calls, [
        ['menuUpdate', SAVE_TAB_MENU_ID, { visible: true }],
        ['menuUpdate', SAVE_TAB_MENU_ID, { visible: false }],
        ['get', 3],
        ['menuUpdate', SAVE_TAB_MENU_ID, { visible: false }]
    ]);
});

test('offers to save a local file only where the browser can open one', async () => {
    const withoutFileUrls = createService();
    await withoutFileUrls.browserApi.tabs.onUpdated.emit(1, {}, { url: 'file:///home/notes.html' });
    assert.deepEqual(withoutFileUrls.browserApi.calls, [
        ['menuUpdate', SAVE_TAB_MENU_ID, { visible: false }]
    ]);

    const withFileUrls = createService({ capabilities: { fileUrls: true } });
    await withFileUrls.browserApi.tabs.onUpdated.emit(1, {}, { url: 'file:///home/notes.html' });
    assert.deepEqual(withFileUrls.browserApi.calls, [
        ['menuUpdate', SAVE_TAB_MENU_ID, { visible: true }]
    ]);
});

test('queues the clicked tab with its selection before closing it', async () => {
    const { browserApi, storage } = createService({
        tabs: [
            {
                id: 7,
                title: 'Example',
                url: 'https://example.com',
                favIconUrl: 'https://example.com/i.png'
            }
        ],
        stored: { [BACKGROUND_TABS_KEY]: [{ id: 'existing' }] }
    });

    await browserApi.contextMenus.onClicked.emit(
        { menuItemId: SAVE_TAB_MENU_ID, selectionText: 'noted' },
        { id: 7 }
    );

    assert.deepEqual(storage.values[BACKGROUND_TABS_KEY], [
        { id: 'existing' },
        {
            title: 'Example',
            url: 'https://example.com',
            favIconUrl: 'https://example.com/i.png',
            id: 'id-1',
            color: '#FFFFFF',
            note: 'noted'
        }
    ]);
    assert.deepEqual(browserApi.calls.at(-1), ['remove', 7]);
});

test('stores a null note when no text is selected and no queue exists yet', async () => {
    const { browserApi, storage } = createService({
        tabs: [{ id: 7, title: 'Example', url: 'https://example.com' }]
    });

    await browserApi.contextMenus.onClicked.emit({ menuItemId: SAVE_TAB_MENU_ID }, { id: 7 });

    assert.equal(storage.values[BACKGROUND_TABS_KEY].length, 1);
    assert.equal(storage.values[BACKGROUND_TABS_KEY][0].note, null);
});

test('ignores clicks on other context menu entries', async () => {
    const { browserApi, storage } = createService({
        tabs: [{ id: 7, url: 'https://example.com' }]
    });

    await browserApi.contextMenus.onClicked.emit({ menuItemId: 'other' }, { id: 7 });

    assert.deepEqual(browserApi.calls, []);
    assert.equal(storage.values[BACKGROUND_TABS_KEY], undefined);
});

test('reports failures instead of leaving rejections unhandled', async () => {
    const { browserApi, errors } = createService();
    browserApi.tabs.get = async () => {
        throw new Error('tab is gone');
    };

    await browserApi.contextMenus.onClicked.emit({ menuItemId: SAVE_TAB_MENU_ID }, { id: 7 });
    await browserApi.tabs.onActivated.emit({ tabId: 7 });

    assert.deepEqual(
        errors.map(error => error.message),
        ['tab is gone', 'tab is gone']
    );
});

test('opens the new tab page from the toolbar action', async () => {
    const { browserApi } = createService();

    await browserApi.action.onClicked.emit();

    assert.deepEqual(browserApi.calls, [['create', { url: 'newtab.html' }]]);
});
