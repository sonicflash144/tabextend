import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createExportPayload } from '../../src/application/data-transfer.mjs';
import { prepareImportData } from '../../src/compatibility/legacy-data.mjs';
import { createBrowserApiFromGlobal } from '../../src/infrastructure/browser-api.mjs';
import { importStorageSafely } from '../../src/infrastructure/import-transaction.mjs';

const BROWSERS = ['chrome', 'firefox', 'safari'];
const BACKUP_KEY = 'tabsMagicImportBackup';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function selectedValues(values, keys) {
    if (keys === null) return clone(values);
    const selected = {};
    const requested = Array.isArray(keys) ? keys : [keys];
    requested.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            selected[key] = clone(values[key]);
        }
    });
    return selected;
}

function createRawStorageApi(browser, initial = {}) {
    const values = clone(initial);
    const promiseStyle = browser !== 'chrome';
    const local = promiseStyle
        ? {
            async get(keys) { return selectedValues(values, keys); },
            async set(updates) { Object.assign(values, clone(updates)); },
            async remove(keys) {
                (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
            },
            async clear() { Object.keys(values).forEach(key => delete values[key]); }
        }
        : {
            get(keys, callback) { callback(selectedValues(values, keys)); },
            set(updates, callback) {
                Object.assign(values, clone(updates));
                callback();
            },
            remove(keys, callback) {
                (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
                callback();
            },
            clear(callback) {
                Object.keys(values).forEach(key => delete values[key]);
                callback();
            }
        };
    const rawApi = {
        runtime: {
            lastError: null,
            getManifest: () => ({ version: '1.0.19.0' })
        },
        storage: { local }
    };
    const scope = browser === 'chrome' ? { chrome: rawApi } : { browser: rawApi };
    return { api: createBrowserApiFromGlobal(scope), values };
}

function portableStorage() {
    return {
        savedTabs: [
            {
                id: 'alpha-id',
                title: 'Alpha',
                url: 'https://example.com/alpha',
                favIconUrl: 'https://example.com/favicon.png',
                color: 'tab-blue',
                note: 'Line one<br>Line two',
                customMetadata: { retained: true }
            },
            { temp: 100 }
        ],
        columnState: [
            {
                id: 'column-one',
                title: 'Research',
                minimized: false,
                emoji: '📚',
                tabIds: ['tab-alpha-id'],
                customColumnMetadata: 'retained'
            }
        ],
        bgTabs: [],
        theme: 'dark',
        sidebarCollapsed: true,
        customTopLevelMetadata: { retained: true },
        animation: { columnId: 'column-one', minimized: true },
        [BACKUP_KEY]: { stale: true }
    };
}

test('export/import data round trips across every browser pair', async t => {
    for (const exporter of BROWSERS) {
        for (const importer of BROWSERS) {
            await t.test(`${exporter} export to ${importer} import`, async () => {
                const source = createRawStorageApi(exporter, portableStorage());
                const storedSource = await source.api.storage.local.get(null);
                const payload = createExportPayload(storedSource, {
                    exportedAt: '2026-08-13T12:00:00.000Z'
                });

                assert.equal(payload.exportedData.animation, undefined);
                assert.equal(payload.exportedData[BACKUP_KEY], undefined);

                const prepared = prepareImportData(payload, {
                    idFactory: () => 'unused-id',
                    now: () => 200
                });
                assert.equal(prepared.valid, true, prepared.errors.join('\n'));

                const target = createRawStorageApi(importer);
                await importStorageSafely({
                    storage: target.api.storage.local,
                    data: prepared.data,
                    backupKey: BACKUP_KEY,
                    now: () => '2026-08-13T12:01:00.000Z'
                });

                const imported = await target.api.storage.local.get(null);
                const backup = imported[BACKUP_KEY];
                delete imported[BACKUP_KEY];
                assert.deepEqual(imported, prepared.data);
                assert.deepEqual(backup.data, {});
                assert.deepEqual(
                    imported.savedTabs.filter(tab => !('temp' in tab)),
                    portableStorage().savedTabs.filter(tab => !('temp' in tab))
                );
            });
        }
    }
});
