import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSettingsService, nextTheme } from '../../src/application/settings-service.mjs';

function createStorage(initial = {}) {
    const values = { ...initial };
    return {
        values,
        async get(keys) {
            if (keys === null || keys === undefined) return { ...values };
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
                requested
                    .filter(key => key in values)
                    .map(key => [key, values[key]])
            );
        },
        async set(updates) { Object.assign(values, updates); }
    };
}

test('settings service requires a storage adapter', () => {
    assert.throws(() => createSettingsService({}), /storage adapter/);
});

test('reads interface settings with defaults for a fresh install', async () => {
    const settings = createSettingsService({ storage: createStorage() });

    assert.deepEqual(await settings.load(), {
        sidebarCollapsed: false,
        theme: 'light',
        storedTheme: null
    });
});

test('reads a stored theme and sidebar state', async () => {
    const settings = createSettingsService({
        storage: createStorage({ theme: 'dark', sidebarCollapsed: true })
    });

    assert.deepEqual(await settings.load(), {
        sidebarCollapsed: true,
        theme: 'dark',
        storedTheme: 'dark'
    });
});

test('ignores unsupported stored themes', async () => {
    const settings = createSettingsService({ storage: createStorage({ theme: 'neon' }) });
    const stored = await settings.load();

    assert.equal(stored.theme, 'light');
    assert.equal(stored.storedTheme, null);
});

test('persists theme and sidebar changes', async () => {
    const storage = createStorage();
    const settings = createSettingsService({ storage });

    await settings.saveTheme('dark');
    await settings.saveSidebarCollapsed(true);

    assert.deepEqual(storage.values, { theme: 'dark', sidebarCollapsed: true });
});

test('reports sidebar changes made by another page', () => {
    const settings = createSettingsService({ storage: createStorage() });

    assert.equal(settings.readSidebarChange({}), null);
    assert.equal(settings.readSidebarChange({ theme: { newValue: 'dark' } }), null);
    assert.deepEqual(
        settings.readSidebarChange({ sidebarCollapsed: { newValue: true } }),
        { sidebarCollapsed: true }
    );
    assert.deepEqual(
        settings.readSidebarChange({ sidebarCollapsed: { newValue: false } }),
        { sidebarCollapsed: false }
    );
});

test('alternates between the supported themes', () => {
    assert.equal(nextTheme('light'), 'dark');
    assert.equal(nextTheme('dark'), 'light');
});
