export const CURRENT_EXPORT_FORMAT_VERSION = 1;
export const RECOVERY_COLUMN_TITLE = 'Recovered Tabs';

const TAB_REFERENCE_PREFIX = 'tab-';

function defaultIdFactory() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function isTempMarker(tab) {
    return isObject(tab) && hasOwn(tab, 'temp') && !hasOwn(tab, 'id');
}

function tabReferenceId(reference) {
    if (typeof reference !== 'string' || !reference.startsWith(TAB_REFERENCE_PREFIX)) {
        return null;
    }
    return reference.slice(TAB_REFERENCE_PREFIX.length);
}

/**
 * Accept both historical raw exports and the current export envelope.
 * This function only unwraps the payload; it does not mutate or migrate it.
 */
export function unwrapExport(candidate) {
    if (!isObject(candidate)) {
        return {
            data: null,
            metadata: {
                formatVersion: 0,
                exportedAt: null,
                extensionVersion: null,
                wrapped: false
            },
            errors: ['Export must be a JSON object.']
        };
    }

    const usesCurrentEnvelope = hasOwn(candidate, 'exportedData');
    const usesHistoricalEnvelope =
        !usesCurrentEnvelope &&
        hasOwn(candidate, 'data') &&
        (hasOwn(candidate, 'exportedAt') || hasOwn(candidate, 'extensionVersion'));

    if (!usesCurrentEnvelope && !usesHistoricalEnvelope) {
        return {
            data: candidate,
            metadata: {
                formatVersion: 0,
                exportedAt: null,
                extensionVersion: null,
                wrapped: false
            },
            errors: []
        };
    }

    const errors = [];
    const payloadKey = usesCurrentEnvelope ? 'exportedData' : 'data';
    const payload = candidate[payloadKey];
    if (!isObject(payload)) {
        errors.push(`${payloadKey} must be an object.`);
    }
    if (
        candidate.formatVersion !== undefined &&
        (!Number.isInteger(candidate.formatVersion) || candidate.formatVersion < 0)
    ) {
        errors.push('formatVersion must be a non-negative integer.');
    }
    if (candidate.formatVersion > CURRENT_EXPORT_FORMAT_VERSION) {
        errors.push(
            `Export format version ${candidate.formatVersion} is newer than supported version ${CURRENT_EXPORT_FORMAT_VERSION}.`
        );
    }
    if (
        candidate.exportedAt !== undefined &&
        (typeof candidate.exportedAt !== 'string' || Number.isNaN(Date.parse(candidate.exportedAt)))
    ) {
        errors.push('exportedAt must be a valid date string when present.');
    }

    return {
        data: isObject(payload) ? payload : null,
        metadata: {
            formatVersion: candidate.formatVersion ?? 0,
            exportedAt: candidate.exportedAt ?? null,
            extensionVersion: candidate.extensionVersion ?? null,
            wrapped: true
        },
        errors
    };
}

function validateSavedTab(tab, index, errors) {
    const path = `savedTabs[${index}]`;
    if (!isObject(tab)) {
        errors.push(`${path} must be an object.`);
        return null;
    }
    if (isTempMarker(tab)) {
        return null;
    }
    if (typeof tab.id !== 'string' && typeof tab.id !== 'number') {
        errors.push(`${path}.id must be a string or number.`);
        return null;
    }
    if (typeof tab.id === 'string' && tab.id.length === 0) {
        errors.push(`${path}.id must not be empty.`);
    }
    if (typeof tab.id === 'number' && !Number.isFinite(tab.id)) {
        errors.push(`${path}.id must be finite.`);
    }
    if (typeof tab.title !== 'string') {
        errors.push(`${path}.title must be a string.`);
    }
    if (typeof tab.url !== 'string' || tab.url.length === 0) {
        errors.push(`${path}.url must be a non-empty string.`);
    }
    if (tab.favIconUrl !== undefined && typeof tab.favIconUrl !== 'string') {
        errors.push(`${path}.favIconUrl must be a string when present.`);
    }
    if (tab.note !== undefined && tab.note !== null && typeof tab.note !== 'string') {
        errors.push(`${path}.note must be a string or null when present.`);
    }
    if (
        tab.parsedDate !== undefined &&
        tab.parsedDate !== null &&
        (typeof tab.parsedDate !== 'number' || !Number.isFinite(tab.parsedDate))
    ) {
        errors.push(`${path}.parsedDate must be a timestamp or null when present.`);
    }
    return String(tab.id);
}

