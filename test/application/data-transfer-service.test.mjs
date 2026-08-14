import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createDataTransferService,
    IMPORT_BACKUP_KEY
} from '../../src/application/data-transfer.mjs';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}) {
    const values = clone(initial);
    return {
        values,
        async get(keys) {
            if (keys === null || keys === undefined) return clone(values);
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
                requested
                    .filter(key => key in values)
                    .map(key => [key, clone(values[key])])
            );
        },
        async set(updates) { Object.assign(values, clone(updates)); },
        async remove(keys) {
            (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
        }
    };
}

function storedData() {
    return {
        savedTabs: [{ id: 'alpha', title: 'Alpha', url: 'https://example.com/alpha' }],
        columnState: [{ id: 'column-one', title: 'Research', tabIds: ['tab-alpha'] }],
        theme: 'dark',
        animation: { columnId: 'column-one', minimized: true },
        [IMPORT_BACKUP_KEY]: { stale: true }
    };
}

function createService(initial = {}) {
    const storage = createStorage(initial);
    let counter = 0;
    return {
        storage,
        service: createDataTransferService({
            storage,
            idFactory: () => `id-${++counter}`,
            now: () => 1755000000000
        })
    };
}

test('requires a storage adapter and an id factory', () => {
    assert.throws(() => createDataTransferService({ idFactory: () => 'id' }), /storage adapter/);
    assert.throws(() => createDataTransferService({ storage: createStorage() }), /id factory/);
});

test('exports a versioned document without the transient keys', async () => {
    const { service } = createService(storedData());

    const result = await service.createExport();

    assert.equal(result.filename, 'tabextend-export-1755000000000.json');
    assert.deepEqual(JSON.parse(result.json), result.payload);
    assert.equal(result.payload.formatVersion, 1);
    assert.equal(result.payload.exportedAt, '2025-08-12T12:00:00.000Z');
    assert.equal(result.payload.exportedData.animation, undefined);
    assert.equal(result.payload.exportedData[IMPORT_BACKUP_KEY], undefined);
    assert.equal(result.payload.exportedData.theme, 'dark');
});

test('an exported document imports back into an empty store', async () => {
    const source = createService(storedData());
    const exported = await source.service.createExport();

    const target = createService();
    const result = await target.service.importFromText(exported.json);

    assert.equal(result.imported, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(target.storage.values.columnState, storedData().columnState);
    // The legacy temp marker is written alongside the restored tabs.
    assert.deepEqual(target.storage.values.savedTabs, [
        ...storedData().savedTabs,
        { temp: 1755000000000 }
    ]);
});

test('a rejected import reports its reasons and writes nothing', async () => {
    const { service, storage } = createService({ savedTabs: [{ id: 'kept' }] });

    const result = await service.importFromText(JSON.stringify({
        formatVersion: 1,
        exportedData: { savedTabs: 'not an array', columnState: [] }
    }));

    assert.equal(result.imported, false);
    assert.ok(result.errors.length > 0);
    assert.deepEqual(storage.values.savedTabs, [{ id: 'kept' }]);
});

test('unreadable text fails before any write', async () => {
    const { service, storage } = createService({ savedTabs: [{ id: 'kept' }] });

    await assert.rejects(() => service.importFromText('{ not json'), SyntaxError);
    assert.deepEqual(storage.values.savedTabs, [{ id: 'kept' }]);
});

test('a failed write is rolled back and reported', async () => {
    const { service, storage } = createService({ savedTabs: [{ id: 'kept' }] });
    const originalSet = storage.set.bind(storage);
    let writes = 0;
    storage.set = async updates => {
        writes += 1;
        // The first write stores the backup; fail the write of imported data.
        if (writes === 2) throw new Error('storage is full');
        return originalSet(updates);
    };

    const exported = await createService(storedData()).service.createExport();
    await assert.rejects(() => service.importFromText(exported.json), error => {
        assert.equal(error.rolledBack, true);
        return true;
    });
    assert.deepEqual(storage.values.savedTabs, [{ id: 'kept' }]);
});
