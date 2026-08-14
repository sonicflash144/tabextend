import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createBrowserApiAdapters,
    createBrowserApiFromGlobal,
    resolveWebExtensionApi
} from '../../src/infrastructure/browser-api.mjs';

function createEvent() {
    const listeners = new Set();
    return {
        addListener(listener) { listeners.add(listener); },
        removeListener(listener) { listeners.delete(listener); },
        hasListener(listener) { return listeners.has(listener); }
    };
}

function createPromiseApi() {
    const values = { theme: 'dark' };
    return {
        runtime: {
            getManifest: () => ({ version: '1.0.0' }),
            onInstalled: createEvent()
        },
        storage: {
            local: {
                async get() { return { ...values }; },
                async set(updates) { Object.assign(values, updates); },
                async remove(keys) {
                    (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
                },
                async clear() { Object.keys(values).forEach(key => delete values[key]); }
            },
            onChanged: createEvent()
        },
        tabs: {
            async get(id) { return { id }; },
            async query() { return []; },
            onUpdated: createEvent(),
            onRemoved: createEvent(),
            onMoved: createEvent(),
            onActivated: createEvent()
        },
        contextMenus: { onClicked: createEvent() },
        action: { onClicked: createEvent() }
    };
}

test('resolves standard browser APIs before the Chrome compatibility namespace', () => {
    const browser = createPromiseApi();
    const chrome = { sentinel: true };
    assert.deepEqual(resolveWebExtensionApi({ browser, chrome }), {
        api: browser,
        apiStyle: 'promise'
    });
    assert.deepEqual(resolveWebExtensionApi({ chrome }), {
        api: chrome,
        apiStyle: 'callback'
    });
});

test('normalizes promise APIs while preserving callback consumers', async () => {
    const api = createBrowserApiFromGlobal({ browser: createPromiseApi() });

    await api.storage.local.set({ sidebarCollapsed: true });
    assert.deepEqual(await api.storage.local.get(null), {
        theme: 'dark',
        sidebarCollapsed: true
    });

    const callbackResult = await new Promise(resolve => {
        api.tabs.get(7, (tab, error) => resolve({ tab, error }));
    });
    assert.deepEqual(callbackResult, { tab: { id: 7 }, error: null });
    assert.equal(api.capabilities.tabGroups, false);
});

test('advertises tab grouping only when both required APIs are present', () => {
    const rawApi = createPromiseApi();
    rawApi.tabs.group = async () => 5;
    rawApi.tabGroups = { async update() {} };

    const api = createBrowserApiAdapters(rawApi, { apiStyle: 'promise' });
    assert.equal(api.capabilities.tabGroups, true);
});
