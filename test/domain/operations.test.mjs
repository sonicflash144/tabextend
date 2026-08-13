import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalStateFromLegacy } from '../../src/domain/state.mjs';
import {
    addColumn,
    addTabs,
    createGroup,
    moveColumn,
    removeColumn,
    removeGroup,
    removeTabs,
    ungroup,
    updateColumn,
    updateGroup,
    updateTab
} from '../../src/domain/operations.mjs';

function stateFixture() {
    return canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one', custom: 'keep' },
            { id: 'two', title: 'Two', url: 'https://example.com/two' },
            { id: 'three', title: 'Three', url: 'https://example.com/three' }
        ],
        [
            {
                id: 'first',
                title: 'First',
                customColumn: true,
                tabIds: ['tab-one', ['group-a', 'tab-two', 'Group A', true]]
            },
            { id: 'second', title: 'Second', tabIds: ['tab-three'] }
        ]
    );
}

test('tab operations add, update, and remove records without mutating prior state', () => {
    const initial = stateFixture();
    const added = addTabs(initial, [
        { id: 'four', title: 'Four', url: 'https://example.com/four', extra: 4 }
    ]);
    const updated = updateTab(added, 'one', { title: 'Renamed' });
    const removed = removeTabs(updated, ['two']);

    assert.equal(initial.tabs.has('four'), false);
    assert.equal(initial.tabs.get('one').title, 'One');
    assert.equal(updated.tabs.get('one').title, 'Renamed');
    assert.equal(updated.tabs.get('one').custom, 'keep');
    assert.equal(removed.tabs.has('two'), false);
    assert.deepEqual(removed.tabOrder, ['one', 'three', 'four']);
    assert.deepEqual(removed.columns[0].items, [{ type: 'tab', tabId: 'one' }]);
});

test('column operations preserve metadata while adding, updating, moving, and deleting', () => {
    const initial = stateFixture();
    const added = addColumn(initial, {
        id: 'middle',
        title: 'Middle',
        emoji: '🍏',
        customColumn: 'preserve',
        items: []
    }, 1);
    const updated = updateColumn(added, 'middle', { title: 'Updated', minimized: true });
    const moved = moveColumn(updated, 'middle', 0);
    const removed = removeColumn(moved, 'first', { deleteTabs: true });

    assert.deepEqual(initial.columns.map(column => column.id), ['first', 'second']);
    assert.deepEqual(moved.columns.map(column => column.id), ['middle', 'first', 'second']);
    assert.equal(moved.columns[0].customColumn, 'preserve');
    assert.equal(moved.columns[0].title, 'Updated');
    assert.equal(moved.columns[0].minimized, true);
    assert.equal(removed.tabs.has('one'), false);
    assert.equal(removed.tabs.has('two'), false);
    assert.deepEqual(removed.columns.map(column => column.id), ['middle', 'second']);
});

test('group operations create, update, ungroup, and remove groups as pure transformations', () => {
    const initial = stateFixture();
    const created = createGroup(initial, 'second', 0, {
        id: 'group-b',
        tabIds: ['one', 'three'],
        title: 'Group B',
        expanded: false,
        metadata: 'keep'
    });
    const updated = updateGroup(created, 'group-b', { title: 'Updated group', expanded: true });
    const ungrouped = ungroup(updated, 'group-b');
    const removed = removeGroup(updated, 'group-b', { deleteTabs: true });

    assert.deepEqual(created.columns[1].items, [{
        type: 'group',
        id: 'group-b',
        tabIds: ['one', 'three'],
        title: 'Group B',
        expanded: false,
        metadata: 'keep'
    }]);
    assert.equal(updated.columns[1].items[0].metadata, 'keep');
    assert.deepEqual(ungrouped.columns[1].items, [
        { type: 'tab', tabId: 'one' },
        { type: 'tab', tabId: 'three' }
    ]);
    assert.equal(removed.tabs.has('one'), false);
    assert.equal(removed.tabs.has('three'), false);
    assert.equal(initial.columns[0].items[0].tabId, 'one');
});

