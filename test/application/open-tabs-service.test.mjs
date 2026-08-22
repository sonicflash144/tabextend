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

function createBrowserApiStub(options = {}) {
    const calls = [];
    const openTabs = options.tabs || [];
    const onUpdated = createEvent();
    const onRemoved = createEvent();
    const onMoved = createEvent();
    let nextTabId = 1;
    const api = {
        capabilities: options.capabilities || {},
        tabs: {
            onUpdated,
            onRemoved,
            onMoved,
            async query(queryInfo) {
                calls.push(['query', queryInfo]);
                if (queryInfo.active) {
                    const activeTab =
                        options.activeTab === undefined ? { id: 99 } : options.activeTab;
                    return activeTab ? [activeTab] : [];
                }
                return openTabs;
            },
            async get(tabId) {
                calls.push(['get', tabId]);
                return openTabs.find(tab => tab.id === tabId);
            },
            async remove(tabIds) {
                calls.push(['remove', tabIds]);
            },
            async update(tabId, changes) {
                calls.push(['update', tabId, changes]);
            },
            async move(tabId, moveProperties) {
                calls.push(['move', tabId, moveProperties]);
            },
            async create(createProperties) {
                calls.push(['create', createProperties]);
                if (options.refuse?.(createProperties.url)) {
                    throw new Error('Cannot navigate to a file URL without local file access');
                }
                return { id: nextTabId++, ...createProperties };
            },
            async group(groupOptions) {
                calls.push(['group', groupOptions]);
                return 42;
            }
        },
        tabGroups: {
            async update(groupId, changes) {
                calls.push(['groupUpdate', groupId, changes]);
            }
        }
    };
    return {
        api,
        calls,
        onUpdated,
        onRemoved,
        onMoved
    };
}

function createService(options = {}) {
    const tabs = createBrowserApiStub(options);
    let counter = 0;
    return {
        tabs,
        service: createOpenTabsService({
            browserApi: tabs.api,
            idFactory: () => `id-${++counter}`
        })
    };
}

test('requires a tabs API and an id factory', () => {
    assert.throws(() => createOpenTabsService({ idFactory: () => 'id' }), /tabs API/);
    assert.throws(
        () => createOpenTabsService({ browserApi: createBrowserApiStub().api }),
        /id factory/
    );
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

    assert.deepEqual(tabs.calls, [
        ['query', { active: true, currentWindow: true }],
        ['remove', 7],
        ['update', 99, { active: true }]
    ]);
});

test('closes a tab even when the window reports no active tab', async () => {
    const { service, tabs } = createService({ activeTab: null });

    await service.closeKeepingFocus(7);

    assert.deepEqual(tabs.calls, [
        ['query', { active: true, currentWindow: true }],
        ['remove', 7]
    ]);
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

test('opens urls at an index and groups them with a title', async () => {
    const { service, tabs } = createService({ capabilities: { tabGroups: true } });

    const { opened, refused } = await service.openUrls(['https://a.test', 'https://b.test'], {
        index: 3,
        groupTitle: 'Reading'
    });

    assert.deepEqual(
        opened.map(result => result.tab.index),
        [3, 4]
    );
    assert.deepEqual(refused, []);
    assert.deepEqual(tabs.calls[0], ['create', { url: 'https://a.test', active: false, index: 3 }]);
    assert.deepEqual(tabs.calls[2], ['group', { tabIds: [1, 2] }]);
    assert.deepEqual(tabs.calls[3], ['groupUpdate', 42, { title: 'Reading' }]);
});

test('reports a refused url without abandoning the ones that opened', async () => {
    const { service, tabs } = createService({
        capabilities: { tabGroups: true },
        refuse: url => url.startsWith('file://')
    });

    const { opened, refused } = await service.openUrls(
        ['https://a.test', 'file:///home/notes.html', 'https://b.test'],
        { index: 3, groupTitle: 'Reading' }
    );

    assert.deepEqual(
        opened.map(result => result.url),
        ['https://a.test', 'https://b.test']
    );
    assert.deepEqual(
        refused.map(result => result.url),
        ['file:///home/notes.html']
    );
    assert.match(refused[0].error.message, /without local file access/);
    assert.deepEqual(tabs.calls[3], ['group', { tabIds: [1, 2] }]);
    assert.deepEqual(tabs.calls[4], ['groupUpdate', 42, { title: 'Reading' }]);
});

test('groups nothing when every url is refused', async () => {
    const { service, tabs } = createService({
        capabilities: { tabGroups: true },
        refuse: () => true
    });

    const { opened, refused } = await service.openUrls(['file:///home/notes.html']);

    assert.deepEqual(opened, []);
    assert.equal(refused.length, 1);
    assert.deepEqual(
        tabs.calls.map(call => call[0]),
        ['create']
    );
});

test('omits the index when none is requested and never groups without support', async () => {
    const { service, tabs } = createService();

    await service.openUrls(['https://a.test'], { groupTitle: 'Reading' });

    assert.deepEqual(tabs.calls, [['create', { url: 'https://a.test', active: false }]]);
});

test('ignores empty url lists', async () => {
    const { service, tabs } = createService({ capabilities: { tabGroups: true } });

    assert.deepEqual(await service.openUrls([]), { opened: [], refused: [] });
    assert.deepEqual(await service.openUrls([null, undefined]), { opened: [], refused: [] });
    assert.deepEqual(tabs.calls, []);
});

test('activates tabs through the update boundary', async () => {
    const { service, tabs } = createService();

    await service.activate(4);

    assert.deepEqual(tabs.calls, [['update', 4, { active: true }]]);
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
