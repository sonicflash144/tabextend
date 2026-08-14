import { CURRENT_EXPORT_FORMAT_VERSION } from '../compatibility/legacy-data.mjs';

export const TRANSIENT_EXPORT_KEYS = new Set([
    'animation',
    'tabsMagicImportBackup'
]);

/** Create the portable export envelope shared by every browser package. */
export function createExportPayload(storageData, options = {}) {
    const {
        exportedAt = new Date().toISOString(),
        formatVersion = CURRENT_EXPORT_FORMAT_VERSION
    } = options;
    const exportedData = { ...storageData };
    TRANSIENT_EXPORT_KEYS.forEach(key => delete exportedData[key]);

    return {
        formatVersion,
        exportedAt,
        exportedData
    };
}
