import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import webpack from 'webpack';
import webpackConfig from '../webpack.config.js';
import { createZipFromDirectory } from './zip-directory.mjs';

export const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'safari'];

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(repositoryRoot, 'build');
const stagingRoot = path.join(buildRoot, '.staging');
export const SHARED_EXTENSION_PATHS = ['icon.png', 'icons', 'newtab.css', 'newtab.html'];

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeManifest(base, override) {
    const merged = { ...base };
    Object.entries(override).forEach(([key, value]) => {
        if (value === null) {
            delete merged[key];
            return;
        }
        merged[key] =
            isObject(value) && isObject(base[key]) ? mergeManifest(base[key], value) : value;
    });
    return merged;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function createTargetManifest(browser) {
    if (!SUPPORTED_BROWSERS.includes(browser)) {
        throw new Error(`Unsupported browser target ${JSON.stringify(browser)}.`);
    }
    const base = await readJson(path.join(repositoryRoot, 'manifest.json'));
    const override = await readJson(
        path.join(repositoryRoot, 'browser', browser, 'manifest.override.json')
    );
    return mergeManifest(base, override);
}

function buildSharedBundles() {
    return new Promise((resolve, reject) => {
        webpack({ ...webpackConfig, mode: 'production' }, (error, stats) => {
            if (error) {
                reject(error);
                return;
            }
            if (stats.hasErrors()) {
                reject(new Error(stats.toString({ colors: false, errors: true, warnings: true })));
                return;
            }
            resolve(stats);
        });
    });
}

async function writeTarget(browser) {
    const outputDirectory = path.join(stagingRoot, browser);
    const legacyOutputDirectory = path.join(buildRoot, browser);
    const archivePath = path.join(buildRoot, `${browser}.zip`);
    await rm(legacyOutputDirectory, { recursive: true, force: true });
    await rm(outputDirectory, { recursive: true, force: true });
    await rm(archivePath, { force: true });
    await mkdir(outputDirectory, { recursive: true });

    await Promise.all(
        SHARED_EXTENSION_PATHS.map(file =>
            cp(path.join(repositoryRoot, file), path.join(outputDirectory, file), {
                recursive: true
            })
        )
    );
    await cp(path.join(repositoryRoot, 'dist'), path.join(outputDirectory, 'dist'), {
        recursive: true
    });

    const manifest = await createTargetManifest(browser);
    await writeFile(
        path.join(outputDirectory, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    );
    await createZipFromDirectory(outputDirectory, archivePath);
    await rm(outputDirectory, { recursive: true, force: true });
    return archivePath;
}

export async function buildBrowsers(target = 'all') {
    const browsers = target === 'all' ? SUPPORTED_BROWSERS : [target];
    browsers.forEach(browser => {
        if (!SUPPORTED_BROWSERS.includes(browser)) {
            throw new Error(`Unsupported browser target ${JSON.stringify(browser)}.`);
        }
    });

    await buildSharedBundles();
    await mkdir(stagingRoot, { recursive: true });
    try {
        return await Promise.all(browsers.map(writeTarget));
    } finally {
        await rm(stagingRoot, { recursive: true, force: true });
    }
}

async function main() {
    const target = process.argv[2] || 'all';
    const archives = await buildBrowsers(target);
    archives.forEach(archive => {
        process.stdout.write(`Built ${path.relative(repositoryRoot, archive)}\n`);
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