function validateSubgroup(group, path, savedTabIds, referencedTabIds, errors) {
    if (group.length < 4) {
        errors.push(
            `${path} must contain a group id, at least one tab, a title, and an expanded flag.`
        );
        return;
    }
    if (typeof group[0] !== 'string' || group[0].length === 0) {
        errors.push(`${path}[0] must be a non-empty group id.`);
    }
    if (typeof group[group.length - 2] !== 'string') {
        errors.push(`${path}[${group.length - 2}] must be the group title string.`);
    }
    if (typeof group[group.length - 1] !== 'boolean') {
        errors.push(`${path}[${group.length - 1}] must be the expanded boolean.`);
    }

    group.slice(1, -2).forEach((reference, referenceIndex) => {
        validateTabReference(
            reference,
            `${path}[${referenceIndex + 1}]`,
            savedTabIds,
            referencedTabIds,
            errors
        );
    });
}

function validateTabReference(reference, path, savedTabIds, referencedTabIds, errors) {
    const id = tabReferenceId(reference);
    if (id === null || id.length === 0) {
        errors.push(`${path} must be a tab reference beginning with "tab-".`);
        return;
    }
    referencedTabIds.add(id);
    if (!savedTabIds.has(id)) {
        errors.push(`${path} refers to missing saved tab ${JSON.stringify(id)}.`);
    }
}

/**
 * Validate the legacy storage contract used by existing installs and exports.
 * Unknown properties are intentionally allowed for forward-compatible metadata.
 */
export function validateLegacyData(data) {
    const errors = [];
    const warnings = [];

    if (!isObject(data)) {
        return { valid: false, errors: ['Export data must be an object.'], warnings };
    }
    if (!Array.isArray(data.savedTabs)) {
        errors.push('savedTabs must be an array.');
    }
    if (!Array.isArray(data.columnState)) {
        errors.push('columnState must be an array.');
    }
    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }

    const savedTabIds = new Set();
    data.savedTabs.forEach((tab, index) => {
        const id = validateSavedTab(tab, index, errors);
        if (id === null) return;
        if (savedTabIds.has(id)) {
            errors.push(`savedTabs contains duplicate id ${JSON.stringify(id)}.`);
        }
        savedTabIds.add(id);
    });

    const columnIds = new Set();
    const groupIds = new Set();
    const referencedTabIds = new Set();
    data.columnState.forEach((column, columnIndex) => {
        const path = `columnState[${columnIndex}]`;
        if (!isObject(column)) {
            errors.push(`${path} must be an object.`);
            return;
        }
        if (typeof column.id !== 'string' || column.id.length === 0) {
            errors.push(`${path}.id must be a non-empty string.`);
        } else if (columnIds.has(column.id)) {
            errors.push(`columnState contains duplicate id ${JSON.stringify(column.id)}.`);
        } else {
            columnIds.add(column.id);
        }
        if (typeof column.title !== 'string') {
            errors.push(`${path}.title must be a string.`);
        }
        if (!Array.isArray(column.tabIds)) {
            errors.push(`${path}.tabIds must be an array.`);
            return;
        }
        if (column.minimized !== undefined && typeof column.minimized !== 'boolean') {
            errors.push(`${path}.minimized must be a boolean when present.`);
        }
        if (column.emoji !== undefined && typeof column.emoji !== 'string') {
            errors.push(`${path}.emoji must be a string when present.`);
        }

        column.tabIds.forEach((item, itemIndex) => {
            const itemPath = `${path}.tabIds[${itemIndex}]`;
            if (Array.isArray(item)) {
                const groupId = item[0];
                if (typeof groupId === 'string') {
                    if (groupIds.has(groupId)) {
                        errors.push(
                            `columnState contains duplicate group id ${JSON.stringify(groupId)}.`
                        );
                    }
                    groupIds.add(groupId);
                }
                validateSubgroup(item, itemPath, savedTabIds, referencedTabIds, errors);
            } else {
                validateTabReference(item, itemPath, savedTabIds, referencedTabIds, errors);
            }
        });
    });

    const orphanedTabIds = [...savedTabIds].filter(id => !referencedTabIds.has(id));
    if (orphanedTabIds.length > 0) {
        warnings.push(`Unreferenced saved tabs: ${orphanedTabIds.join(', ')}.`);
    }

    return { valid: errors.length === 0, errors, warnings };
}

