import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';

import {
    createTargetManifest,
    SHARED_EXTENSION_PATHS,
    SUPPORTED_BROWSERS
} from '../../scripts/build-browsers.mjs';
import { createZipFromDirectory } from '../../scripts/zip-directory.mjs';

function unzipEntries(archive) {
    const endOffset = archive.length - 22;
    assert.equal(archive.readUInt32LE(endOffset), 0x06054b50);
    const entryCount = archive.readUInt16LE(endOffset + 10);
    let centralOffset = archive.readUInt32LE(endOffset + 16);
    const entries = new Map();

    for (let index = 0; index < entryCount; index += 1) {
        assert.equal(archive.readUInt32LE(centralOffset), 0x02014b50);
        const compressedSize = archive.readUInt32LE(centralOffset + 20);
        const nameLength = archive.readUInt16LE(centralOffset + 28);
        const extraLength = archive.readUInt16LE(centralOffset + 30);
        const commentLength = archive.readUInt16LE(centralOffset + 32);
        const localOffset = archive.readUInt32LE(centralOffset + 42);
        const name = archive
            .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
            .toString('utf8');

        assert.equal(archive.readUInt32LE(localOffset), 0x04034b50);
        const localNameLength = archive.readUInt16LE(localOffset + 26);
        const localExtraLength = archive.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        entries.set(
            name,
            inflateRawSync(archive.subarray(dataOffset, dataOffset + compressedSize))
        );
        centralOffset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

test('build configuration produces focused manifests for every browser', async () => {
    assert.deepEqual(SUPPORTED_BROWSERS, ['chrome', 'firefox', 'safari']);
    assert.ok(SHARED_EXTENSION_PATHS.includes('icons'));

    const chrome = await createTargetManifest('chrome');
    assert.equal(chrome.background.service_worker, 'dist/background.js');
    assert.equal(chrome.background.scripts, undefined);
    assert.equal(chrome.permissions.includes('tabGroups'), true);

    const firefox = await createTargetManifest('firefox');
    assert.deepEqual(firefox.background.scripts, ['dist/background.js']);
    assert.equal(firefox.background.service_worker, undefined);
    assert.equal(firefox.permissions.includes('tabGroups'), true);
    assert.equal(firefox.browser_specific_settings.gecko.id, 'sageywang@gmail.com');
    assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '139.0');

    const safari = await createTargetManifest('safari');
    assert.deepEqual(safari.background.scripts, ['dist/background.js']);
    assert.equal(safari.background.service_worker, 'dist/background.js');
    assert.deepEqual(safari.background.preferred_environment, ['service_worker']);
    assert.equal(safari.permissions.includes('tabGroups'), false);
});

test('ZIP packaging preserves root and nested extension files', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tabs-magic-zip-'));
    const source = path.join(temporaryRoot, 'source');
    const archivePath = path.join(temporaryRoot, 'browser.zip');

    try {
        await mkdir(path.join(source, 'dist'), { recursive: true });
        await writeFile(path.join(source, 'manifest.json'), '{"manifest_version":3}\n');
        await writeFile(path.join(source, 'dist', 'bundle.js'), 'console.log("bundle");\n');

        const result = await createZipFromDirectory(source, archivePath);
        assert.deepEqual(result.entries, ['dist/bundle.js', 'manifest.json']);

        const entries = unzipEntries(await readFile(archivePath));
        assert.equal(entries.get('manifest.json').toString(), '{"manifest_version":3}\n');
        assert.equal(entries.get('dist/bundle.js').toString(), 'console.log("bundle");\n');
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});
