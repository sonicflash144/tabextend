import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { deflateRaw as deflateRawCallback } from 'node:zlib';

const deflateRaw = promisify(deflateRawCallback);
const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const DOS_TIME = 0;
const DOS_DATE = 33;

const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
});

function crc32(buffer) {
    let value = 0xffffffff;
    for (const byte of buffer) {
        value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
}

async function filesIn(directory, relativeDirectory = '') {
    const absoluteDirectory = path.join(directory, relativeDirectory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const relativePath = path.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await filesIn(directory, relativePath)));
        } else if (entry.isFile()) {
            files.push(relativePath.split(path.sep).join('/'));
        }
    }
    return files;
}

function localHeader(name, data, compressedData, checksum) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(DEFLATE_METHOD, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressedData.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, nameBuffer, compressedData]);
}

function centralHeader(name, data, compressedData, checksum, offset) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(DEFLATE_METHOD, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(compressedData.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    return Buffer.concat([header, nameBuffer]);
}

function endRecord(entryCount, centralSize, centralOffset) {
    if (entryCount > 0xffff) throw new Error('ZIP archive contains too many files.');
    const record = Buffer.alloc(22);
    record.writeUInt32LE(0x06054b50, 0);
    record.writeUInt16LE(0, 4);
    record.writeUInt16LE(0, 6);
    record.writeUInt16LE(entryCount, 8);
    record.writeUInt16LE(entryCount, 10);
    record.writeUInt32LE(centralSize, 12);
    record.writeUInt32LE(centralOffset, 16);
    record.writeUInt16LE(0, 20);
    return record;
}

/** Create a deterministic, compressed ZIP containing a directory's contents. */
export async function createZipFromDirectory(directory, outputFile) {
    const fileNames = await filesIn(directory);
    const localEntries = [];
    const centralEntries = [];
    let offset = 0;

    for (const name of fileNames) {
        const data = await readFile(path.join(directory, ...name.split('/')));
        const compressedData = await deflateRaw(data, { level: 9 });
        const checksum = crc32(data);
        const localEntry = localHeader(name, data, compressedData, checksum);
        localEntries.push(localEntry);
        centralEntries.push(centralHeader(name, data, compressedData, checksum, offset));
        offset += localEntry.length;
    }

    const centralDirectory = Buffer.concat(centralEntries);
    const archive = Buffer.concat([
        ...localEntries,
        centralDirectory,
        endRecord(fileNames.length, centralDirectory.length, offset)
    ]);
    await writeFile(outputFile, archive);
    return { outputFile, entries: fileNames };
}
