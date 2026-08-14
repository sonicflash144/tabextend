import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ImportTransactionError,
    importStorageSafely
} from '../../src/infrastructure/import-transaction.mjs';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function reverseObjectKeys(value) {
    if (Array.isArray(value)) return value.map(reverseObjectKeys);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value)
            .reverse()
            .map(key => [key, reverseObjectKeys(value[key])])
    );
}

function createFakeStorage(initial, options = {}) {
    let values = clone(initial);
    let setCalls = 0;
    return {
        async get(keys) {
            if (keys === null) return clone(values);
            const selected = {};
            keys.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(values, key)) {
                    selected[key] = clone(values[key]);
                }
            });
            if (options.corruptReadBack && setCalls >= 2 && keys.includes('savedTabs')) {
                selected.savedTabs = [];
            }
            return options.reorderReadBack && setCalls >= 2
                ? reverseObjectKeys(selected)
                : selected;
        },
        async set(updates) {
            setCalls += 1;
            if (options.failSetCall === setCalls) {
                throw new Error(`set call ${setCalls} failed`);
            }
            values = { ...values, ...clone(updates) };
        },
        async remove(keys) {
            keys.forEach(key => delete values[key]);
        },
        snapshot() {
            return clone(values);
        }
    };
}

const backupKey = 'tabsMagicImportBackup';

test('writes a backup, imports data, and verifies the result', async () => {
    const initial = {
        savedTabs: [{ id: 'old' }],
        columnState: [{ id: 'old-column' }],
        theme: 'dark'
    };
    const storage = createFakeStorage(initial);
    const imported = {
        savedTabs: [{ id: 'new' }],
        columnState: [{ id: 'new-column' }]
    };

    await importStorageSafely({
        storage,
        data: imported,
        backupKey,
        now: () => '2026-08-13T12:00:00.000Z'
    });

    assert.deepEqual(storage.snapshot(), {
        savedTabs: imported.savedTabs,
        columnState: imported.columnState,
        theme: 'dark',
        [backupKey]: {
            createdAt: '2026-08-13T12:00:00.000Z',
            data: initial
        }
    });
});

test('verification accepts equivalent objects returned with reordered properties', async () => {
    const initial = {
        savedTabs: [{ id: 'old' }],
        columnState: []
    };
    const storage = createFakeStorage(initial, { reorderReadBack: true });
    const imported = {
        savedTabs: [
            {
                id: 'new',
                title: 'New',
                metadata: { source: 'legacy', flags: { reviewed: true, pinned: false } }
            }
        ],
        columnState: [
            {
                id: 'new-column',
                title: 'Column',
                minimized: false,
                tabIds: ['tab-new']
            }
        ]
    };

    await importStorageSafely({ storage, data: imported, backupKey });

    assert.deepEqual(storage.snapshot().savedTabs, imported.savedTabs);
    assert.deepEqual(storage.snapshot().columnState, imported.columnState);
});

test('rolls back all changes when verification fails', async () => {
    const initial = {
        savedTabs: [{ id: 'old' }],
        columnState: [{ id: 'old-column' }]
    };
    const storage = createFakeStorage(initial, { corruptReadBack: true });

    await assert.rejects(
        importStorageSafely({
            storage,
            data: {
                savedTabs: [{ id: 'new' }],
                columnState: [{ id: 'new-column' }],
                theme: 'light'
            },
            backupKey
        }),
        error => {
            assert.ok(error instanceof ImportTransactionError);
            assert.equal(error.rolledBack, true);
            assert.match(error.message, /could not be verified/);
            assert.match(error.message, /Mismatched keys: savedTabs/);
            return true;
        }
    );
    assert.deepEqual(storage.snapshot(), initial);
});

test('leaves storage unchanged if creating the backup fails', async () => {
    const initial = { savedTabs: [{ id: 'old' }], columnState: [] };
    const storage = createFakeStorage(initial, { failSetCall: 1 });

    await assert.rejects(
        importStorageSafely({
            storage,
            data: { savedTabs: [{ id: 'new' }], columnState: [] },
            backupKey
        }),
        error => {
            assert.ok(error instanceof ImportTransactionError);
            assert.equal(error.rolledBack, false);
            return true;
        }
    );
    assert.deepEqual(storage.snapshot(), initial);
});

test('does not nest a previous backup inside the new backup', async () => {
    const storage = createFakeStorage({
        savedTabs: [{ id: 'old' }],
        columnState: [],
        [backupKey]: { createdAt: 'old', data: { obsolete: true } }
    });

    await importStorageSafely({
        storage,
        data: { savedTabs: [{ id: 'new' }], columnState: [] },
        backupKey,
        now: () => 'new'
    });

    assert.deepEqual(storage.snapshot()[backupKey], {
        createdAt: 'new',
        data: { savedTabs: [{ id: 'old' }], columnState: [] }
    });
});
