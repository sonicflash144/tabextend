import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createBrowserApiAdapters,
    createBrowserApiFromGlobal,
    resolveWebExtensionApi,
    supportsSafariFileUrls,
    supportsFileUrls
} from '../../src/infrastructure/browser-api.mjs';

function createEvent() {
    const listeners = new Set();
    return {
        addListener(listener) {
            listeners.add(listener);
        },
        removeListener(listener) {
            listeners.delete(listener);
        },
        hasListener(listener) {
            return listeners.has(listener);
        }
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
                async get() {
                    return { ...values };
                },
                async set(updates) {
                    Object.assign(values, updates);
                },
                async remove(keys) {
                    (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
                },
                async clear() {
                    Object.keys(values).forEach(key => delete values[key]);
                }
            },
            onChanged: createEvent()
        },
        tabs: {
            async get(id) {
                return { id };
            },
            async query() {
                return [];
            },
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

test('distinguishes exposed file-tab URLs from Safari file navigation', () => {
    const chrome =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/131.0.0.0 Safari/537.36';
    const firefox =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0';
    const safari =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
        'Version/17.6 Safari/605.1.15';

    const webkit = 'AppleWebKit/537.36 (KHTML, like Gecko)';
    const family = {
        chrome,
        edge: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0`,
        opera: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0`,
        vivaldi: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} Chrome/131.0.0.0 Safari/537.36 Vivaldi/7.0`,
        // Brave ships the plain Chrome token deliberately.
        brave: chrome,
        // A Chromium-branded build carries no `Chrome/` token to match on.
        chromium: `Mozilla/5.0 (X11; Linux x86_64) ${webkit} Chromium/131.0.0.0 Safari/537.36`
    };

    Object.entries(family).forEach(([name, userAgent]) => {
        assert.equal(supportsFileUrls(userAgent), true, `${name} should allow local files`);
    });

    // Firefox blocks opening a local file in a tab, while Safari opens one but
    // returns an empty URL for it through the tabs API.
    assert.equal(supportsFileUrls(firefox), false);
    assert.equal(supportsFileUrls(safari), false);
    assert.equal(supportsSafariFileUrls(firefox), false);
    assert.equal(supportsSafariFileUrls(safari), true);
    // Chrome on iOS is WebKit: it runs no extension and could not open a local
    // file for one, so its agent must not be mistaken for Chromium.
    assert.equal(
        supportsFileUrls(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 ' +
                '(KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1'
        ),
        false
    );
    assert.equal(
        supportsSafariFileUrls(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 ' +
                '(KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1'
        ),
        false
    );
    // An unrecognised or absent agent hides local files rather than listing
    // ones it would then fail to open.
    assert.equal(supportsFileUrls(''), false);
    assert.equal(supportsFileUrls(undefined), false);
});

test('reports the file capability it read from the global scope', () => {
    const chrome =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/131.0.0.0 Safari/537.36';

    const api = createBrowserApiFromGlobal({
        chrome: createPromiseApi(),
        navigator: { userAgent: chrome }
    });
    assert.equal(api.capabilities.fileUrls, true);
    assert.equal(api.capabilities.fileUrlNavigation, true);
    assert.equal(api.capabilities.fileUrlContextMenu, true);
    assert.equal(api.capabilities.fileUrlAccessSetting, true);

    const safari =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.6 Safari/605.1.15';
    const safariApi = createBrowserApiFromGlobal({
        browser: createPromiseApi(),
        navigator: { userAgent: safari }
    });
    assert.equal(safariApi.capabilities.fileUrls, false);
    assert.equal(safariApi.capabilities.fileUrlNavigation, true);
    assert.equal(safariApi.capabilities.fileUrlContextMenu, true);
    assert.equal(safariApi.capabilities.fileUrlAccessSetting, false);

    const withoutNavigator = createBrowserApiFromGlobal({ browser: createPromiseApi() });
    assert.equal(withoutNavigator.capabilities.fileUrls, false);
    assert.equal(withoutNavigator.capabilities.fileUrlNavigation, false);
    assert.equal(withoutNavigator.capabilities.fileUrlContextMenu, false);
});
