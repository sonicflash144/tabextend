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

    function serializedValue(value) {
        return JSON.stringify(value);
    }

    function sqliteCharacterSize(entries) {
        return Object.entries(entries).reduce(
            (size, [key, value]) =>
                size + Array.from(key).length + Array.from(serializedValue(value)).length,
            0
        );
    }

    function internalStringSize(value) {
        const text = String(value);
        const isEightBit = Array.from(text).every(character => character.codePointAt(0) <= 0xff);
        return text.length * (isEightBit ? 1 : 2);
    }

    function internalStorageSize(entries) {
        return Object.entries(entries).reduce(
            (size, [key, value]) =>
                size + internalStringSize(key) + internalStringSize(serializedValue(value)),
            0
        );
    }

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
            if (options.webkitReplacementQuotaBug) {
                const replaced = Object.fromEntries(
                    Object.keys(updates)
                        .filter(key => Object.prototype.hasOwnProperty.call(values, key))
                        .map(key => [key, values[key]])
                );
                const updatedSize =
                    sqliteCharacterSize(values) -
                    internalStorageSize(replaced) +
                    internalStorageSize(updates);
                if (updatedSize < 0) throw new Error('Exceeded storage quota');
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

test('Safari-safe replacement avoids WebKit quota underflow for a Unicode backup', async () => {
    const initial = {
        savedTabs: [{ id: 'old' }],
        columnState: [],
        [backupKey]: {
            createdAt: 'old',
            data: { savedTabs: [{ id: 'older', title: '🧭'.repeat(1000) }] }
        }
    };
    const imported = { savedTabs: [{ id: 'new' }], columnState: [] };

    await assert.rejects(
        importStorageSafely({
            storage: createFakeStorage(initial, { webkitReplacementQuotaBug: true }),
            data: imported,
            backupKey
        }),
        /Exceeded storage quota/
    );

    const storage = createFakeStorage(initial, { webkitReplacementQuotaBug: true });
    await importStorageSafely({
        storage,
        data: imported,
        backupKey,
        now: () => 'new',
        removeBeforeSet: true
    });

    assert.deepEqual(storage.snapshot(), {
        savedTabs: imported.savedTabs,
        columnState: imported.columnState,
        [backupKey]: {
            createdAt: 'new',
            data: { savedTabs: [{ id: 'old' }], columnState: [] }
        }
    });
});

test('Safari-safe backup failure restores the previous backup before reporting failure', async () => {
    const initial = {
        savedTabs: [{ id: 'old' }],
        columnState: [],
        [backupKey]: { createdAt: 'old', data: { savedTabs: [{ id: 'older' }] } }
    };
    const storage = createFakeStorage(initial, { failSetCall: 1 });

    await assert.rejects(
        importStorageSafely({
            storage,
            data: { savedTabs: [{ id: 'new' }], columnState: [] },
            backupKey,
            removeBeforeSet: true
        }),
        error => error instanceof ImportTransactionError && !error.rolledBack
    );

    assert.deepEqual(storage.snapshot(), initial);
});

test('Safari-safe import failure restores primary values and the previous backup', async () => {
    const initial = {
        savedTabs: [{ id: 'old' }],
        columnState: [],
        [backupKey]: { createdAt: 'old', data: { savedTabs: [{ id: 'older' }] } }
    };
    const storage = createFakeStorage(initial, { failSetCall: 2 });

    await assert.rejects(
        importStorageSafely({
            storage,
            data: {
                savedTabs: [{ id: 'new' }],
                columnState: [],
                theme: 'light'
            },
            backupKey,
            removeBeforeSet: true
        }),
        error => error instanceof ImportTransactionError && error.rolledBack
    );

    assert.deepEqual(storage.snapshot(), initial);
});
