export class ImportTransactionError extends Error {
    constructor(message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'ImportTransactionError';
        this.rolledBack = options.rolledBack ?? false;
        this.rollbackError = options.rollbackError ?? null;
    }
}

function storageValuesMatch(expected, actual) {
    return Object.keys(expected).every(key =>
        JSON.stringify(expected[key]) === JSON.stringify(actual[key])
    );
}

async function restorePreviousStorage(storage, previousStorage, importedKeys, backupKey) {
    await storage.set(previousStorage);
    const newlyAddedKeys = importedKeys.filter(key =>
        !Object.prototype.hasOwnProperty.call(previousStorage, key)
    );
    if (!Object.prototype.hasOwnProperty.call(previousStorage, backupKey)) {
        newlyAddedKeys.push(backupKey);
    }
    await storage.remove([...new Set(newlyAddedKeys)]);
}

/**
 * Persist prepared import data with a durable pre-import backup, read-back
 * verification, and best-effort rollback. The storage adapter exposes async
 * get, set, and remove methods and can be replaced with a fake in tests.
 */
export async function importStorageSafely(options) {
    const {
        storage,
        data,
        backupKey,
        now = () => new Date().toISOString()
    } = options;

    const previousStorage = await storage.get(null);
    const backupData = { ...previousStorage };
    delete backupData[backupKey];
    const importedData = { ...data };
    delete importedData[backupKey];
    const importedKeys = Object.keys(importedData);
    let backupWritten = false;

    try {
        await storage.set({
            [backupKey]: {
                createdAt: now(),
                data: backupData
            }
        });
        backupWritten = true;
        await storage.set(importedData);

        const storedData = await storage.get(importedKeys);
        if (!storageValuesMatch(importedData, storedData)) {
            throw new Error('Imported data could not be verified after writing.');
        }

        return { previousStorage, importedKeys };
    } catch (cause) {
        if (!backupWritten) {
            throw new ImportTransactionError(cause.message, { cause, rolledBack: false });
        }
        try {
            await restorePreviousStorage(storage, previousStorage, importedKeys, backupKey);
        } catch (rollbackError) {
            throw new ImportTransactionError(cause.message, {
                cause,
                rolledBack: false,
                rollbackError
            });
        }
        throw new ImportTransactionError(cause.message, { cause, rolledBack: true });
    }
}
