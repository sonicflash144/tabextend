import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyDrop } from '../../src/domain/drop-operations.mjs';
import { canonicalStateFromLegacy } from '../../src/domain/state.mjs';

function stateFixture() {
    return canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one' },
            { id: 'two', title: 'Two', url: 'https://example.com/two' },
            { id: 'three', title: 'Three', url: 'https://example.com/three' },
            { id: 'four', title: 'Four', url: 'https://example.com/four' }
        ],
        [
            {
                id: 'first',
                title: 'First',
                tabIds: ['tab-one', 'tab-two', ['group-a', 'tab-three', 'Group A', true]]
            },
            { id: 'second', title: 'Second', tabIds: ['tab-four'] }
        ]
    );
}

test('drops tabs between columns using the pre-removal drop index', () => {
    const initial = stateFixture();
    const result = applyDrop(initial, {
        dragged: [{ type: 'tab', tabId: 'one' }],
        target: { type: 'column', columnId: 'second', index: 0 }
    });

    assert.deepEqual(result.columns[0].items.map(item => item.type === 'tab' ? item.tabId : item.id), [
        'two',
        'group-a'
    ]);
    assert.deepEqual(result.columns[1].items.map(item => item.tabId), ['one', 'four']);
    assert.deepEqual(initial.columns[0].items[0], { type: 'tab', tabId: 'one' });
});

test('dropping tabs on a tab creates a group with the target first', () => {
    const result = applyDrop(stateFixture(), {
        dragged: [
            { type: 'tab', tabId: 'two' },
            { type: 'tab', tabId: 'four' }
        ],
        target: { type: 'item', item: { type: 'tab', tabId: 'one' } },
        groupIdFactory: () => 'group-new'
    });

    assert.deepEqual(result.columns[0].items[0], {
        type: 'group',
        id: 'group-new',
        tabIds: ['one', 'two', 'four'],
        title: 'New Group',
        expanded: true
    });
});

test('dropping one group on another merges tabs and keeps target metadata', () => {
    const source = canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one' },
            { id: 'two', title: 'Two', url: 'https://example.com/two' }
        ],
        [{
            id: 'column',
            title: 'Column',
            tabIds: [
                ['source', 'tab-one', 'Source title', false],
                ['target', 'tab-two', 'Target title', true]
            ]
        }]
    );
    source.columns[0].items[1].custom = 'keep';

    const result = applyDrop(source, {
        dragged: [{ type: 'group', groupId: 'source' }],
        target: { type: 'item', item: { type: 'group', groupId: 'target' } }
    });

    assert.deepEqual(result.columns[0].items, [{
        type: 'group',
        id: 'target',
        tabIds: ['two', 'one'],
        title: 'Target title',
        expanded: true,
        custom: 'keep'
    }]);
});

test('reorders tabs within a group and removes empty source groups', () => {
    const source = canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one' },
            { id: 'two', title: 'Two', url: 'https://example.com/two' },
            { id: 'three', title: 'Three', url: 'https://example.com/three' }
        ],
        [{
            id: 'column',
            title: 'Column',
            tabIds: [['group', 'tab-one', 'tab-two', 'tab-three', 'Group', true]]
        }]
    );

    const result = applyDrop(source, {
        dragged: [{ type: 'tab', tabId: 'one' }],
        target: { type: 'group', groupId: 'group', index: 2 }
    });

    assert.deepEqual(result.columns[0].items[0].tabIds, ['two', 'one', 'three']);

    const emptied = applyDrop(stateFixture(), {
        dragged: [{ type: 'tab', tabId: 'three' }],
        target: { type: 'column', columnId: 'second', index: 1 }
    });
    assert.equal(emptied.columns[0].items.some(item => item.id === 'group-a'), false);
});

test('moves a group intact to a new column', () => {
    const result = applyDrop(stateFixture(), {
        dragged: [{ type: 'group', groupId: 'group-a' }],
        target: { type: 'column', columnId: 'second', index: 1 }
    });

    assert.equal(result.columns[0].items.some(item => item.id === 'group-a'), false);
    assert.deepEqual(result.columns[1].items[1], {
        type: 'group',
        id: 'group-a',
        tabIds: ['three'],
        title: 'Group A',
        expanded: true
    });
});
