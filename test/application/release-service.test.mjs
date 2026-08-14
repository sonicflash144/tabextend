import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createReleaseService,
    evaluateReleaseState
} from '../../src/application/release-service.mjs';

function createStorage(initial = {}) {
    const values = { ...initial };
    return {
        values,
        async get(keys) {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
                requested.filter(key => key in values).map(key => [key, values[key]])
            );
        },
        async set(updates) {
            Object.assign(values, updates);
        }
    };
}

test('marks a changed version as a new release and resets the notes marker', () => {
    assert.deepEqual(evaluateReleaseState({ release: '1.0.0', whatsNewClicked: true }, '1.0.1'), {
        version: '1.0.1',
        previousVersion: '1.0.0',
        isNewRelease: true,
        whatsNewClicked: false
    });
    assert.deepEqual(evaluateReleaseState({ release: '1.0.1', whatsNewClicked: true }, '1.0.1'), {
        version: '1.0.1',
        previousVersion: '1.0.1',
        isNewRelease: false,
        whatsNewClicked: true
    });
    assert.equal(evaluateReleaseState({}, '1.0.1').isNewRelease, true);
});

test('release service persists the reset marker only for a new release', async () => {
    const storage = createStorage({ release: '1.0.0', whatsNewClicked: true });
    const runtime = { getManifest: () => ({ version: '1.0.1' }) };
    const release = createReleaseService({ storage, runtime });

    const state = await release.load();
    assert.equal(state.isNewRelease, true);
    assert.equal(storage.values.whatsNewClicked, false);
    assert.equal(storage.values.release, '1.0.0');

    storage.values.whatsNewClicked = true;
    storage.values.release = '1.0.1';
    await release.load();
    assert.equal(storage.values.whatsNewClicked, true);
});

test('release service records acknowledgement and release-notes clicks', async () => {
    const storage = createStorage({ release: '1.0.0' });
    const release = createReleaseService({
        storage,
        runtime: { getManifest: () => ({ version: '1.0.1' }) }
    });

    await release.acknowledgeRelease();
    await release.markWhatsNewClicked();

    assert.deepEqual(storage.values, { release: '1.0.1', whatsNewClicked: true });
});

test('release service requires storage and runtime adapters', () => {
    assert.throws(
        () => createReleaseService({ runtime: { getManifest: () => ({}) } }),
        /storage adapter/
    );
    assert.throws(() => createReleaseService({ storage: createStorage() }), /runtime adapter/);
});
