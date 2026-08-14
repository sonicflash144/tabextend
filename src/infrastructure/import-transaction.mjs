export class ImportTransactionError extends Error {
    constructor(message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'ImportTransactionError';
        this.rolledBack = options.rolledBack ?? false;
        this.rollbackError = options.rollbackError ?? null;
    }
}

function jsonValuesMatch(expected, actual) {
    if (expected === actual) return true;
    if (expected === null || actual === null) return false;
    if (typeof expected !== typeof actual) return false;

    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual) ||
            expected.length !== actual.length) {
            return false;
        }
        return expected.every((value, index) => jsonValuesMatch(value, actual[index]));
    }

    if (typeof expected !== 'object') return false;
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (expectedKeys.length !== actualKeys.length ||
        expectedKeys.some((key, index) => key !== actualKeys[index])) {
        return false;
    }
    return expectedKeys.every(key => jsonValuesMatch(expected[key], actual[key]));
}

function mismatchedStorageKeys(expected, actual) {
    return Object.keys(expected).filter(key =>
        !Object.prototype.hasOwnProperty.call(actual, key) ||
        !jsonValuesMatch(expected[key], actual[key])
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
        const mismatchedKeys = mismatchedStorageKeys(importedData, storedData);
        if (mismatchedKeys.length > 0) {
            throw new Error(
                `Imported data could not be verified after writing. Mismatched keys: ${mismatchedKeys.join(', ')}.`
            );
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
