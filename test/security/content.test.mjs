import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    legacyNoteToDisplayText,
    legacyNoteToEditableText,
    safeImageUrl,
    safePageUrl,
    textToLegacyStoredNote
} from '../../src/security/content.mjs';

test('decodes historical note line breaks without interpreting note HTML', () => {
    assert.equal(
        legacyNoteToEditableText('first<br>second<BR />third<script>alert(1)</script>'),
        'first\nsecond\nthird<script>alert(1)</script>'
    );
});

test('preserves the existing visual behavior for escaped reminder text', () => {
    assert.equal(
        legacyNoteToDisplayText('call \\tomorrow<br>bring notes'),
        'call tomorrow\nbring notes'
    );
});

test('continues writing the historical br-based note format', () => {
    assert.equal(textToLegacyStoredNote('first\r\nsecond\nthird'), 'first<br>second<br>third');
});

test('allows ordinary and custom navigable URLs', () => {
    assert.equal(safePageUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    assert.equal(safePageUrl('web+notes://open/123'), 'web+notes://open/123');
});

test('rejects scriptable, internal, file, relative, and malformed page URLs', () => {
    for (const value of [
        'javascript:alert(1)',
        'DATA:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///secrets.txt',
        'chrome://settings',
        '/relative/path',
        'not a url'
    ]) {
        assert.equal(safePageUrl(value), '', value);
    }
});

test('only permits supported image protocols and image data URLs', () => {
    assert.equal(
        safeImageUrl('https://example.com/favicon.png'),
        'https://example.com/favicon.png'
    );
    assert.equal(safeImageUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(safeImageUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(safeImageUrl('javascript:alert(1)'), '');
});
