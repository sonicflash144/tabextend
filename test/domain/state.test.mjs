import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    CANONICAL_STATE_VERSION,
    canonicalStateFromLegacy,
    canonicalStateToLegacy,
    createStateStore,
    getTab,
    replaceColumnsFromLegacy,
    validateCanonicalState
} from '../../src/domain/state.mjs';

async function fixture(name) {
    const url = new URL(`../fixtures/exports/${name}`, import.meta.url);
    return JSON.parse(await readFile(url, 'utf8'));
}

test('converts legacy tab and subgroup tuples into explicit domain objects', async () => {
    const source = await fixture('legacy-wrapped-string.json');
    const data = source.exportedData;
    const state = canonicalStateFromLegacy(data.savedTabs, data.columnState);

    assert.equal(state.schemaVersion, CANONICAL_STATE_VERSION);
    assert.equal(state.tabs.size, 1);
    assert.equal(getTab(state, 'm4qzabc123').title, 'Current-style tab');
    assert.deepEqual(state.columns[0].items, [{ type: 'tab', tabId: 'm4qzabc123' }]);
    assert.equal(validateCanonicalState(state).valid, true);
});

test('round trips groups, ordering, metadata, and hyphenated ids', () => {
    const legacy = {
        savedTabs: [
            { id: 'id-with-hyphens', title: 'One', url: 'https://example.com/1' },
            { id: 'second', title: 'Two', url: 'https://example.com/2' }
        ],
        columnState: [{
            id: 'column-1',
            title: 'Column',
            emoji: '📚',
            minimized: true,
            recovered: true,
            tabIds: [[
                'group-1',
                'tab-id-with-hyphens',
                'tab-second',
                'Group title',
                true
            ]]
        }]
    };

    const roundTrip = canonicalStateToLegacy(canonicalStateFromLegacy(
        legacy.savedTabs,
        legacy.columnState
    ));

    assert.deepEqual(roundTrip, legacy);
});

test('excludes temp markers from memory and adds one only when requested', () => {
    const state = canonicalStateFromLegacy([
        { id: 'one', title: 'One', url: 'https://example.com' },
        { temp: 100 }
    ], []);

    assert.equal(state.tabs.size, 1);
    assert.deepEqual(canonicalStateToLegacy(state).savedTabs.map(tab => tab.id), ['one']);
    assert.deepEqual(canonicalStateToLegacy(state, { tempMarker: 200 }).savedTabs[1], { temp: 200 });
});

test('replaces columns while retaining canonical tab records', () => {
    const state = canonicalStateFromLegacy(
        [{ id: 'one', title: 'One', url: 'https://example.com' }],
        [{ id: 'old', title: 'Old', tabIds: ['tab-one'] }]
    );
    const updated = replaceColumnsFromLegacy(state, [
        { id: 'new', title: 'New', tabIds: ['tab-one'] }
    ]);

    assert.equal(getTab(updated, 'one').title, 'One');
    assert.equal(updated.columns[0].id, 'new');
});

test('canonical validation catches missing references', () => {
    const state = canonicalStateFromLegacy([], [
        { id: 'column', title: 'Column', tabIds: ['tab-missing'] }
    ]);
    const result = validateCanonicalState(state);

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /missing tab/);
});

test('canonical validation enforces complete and unique tab ordering', () => {
    const state = canonicalStateFromLegacy([
        { id: 'one', title: 'One', url: 'https://example.com/one' },
        { id: 'two', title: 'Two', url: 'https://example.com/two' }
    ], []);
    state.tabOrder = ['one', 'one', 'missing'];

    const result = validateCanonicalState(state);
    const errors = result.errors.join('\n');

    assert.equal(result.valid, false);
    assert.match(errors, /tabOrder contains duplicate id "one"/);
    assert.match(errors, /tabOrder\[2\] refers to missing tab "missing"/);
    assert.match(errors, /Tab "two" is missing from tabOrder/);
});

test('canonical validation enforces unique column and group identities', () => {
    const state = canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one' },
            { id: 'two', title: 'Two', url: 'https://example.com/two' }
        ],
        [
            {
                id: 'duplicate-column',
                title: 'First',
                tabIds: [['duplicate-group', 'tab-one', 'First group', false]]
            },
            {
                id: 'duplicate-column',
                title: 'Second',
                tabIds: [['duplicate-group', 'tab-two', 'Second group', false]]
            }
        ]
    );

    const result = validateCanonicalState(state);
    const errors = result.errors.join('\n');

    assert.equal(result.valid, false);
    assert.match(errors, /Duplicate column id "duplicate-column"/);
    assert.match(errors, /Duplicate group id "duplicate-group"/);
});

test('canonical validation rejects duplicate placements within and outside groups', () => {
    const state = canonicalStateFromLegacy(
        [
            { id: 'one', title: 'One', url: 'https://example.com/one' },
            { id: 'two', title: 'Two', url: 'https://example.com/two' }
        ],
        [{
            id: 'column-1',
            title: 'Column',
            tabIds: [
                'tab-one',
                ['group-1', 'tab-one', 'tab-two', 'tab-two', 'Group', false]
            ]
        }]
    );

    const result = validateCanonicalState(state);
    const errors = result.errors.join('\n');

    assert.equal(result.valid, false);
    assert.match(errors, /Tab "one" is placed more than once/);
    assert.match(errors, /contains duplicate tab "two"/);
    assert.match(errors, /Tab "two" is placed more than once/);
});

test('canonical validation reports malformed columns, items, and group tab lists', () => {
    const state = canonicalStateFromLegacy([], []);
    state.columns = [
        null,
        { id: 'column-1', items: [null, { type: 'group', id: 'group-1', tabIds: null }] }
    ];

    const result = validateCanonicalState(state);
    const errors = result.errors.join('\n');

    assert.equal(result.valid, false);
    assert.match(errors, /columns\[0\] must be an object/);
    assert.match(errors, /columns\[1\]\.items\[0\] must be an object/);
    assert.match(errors, /columns\[1\]\.items\[1\]\.tabIds must be an array/);
});

test('state store replaces legacy state and notifies subscribers', () => {
    const store = createStateStore();
    const seen = [];
    const unsubscribe = store.subscribe(state => seen.push(state.columns.length));

    store.replaceLegacy([], [{ id: 'one', title: 'One', tabIds: [] }]);
    unsubscribe();
    store.replaceLegacy([], []);

    assert.deepEqual(seen, [1]);
    assert.equal(store.getState().columns.length, 0);
});
