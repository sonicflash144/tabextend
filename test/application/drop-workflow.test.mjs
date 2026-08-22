import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDropWorkflow, navigableTabs } from '../../src/application/drop-workflow.mjs';
import {
    canonicalStateFromLegacy,
    createStateStore,
    getColumnTabs
} from '../../src/domain/state.mjs';

function stateFixture() {
    return canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one' },
            { id: 'two', title: 'Two', url: 'file:///home/two.html' },
            { id: 'three', title: 'Three', url: 'https://example.com/three' }
        ],
        [
            {
                id: 'first',
                title: 'First',
                tabIds: ['tab-one', ['group-a', 'tab-two', 'tab-three', 'Group A', true]]
            },
            { id: 'second', title: 'Second', tabIds: [] }
        ]
    );
}

function createHarness(options = {}) {
    const stateStore = createStateStore(options.state || stateFixture());
    const calls = [];
    const reports = [];
    let id = 0;
    const tabs = {
        async capture(browserTabIds) {
            calls.push(['capture', browserTabIds]);
            return browserTabIds.map(browserTabId => ({
                browserTabId,
                savedTab: {
                    id: `captured-${browserTabId}`,
                    title: `Captured ${browserTabId}`,
                    url: `https://captured.test/${browserTabId}`
                }
            }));
        },
        async close(browserTabIds) {
            calls.push(['close', browserTabIds]);
        },
        async move(browserTabId, index) {
            calls.push(['move', browserTabId, index]);
        },
        async openInBackground(url, index) {
            calls.push(['openInBackground', url, index]);
            if (options.refuseSingle === url) throw new Error('refused');
        },
        async openUrls(urls, openOptions) {
            calls.push(['openUrls', urls, openOptions]);
            if (options.openUrlsError) throw options.openUrlsError;
            const refusedUrls = new Set(options.refusedUrls || []);
            return {
                opened: urls
                    .filter(url => !refusedUrls.has(url))
                    .map(url => ({ url, tab: { id: url } })),
                refused: urls
                    .filter(url => refusedUrls.has(url))
                    .map(url => ({ url, error: new Error('refused') }))
            };
        }
    };
    const persist = (nextState, persistOptions) => {
        calls.push(['persist', nextState, persistOptions]);
        stateStore.replace(nextState);
        return nextState;
    };
    const workflow = createDropWorkflow({
        stateStore,
        persist,
        tabs,
        reportOpenFailure: (...args) => reports.push(args),
        idFactory: () => `id-${++id}`,
        createColumn: () => ({
            id: 'new-column',
            title: 'New Column',
            minimized: false,
            emoji: '🍏',
            items: []
        })
    });
    return { calls, reports, stateStore, tabs, workflow };
}

test('requires state, persistence, tabs, failures, ids, and a column factory', () => {
    const required = {
        stateStore: createStateStore(),
        persist: () => {},
        tabs: { capture() {} },
        reportOpenFailure: () => {},
        idFactory: () => 'id',
        createColumn: () => ({})
    };

    Object.keys(required).forEach(key => {
        const options = { ...required };
        delete options[key];
        assert.throws(() => createDropWorkflow(options));
    });
});

test('navigable tabs retain safe web and local-file URLs', () => {
    assert.deepEqual(
        navigableTabs([
            { id: 'web', url: 'https://example.com' },
            { id: 'file', url: 'file:///home/notes.html' },
            { id: 'unsafe', url: 'javascript:alert(1)' }
        ]).map(entry => entry.tab.id),
        ['web', 'file']
    );
});

test('captures open tabs, drops stable identities, persists, and then closes them', async () => {
    const { calls, stateStore, workflow } = createHarness();

    await workflow.apply({
        type: 'column',
        dragged: [
            { type: 'open-tab', browserTabId: 42 },
            { type: 'tab', tabId: 'one' }
        ],
        columnId: 'second',
        index: 0
    });

    assert.deepEqual(
        getColumnTabs(stateStore.getState(), 'second').map(tab => tab.id),
        ['captured-42', 'one']
    );
    assert.deepEqual(
        calls.map(call => call[0]),
        ['capture', 'persist', 'close']
    );
    assert.deepEqual(calls[2], ['close', [42]]);
});

test('deletes saved tabs, groups, and browser tabs in one resolved request', async () => {
    const { calls, stateStore, workflow } = createHarness();

    await workflow.apply({
        type: 'delete-items',
        dragged: [
            { type: 'tab', tabId: 'one' },
            { type: 'group', groupId: 'group-a' },
            { type: 'open-tab', browserTabId: 7 }
        ]
    });

    assert.deepEqual(stateStore.getState().tabOrder, []);
    assert.deepEqual(calls.at(-1), ['close', [7]]);
});

test('a partially reopened group retains only the tab the browser refused', async () => {
    const refusedUrl = 'file:///home/two.html';
    const { calls, reports, stateStore, workflow } = createHarness({
        refusedUrls: [refusedUrl]
    });

    await workflow.apply({
        type: 'open-tabs',
        dragged: [{ type: 'group', groupId: 'group-a' }],
        index: 3
    });

    const group = stateStore.getState().columns[0].items.find(item => item.type === 'group');
    assert.deepEqual(group.tabIds, ['two']);
    assert.deepEqual(calls[0], [
        'openUrls',
        [refusedUrl, 'https://example.com/three'],
        { index: 3, groupTitle: 'Group A' }
    ]);
    assert.deepEqual(reports[0].slice(0, 1), ['Could not open saved tabs:']);
    assert.deepEqual(reports[0][2], [refusedUrl]);
});

test('a refused individual reopen stays on the board', async () => {
    const url = 'https://example.com/one';
    const { reports, stateStore, workflow } = createHarness({ refuseSingle: url });

    await workflow.apply({
        type: 'open-tabs',
        dragged: [{ type: 'tab', tabId: 'one' }],
        index: 1
    });

    assert.ok(stateStore.getState().tabs.has('one'));
    assert.deepEqual(reports[0][2], [url]);
});

test('column changes preserve their targeted persistence behavior', async () => {
    const { calls, stateStore, workflow } = createHarness();

    await workflow.apply({ type: 'move-column', columnId: 'second', index: 0 });
    assert.deepEqual(
        stateStore.getState().columns.map(column => column.id),
        ['second', 'first']
    );
    assert.deepEqual(calls[0][2], { includeTabs: false });

    await workflow.apply({ type: 'delete-column', columnId: 'second' });
    assert.deepEqual(
        stateStore.getState().columns.map(column => column.id),
        ['first']
    );
});

test('a new-column drop uses the injected column factory', async () => {
    const { stateStore, workflow } = createHarness();

    await workflow.apply({
        type: 'new-column',
        dragged: [{ type: 'tab', tabId: 'one' }]
    });

    const column = stateStore.getState().columns.at(-1);
    assert.equal(column.id, 'new-column');
    assert.equal(column.emoji, '🍏');
    assert.deepEqual(column.items, [{ type: 'tab', tabId: 'one' }]);
});
