import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    CURRENT_EXPORT_FORMAT_VERSION,
    migrateToUniqueIds,
    prepareImportData,
    recoverOrphanedTabs,
    unwrapExport,
    validateExport,
    validateLegacyData
} from '../../src/compatibility/legacy-data.mjs';

const fixtureUrl = name => new URL(`../fixtures/exports/${name}`, import.meta.url);

async function readFixture(name) {
    return JSON.parse(await readFile(fixtureUrl(name), 'utf8'));
}

test('accepts an unwrapped historical export with numeric ids', async () => {
    const candidate = await readFixture('legacy-raw-numeric.json');
    const result = validateExport(candidate);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.metadata.wrapped, false);
    assert.equal(result.metadata.formatVersion, 0);
});

test('accepts the existing wrapped export shape and temp marker', async () => {
    const candidate = await readFixture('legacy-wrapped-string.json');
    const result = validateExport(candidate);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.metadata.wrapped, true);
    assert.equal(result.metadata.formatVersion, 0);
    assert.equal(result.data.theme, 'dark');
});

test('accepts the original historical data-key export envelope', async () => {
    const candidate = await readFixture('legacy-wrapped-data-key.json');
    const result = validateExport(candidate);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.metadata.wrapped, true);
    assert.equal(result.metadata.formatVersion, 0);
    assert.equal(result.metadata.extensionVersion, '1.0.18');
    assert.equal(result.data.savedTabs[0].id, 7001);
});

test('accepts a supported explicitly versioned export', async () => {
    const candidate = await readFixture('versioned-wrapped.json');
    const result = validateExport(candidate);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.metadata.formatVersion, CURRENT_EXPORT_FORMAT_VERSION);
});

test('rejects an export produced by a newer unsupported format', async () => {
    const candidate = await readFixture('versioned-wrapped.json');
    candidate.formatVersion = CURRENT_EXPORT_FORMAT_VERSION + 1;

    const result = validateExport(candidate);

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /newer than supported/);
});

test('migrates numeric ids and every matching group reference without mutation', async () => {
    const candidate = await readFixture('legacy-raw-numeric.json');
    const original = structuredClone(candidate);
    const generatedIds = new Map([
        [101, 'generated-a'],
        [102, 'generated-b']
    ]);

    const result = migrateToUniqueIds(candidate.savedTabs, candidate.columnState, oldId =>
        generatedIds.get(oldId)
    );

    assert.equal(result.migrated, true);
    assert.deepEqual(
        result.savedTabs.map(tab => tab.id),
        ['generated-a', 'generated-b']
    );
    assert.deepEqual(result.columnState[0].tabIds, [
        'tab-generated-a',
        ['group-1700000000000', 'tab-generated-b', 'Legacy group', true]
    ]);
    assert.deepEqual(candidate, original);
    assert.equal(
        validateLegacyData({
            savedTabs: result.savedTabs,
            columnState: result.columnState
        }).valid,
        true
    );
});

test('numeric-id migration is idempotent', async () => {
    const candidate = await readFixture('legacy-raw-numeric.json');
    const first = migrateToUniqueIds(
        candidate.savedTabs,
        candidate.columnState,
        oldId => `generated-${oldId}`
    );
    const second = migrateToUniqueIds(first.savedTabs, first.columnState, () => {
        throw new Error('id factory must not run for already migrated data');
    });

    assert.equal(second.migrated, false);
    assert.deepEqual(second.savedTabs, first.savedTabs);
    assert.deepEqual(second.columnState, first.columnState);
});

test('reports broken references and malformed subgroup tuples', () => {
    const result = validateLegacyData({
        savedTabs: [{ id: 'known', title: 'Known', url: 'https://example.com' }],
        columnState: [
            {
                id: 'column-1',
                title: 'Column',
                tabIds: ['tab-missing', ['group-1', 'tab-known', 'Missing expanded flag']]
            }
        ]
    });

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /missing saved tab/);
    assert.match(result.errors.join('\n'), /expanded flag/);
});

test('warns about orphaned records rather than treating them as invalid', () => {
    const result = validateLegacyData({
        savedTabs: [{ id: 'orphan', title: 'Recover me', url: 'https://example.com' }],
        columnState: []
    });

    assert.equal(result.valid, true);
    assert.match(result.warnings.join('\n'), /Unreferenced saved tabs/);
});

test('unwrapExport does not mistake an invalid envelope for raw storage', () => {
    const result = unwrapExport({ exportedData: [] });

    assert.equal(result.data, null);
    assert.match(result.errors.join('\n'), /exportedData must be an object/);
});

test('recovers orphaned tabs without deleting or mutating input data', () => {
    const savedTabs = [
        { id: 'placed', title: 'Placed', url: 'https://example.com/placed' },
        { id: 'orphan', title: 'Orphan', url: 'https://example.com/orphan' }
    ];
    const columnState = [{ id: 'column-1', title: 'Column', tabIds: ['tab-placed'] }];
    const originalTabs = structuredClone(savedTabs);
    const originalColumns = structuredClone(columnState);

    const result = recoverOrphanedTabs(savedTabs, columnState, () => 'recovery-id');

    assert.equal(result.recovered, 1);
    assert.deepEqual(result.savedTabs, originalTabs);
    assert.deepEqual(result.columnState[1], {
        id: 'recovered-recovery-id',
        tabIds: ['tab-orphan'],
        title: 'Recovered Tabs',
        minimized: false,
        emoji: '🛟',
        recovered: true
    });
    assert.deepEqual(savedTabs, originalTabs);
    assert.deepEqual(columnState, originalColumns);
});

test('orphan recovery is idempotent and reuses its recovery column', () => {
    const first = recoverOrphanedTabs(
        [{ id: 'orphan', title: 'Orphan', url: 'https://example.com' }],
        [],
        () => 'first'
    );
    const second = recoverOrphanedTabs(first.savedTabs, first.columnState, () => {
        throw new Error('must not create another recovery column');
    });

    assert.equal(second.recovered, 0);
    assert.deepEqual(second.columnState, first.columnState);
});

test('prepares the oldest envelope for safe import and preserves pending background tabs', async () => {
    const candidate = await readFixture('legacy-wrapped-data-key.json');
    candidate.data.bgTabs = [
        {
            id: 7002,
            title: 'Pending background tab',
            url: 'https://example.com/pending',
            favIconUrl: '',
            color: '#FFFFFF'
        }
    ];

    const result = prepareImportData(candidate, {
        idFactory: oldId =>
            oldId === 7001 ? 'migrated-1' : oldId === 7002 ? 'migrated-2' : 'recovery',
        now: () => 123456789
    });

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.migrated, true);
    assert.equal(result.recovered, 1);
    assert.deepEqual(
        result.data.savedTabs.map(tab => tab.id ?? tab.temp),
        ['migrated-1', 'migrated-2', 123456789]
    );
    assert.deepEqual(result.data.bgTabs, []);
    assert.ok(
        result.data.columnState.some(
            column => column.recovered && column.tabIds.includes('tab-migrated-2')
        )
    );
});

test('rejects malformed import before preparation', () => {
    const result = prepareImportData({
        savedTabs: [{ id: 'tab-1', title: 'Tab', url: 'https://example.com' }],
        columnState: [{ id: 'column-1', title: 'Column', tabIds: ['tab-missing'] }]
    });

    assert.equal(result.valid, false);
    assert.equal(result.data, null);
    assert.match(result.errors.join('\n'), /missing saved tab/);
});