export function validateExport(candidate) {
    const unwrapped = unwrapExport(candidate);
    if (unwrapped.errors.length > 0 || unwrapped.data === null) {
        return {
            valid: false,
            data: unwrapped.data,
            metadata: unwrapped.metadata,
            errors: unwrapped.errors,
            warnings: []
        };
    }
    const validation = validateLegacyData(unwrapped.data);
    return {
        ...validation,
        data: unwrapped.data,
        metadata: unwrapped.metadata
    };
}

/**
 * Migrate historical numeric tab ids while retaining the legacy persisted shape.
 * The input is never mutated and repeated migration is a no-op.
 */
export function migrateToUniqueIds(savedTabs, columnState, idFactory = defaultIdFactory) {
    const sourceTabs = Array.isArray(savedTabs) ? savedTabs : [];
    const sourceColumns = Array.isArray(columnState) ? columnState : [];
    const needsMigration = sourceTabs.some(tab => isObject(tab) && typeof tab.id === 'number');

    if (!needsMigration) {
        return { savedTabs: sourceTabs, columnState: sourceColumns, migrated: false };
    }

    const idMap = new Map();
    const migratedTabs = sourceTabs.map(tab => {
        if (isObject(tab) && typeof tab.id === 'number') {
            const newId = String(idFactory(tab.id));
            idMap.set(tab.id, newId);
            return { ...tab, id: newId };
        }
        return tab;
    });

    const convertTabReference = reference => {
        const id = tabReferenceId(reference);
        if (id === null) return reference;
        const numericId = Number(id);
        if (!Number.isNaN(numericId) && idMap.has(numericId)) {
            return `${TAB_REFERENCE_PREFIX}${idMap.get(numericId)}`;
        }
        return reference;
    };

    const migratedColumns = sourceColumns.map(column => {
        if (!isObject(column) || !Array.isArray(column.tabIds)) return column;
        const tabIds = column.tabIds.map(item => {
            if (!Array.isArray(item)) return convertTabReference(item);
            return item.map((value, index) => {
                if (index === 0 || index >= item.length - 2) return value;
                return convertTabReference(value);
            });
        });
        return { ...column, tabIds };
    });

    return { savedTabs: migratedTabs, columnState: migratedColumns, migrated: true };
}

function collectReferencedTabIds(columnState) {
    const referencedIds = new Set();
    (columnState || []).forEach(column => {
        if (!isObject(column) || !Array.isArray(column.tabIds)) return;
        column.tabIds.forEach(item => {
            if (Array.isArray(item)) {
                item.slice(1, -2).forEach(reference => {
                    const id = tabReferenceId(reference);
                    if (id !== null) referencedIds.add(id);
                });
                return;
            }
            const id = tabReferenceId(item);
            if (id !== null) referencedIds.add(id);
        });
    });
    return referencedIds;
}

