import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTabsRepository } from '../../src/infrastructure/tabs-repository.mjs';

function createBrowserApi(options = {}) {
    const { tabGroups: supportsGroups = true, refuse = () => false } = options;
    const calls = [];
    let nextTabId = 1;

    const api = {
        capabilities: { tabGroups: supportsGroups },
        tabs: {
            async create(createProperties) {
                calls.push(['create', createProperties]);
                if (refuse(createProperties.url)) {
                    throw new Error('Cannot navigate to a file URL without local file access');
                }
                return { id: nextTabId++, ...createProperties };
            },
            async group(groupOptions) {
                calls.push(['group', groupOptions]);
                return 42;
            },
            async remove(tabIds) {
                calls.push(['remove', tabIds]);
            },
            async update(tabId, changes) {
                calls.push(['update', tabId, changes]);
            },
            async query(queryInfo) {
                calls.push(['query', queryInfo]);
                return queryInfo.active ? [{ id: 9 }] : [];
            }
        },
        tabGroups: {
            async update(groupId, changes) {
                calls.push(['groupUpdate', groupId, changes]);
            }
        }
    };
    return { api, calls };
}

test('requires a tabs API', () => {
    assert.throws(() => createTabsRepository({}), /tabs API is required/);
});

test('opens urls at an index and groups them with a title', async () => {
    const { api, calls } = createBrowserApi();
    const repository = createTabsRepository(api);

    const { opened, refused } = await repository.openUrls(['https://a.test', 'https://b.test'], {
        index: 3,
        groupTitle: 'Reading'
    });

    assert.deepEqual(
        opened.map(result => result.tab.index),
        [3, 4]
    );
    assert.deepEqual(refused, []);
    assert.deepEqual(calls[0], ['create', { url: 'https://a.test', active: false, index: 3 }]);
    assert.deepEqual(calls[2], ['group', { tabIds: [1, 2] }]);
    assert.deepEqual(calls[3], ['groupUpdate', 42, { title: 'Reading' }]);
});

test('reports a refused url without abandoning the ones that opened', async () => {
    const { api, calls } = createBrowserApi({ refuse: url => url.startsWith('file://') });
    const repository = createTabsRepository(api);

    const { opened, refused } = await repository.openUrls(
        ['https://a.test', 'file:///home/notes.html', 'https://b.test'],
        { index: 3, groupTitle: 'Reading' }
    );

    // The refusal is reported per URL rather than rejecting the whole batch.
    assert.deepEqual(
        opened.map(result => result.url),
        ['https://a.test', 'https://b.test']
    );
    assert.deepEqual(
        refused.map(result => result.url),
        ['file:///home/notes.html']
    );
    assert.match(refused[0].error.message, /without local file access/);

    // What did open is still collected into the titled group.
    assert.deepEqual(calls[3], ['group', { tabIds: [1, 2] }]);
    assert.deepEqual(calls[4], ['groupUpdate', 42, { title: 'Reading' }]);
});

test('groups nothing when every url is refused', async () => {
    const { api, calls } = createBrowserApi({ refuse: () => true });
    const repository = createTabsRepository(api);

    const { opened, refused } = await repository.openUrls(['file:///home/notes.html']);

    assert.deepEqual(opened, []);
    assert.equal(refused.length, 1);
    assert.deepEqual(
        calls.map(call => call[0]),
        ['create']
    );
});

test('omits the index when none is requested and never groups without support', async () => {
    const { api, calls } = createBrowserApi({ tabGroups: false });
    const repository = createTabsRepository(api);

    await repository.openUrls(['https://a.test'], { groupTitle: 'Reading' });

    assert.deepEqual(calls, [['create', { url: 'https://a.test', active: false }]]);
});

test('ignores empty url lists', async () => {
    const { api, calls } = createBrowserApi();
    const repository = createTabsRepository(api);

    assert.deepEqual(await repository.openUrls([]), { opened: [], refused: [] });
    assert.deepEqual(await repository.openUrls([null, undefined]), { opened: [], refused: [] });
    assert.deepEqual(calls, []);
});

test('reads the active tab of the current window', async () => {
    const { api, calls } = createBrowserApi();
    const repository = createTabsRepository(api);

    assert.deepEqual(await repository.queryActiveTab(), { id: 9 });
    assert.deepEqual(calls[0], ['query', { active: true, currentWindow: true }]);
});

test('activates tabs through the update boundary', async () => {
    const { api, calls } = createBrowserApi();
    await createTabsRepository(api).activate(4);
    assert.deepEqual(calls, [['update', 4, { active: true }]]);
});
