import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTabsRepository } from '../../src/infrastructure/tabs-repository.mjs';

function createBrowserApi(options = {}) {
    const { tabGroups: supportsGroups = true } = options;
    const calls = [];
    let nextTabId = 1;

    const api = {
        capabilities: { tabGroups: supportsGroups },
        tabs: {
            async create(createProperties) {
                calls.push(['create', createProperties]);
                return { id: nextTabId++, ...createProperties };
            },
            async group(groupOptions) {
                calls.push(['group', groupOptions]);
                return 42;
            },
            async remove(tabIds) { calls.push(['remove', tabIds]); },
            async update(tabId, changes) { calls.push(['update', tabId, changes]); },
            async query(queryInfo) {
                calls.push(['query', queryInfo]);
                return queryInfo.active ? [{ id: 9 }] : [];
            }
        },
        tabGroups: {
            async update(groupId, changes) { calls.push(['groupUpdate', groupId, changes]); }
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

    const created = await repository.openUrls(['https://a.test', 'https://b.test'], {
        index: 3,
        groupTitle: 'Reading'
    });

    assert.deepEqual(created.map(tab => tab.index), [3, 4]);
    assert.deepEqual(calls[0], ['create', { url: 'https://a.test', active: false, index: 3 }]);
    assert.deepEqual(calls[2], ['group', { tabIds: [1, 2] }]);
    assert.deepEqual(calls[3], ['groupUpdate', 42, { title: 'Reading' }]);
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

    assert.deepEqual(await repository.openUrls([]), []);
    assert.deepEqual(await repository.openUrls([null, undefined]), []);
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