/**
 * Reattach unreferenced saved tabs instead of deleting them. This keeps the
 * legacy storage shape and is safe to call repeatedly.
 */
export function recoverOrphanedTabs(savedTabs, columnState, idFactory = defaultIdFactory) {
    const tabs = Array.isArray(savedTabs) ? [...savedTabs] : [];
    const columns = (Array.isArray(columnState) ? columnState : []).map(column => {
        if (!isObject(column)) return column;
        return {
            ...column,
            tabIds: Array.isArray(column.tabIds) ? [...column.tabIds] : []
        };
    });
    const referencedIds = collectReferencedTabIds(columns);
    const orphanedTabs = tabs.filter(
        tab =>
            isObject(tab) &&
            !isTempMarker(tab) &&
            (typeof tab.id === 'string' || typeof tab.id === 'number') &&
            !referencedIds.has(String(tab.id))
    );

    if (orphanedTabs.length === 0) {
        return { savedTabs: tabs, columnState: columns, recovered: 0 };
    }

    const recoveredReferences = orphanedTabs.map(tab => `${TAB_REFERENCE_PREFIX}${tab.id}`);
    const recoveryColumn = columns.find(column => isObject(column) && column.recovered === true);
    if (recoveryColumn) {
        recoveryColumn.tabIds.push(...recoveredReferences);
    } else {
        columns.push({
            id: `recovered-${idFactory()}`,
            tabIds: recoveredReferences,
            title: RECOVERY_COLUMN_TITLE,
            minimized: false,
            emoji: '🛟',
            recovered: true
        });
    }

    return {
        savedTabs: tabs,
        columnState: columns,
        recovered: orphanedTabs.length
    };
}

/**
 * Fully validate and normalize an import without touching browser storage.
 * Both historical envelopes are accepted, numeric ids are migrated, pending
 * background tabs are preserved, and orphaned tabs are made visible.
 */
export function prepareImportData(candidate, options = {}) {
    const { idFactory = defaultIdFactory, now = () => Date.now() } = options;
    const validation = validateExport(candidate);
    if (!validation.valid) {
        return {
            valid: false,
            data: null,
            metadata: validation.metadata,
            errors: validation.errors,
            warnings: validation.warnings,
            recovered: 0,
            migrated: false
        };
    }

    const source = validation.data;
    const savedTabs = source.savedTabs.filter(tab => !isTempMarker(tab));
    const backgroundTabs = source.bgTabs === undefined ? [] : source.bgTabs;
    if (!Array.isArray(backgroundTabs)) {
        return {
            valid: false,
            data: null,
            metadata: validation.metadata,
            errors: ['bgTabs must be an array when present.'],
            warnings: validation.warnings,
            recovered: 0,
            migrated: false
        };
    }

    const combinedTabs = [...savedTabs, ...backgroundTabs];
    const combinedValidation = validateLegacyData({
        savedTabs: combinedTabs,
        columnState: source.columnState
    });
    if (!combinedValidation.valid) {
        return {
            valid: false,
            data: null,
            metadata: validation.metadata,
            errors: combinedValidation.errors,
            warnings: combinedValidation.warnings,
            recovered: 0,
            migrated: false
        };
    }

    const migration = migrateToUniqueIds(combinedTabs, source.columnState, idFactory);
    const recovery = recoverOrphanedTabs(migration.savedTabs, migration.columnState, idFactory);
    const preparedData = {
        ...source,
        savedTabs: [...recovery.savedTabs, { temp: now() }],
        columnState: recovery.columnState,
        bgTabs: []
    };
    const finalValidation = validateLegacyData(preparedData);

    return {
        valid: finalValidation.valid,
        data: finalValidation.valid ? preparedData : null,
        metadata: validation.metadata,
        errors: finalValidation.errors,
        warnings: [...new Set([...validation.warnings, ...finalValidation.warnings])],
        recovered: recovery.recovered,
        migrated: migration.migrated
    };
}
