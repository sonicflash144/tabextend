import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createOpenTabsService } from '../../src/application/open-tabs-service.mjs';

function createEvent() {
    const listeners = new Set();
    return {
        listeners,
        addListener(listener) {
            listeners.add(listener);
        },
        removeListener(listener) {
            listeners.delete(listener);
        },
        emit(...args) {
            listeners.forEach(listener => listener(...args));
        }
    };
}

function createTabsRepositoryStub(options = {}) {
    const calls = [];
    const tabs = options.tabs || [];
    return {
        calls,
        capabilities: options.capabilities || {},
        onUpdated: createEvent(),
        onRemoved: createEvent(),
        onMoved: createEvent(),
        async query(queryInfo) {
            calls.push(['query', queryInfo]);
            return tabs;
        },
        async get(tabId) {
            calls.push(['get', tabId]);
            return tabs.find(tab => tab.id === tabId);
        },
        async queryActiveTab() {
            calls.push(['queryActiveTab']);
            return options.activeTab === undefined ? { id: 99 } : options.activeTab;
        },
        async remove(tabIds) {
            calls.push(['remove', tabIds]);
        },
        async activate(tabId) {
            calls.push(['activate', tabId]);
        },
        async move(tabId, moveProperties) {
            calls.push(['move', tabId, moveProperties]);
        },
        async create(createProperties) {
            calls.push(['create', createProperties]);
        },
        async openUrls(urls, openOptions) {
            calls.push(['openUrls', urls, openOptions]);
        }
    };
}

function createService(options = {}) {
    const tabs = createTabsRepositoryStub(options);
    let counter = 0;
    return {
        tabs,
        service: createOpenTabsService({ tabs, idFactory: () => `id-${++counter}` })
    };
}

test('requires a tabs repository and an id factory', () => {
    assert.throws(() => createOpenTabsService({ idFactory: () => 'id' }), /tabs repository/);
    assert.throws(() => createOpenTabsService({ tabs: createTabsRepositoryStub() }), /id factory/);
});

test('lists only listable tabs of the current window', async () => {
    const { service, tabs } = createService({
        tabs: [
            { id: 1, url: 'https://example.com' },
            { id: 2, url: 'chrome://extensions' }
        ]
    });

    assert.deepEqual(
        (await service.list()).map(tab => tab.id),
        [1]
    );
    assert.deepEqual(tabs.calls[0], ['query', { currentWindow: true }]);
});

test('lists local files only where the browser can open them', async () => {
    const openTabs = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'file:///home/notes.html' }
    ];

    const withoutFileUrls = createService({ tabs: openTabs });
    assert.deepEqual(
        (await withoutFileUrls.service.list()).map(tab => tab.id),
        [1]
    );

    const withFileUrls = createService({
        tabs: openTabs,
        capabilities: { fileUrls: true }
    });
    assert.deepEqual(
        (await withFileUrls.service.list()).map(tab => tab.id),
        [1, 2]
    );
});

test('captures open tabs as stored tabs without closing them', async () => {
    const { service, tabs } = createService({
        tabs: [
            { id: 4, title: 'A', url: 'https://a.test', favIconUrl: 'https://a.test/i.png' },
            { id: 5, title: 'B', url: 'https://b.test' }
        ]
    });

    const captured = await service.capture([4, 5]);

    assert.deepEqual(captured, [
        {
            browserTabId: 4,
            savedTab: {
                title: 'A',
                url: 'https://a.test',
                favIconUrl: 'https://a.test/i.png',
                id: 'id-1',
                color: '#FFFFFF'
            }
        },
        {
            browserTabId: 5,
            savedTab: {
                title: 'B',
                url: 'https://b.test',
                favIconUrl: 'https://www.google.com/s2/favicons?domain=b.test&sz=32',
                id: 'id-2',
                color: '#FFFFFF'
            }
        }
    ]);
    assert.equal(
        tabs.calls.some(call => call[0] === 'remove'),
        false
    );
});

test('closes tabs in one call and skips empty requests', async () => {
    const { service, tabs } = createService();

    await service.close([1, 2]);
    await service.close(3);
    await service.close([]);

    assert.deepEqual(tabs.calls, [
        ['remove', [1, 2]],
        ['remove', [3]]
    ]);
});

test('restores focus to the active tab after closing another tab', async () => {
    const { service, tabs } = createService();

    await service.closeKeepingFocus(7);

    assert.deepEqual(tabs.calls, [['queryActiveTab'], ['remove', 7], ['activate', 99]]);
});

test('closes a tab even when the window reports no active tab', async () => {
    const { service, tabs } = createService({ activeTab: null });

    await service.closeKeepingFocus(7);

    assert.deepEqual(tabs.calls, [['queryActiveTab'], ['remove', 7]]);
});

test('opens a single stored tab in the background without grouping it', async () => {
    const { service, tabs } = createService();

    await service.openInBackground('https://a.test', 2);
    await service.openInBackground('https://b.test');

    assert.deepEqual(tabs.calls, [
        ['create', { url: 'https://a.test', active: false, index: 2 }],
        ['create', { url: 'https://b.test', active: false }]
    ]);
});

test('refreshes on tab changes and delays only removals when asked', () => {
    const { service, tabs } = createService();
    const scheduled = [];
    let refreshes = 0;

    const stop = service.onChanged(
        () => {
            refreshes += 1;
        },
        {
            removalDelay: 150,
            schedule: (callback, delay) => scheduled.push([callback, delay])
        }
    );

    tabs.onUpdated.emit();
    tabs.onMoved.emit();
    assert.equal(refreshes, 2);

    tabs.onRemoved.emit();
    assert.equal(refreshes, 2);
    assert.equal(scheduled[0][1], 150);
    scheduled[0][0]();
    assert.equal(refreshes, 3);

    stop();
    tabs.onUpdated.emit();
    tabs.onRemoved.emit();
    tabs.onMoved.emit();
    assert.equal(refreshes, 3);
});

test('refreshes removals immediately when no delay is configured', () => {
    const { service, tabs } = createService();
    let refreshes = 0;

    service.onChanged(() => {
        refreshes += 1;
    });
    tabs.onRemoved.emit();

    assert.equal(refreshes, 1);
});
