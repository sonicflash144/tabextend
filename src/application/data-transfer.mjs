import { CURRENT_EXPORT_FORMAT_VERSION, prepareImportData } from '../compatibility/legacy-data.mjs';
import { importStorageSafely } from '../infrastructure/import-transaction.mjs';

export const TRANSIENT_EXPORT_KEYS = new Set(['animation', 'tabsMagicImportBackup']);

export const IMPORT_BACKUP_KEY = 'tabsMagicImportBackup';

/** Create the portable export envelope shared by every browser package. */
export function createExportPayload(storageData, options = {}) {
    const { exportedAt = new Date().toISOString(), formatVersion = CURRENT_EXPORT_FORMAT_VERSION } =
        options;
    const exportedData = { ...storageData };
    TRANSIENT_EXPORT_KEYS.forEach(key => delete exportedData[key]);

    return {
        formatVersion,
        exportedAt,
        exportedData
    };
}

/**
 * Reading and replacing the whole extension store. The page keeps the file
 * dialogs and download; the storage contract and the transactional import
 * live here.
 */
export function createDataTransferService(options) {
    const { storage, idFactory, now = () => Date.now() } = options;

    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new Error('A storage adapter with get and set methods is required.');
    }
    if (typeof idFactory !== 'function') {
        throw new Error('An id factory is required.');
    }

    /** The export document and the file name it is offered under. */
    async function createExport() {
        const storedData = await storage.get(null);
        const payload = createExportPayload(storedData, {
            exportedAt: new Date(now()).toISOString()
        });
        return {
            filename: `tabextend-export-${now()}.json`,
            json: JSON.stringify(payload, null, 2),
            payload
        };
    }

    /**
     * Validate exported text and, when it is sound, replace stored data with
     * it. Rejected imports report their reasons and write nothing.
     */
    async function importFromText(text) {
        const prepared = prepareImportData(JSON.parse(text), { idFactory, now });
        if (!prepared.valid) {
            return { imported: false, errors: prepared.errors };
        }

        await importStorageSafely({
            storage,
            data: prepared.data,
            backupKey: IMPORT_BACKUP_KEY,
            now: () => new Date(now()).toISOString()
        });

        return { imported: true, errors: [], recovered: prepared.recovered };
    }

    return { createExport, importFromText };
}
