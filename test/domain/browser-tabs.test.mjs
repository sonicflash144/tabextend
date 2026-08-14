import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    faviconServiceUrl,
    filterListableTabs,
    isFileUrl,
    isRestrictedUrl,
    savedTabFromBrowserTab
} from '../../src/domain/browser-tabs.mjs';

test('treats browser-internal and empty urls as restricted', () => {
    assert.equal(isRestrictedUrl('https://example.com/page'), false);
    assert.equal(isRestrictedUrl('chrome://extensions'), true);
    assert.equal(isRestrictedUrl('CHROME://extensions'), true);
    assert.equal(isRestrictedUrl('about:blank'), true);
    assert.equal(isRestrictedUrl('safari-web-extension://abc/newtab.html'), true);
    assert.equal(isRestrictedUrl(''), true);
    assert.equal(isRestrictedUrl(undefined), true);
});

test('restricts local files unless the browser can open them', () => {
    assert.equal(isRestrictedUrl('file:///home/notes.html'), true);
    assert.equal(isRestrictedUrl('file:///home/notes.html', { allowFileUrls: false }), true);
    assert.equal(isRestrictedUrl('file:///home/notes.html', { allowFileUrls: true }), false);
    assert.equal(isRestrictedUrl('FILE:///C:/notes.html', { allowFileUrls: true }), false);

    // The capability never reaches the browser's own pages.
    assert.equal(isRestrictedUrl('chrome://extensions', { allowFileUrls: true }), true);
    assert.equal(isRestrictedUrl('', { allowFileUrls: true }), true);
});

test('recognises local file urls whatever their case', () => {
    assert.equal(isFileUrl('file:///home/notes.html'), true);
    assert.equal(isFileUrl('FILE:///C:/notes.html'), true);
    assert.equal(isFileUrl('https://example.com'), false);
    assert.equal(isFileUrl(undefined), false);
});

test('lists only tabs the extension may show', () => {
    const tabs = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'edge://settings' },
        { id: 3, url: '' },
        { id: 4, url: 'moz-extension://abc/newtab.html' },
        { id: 5, url: 'http://localhost:3000' },
        { id: 6, url: 'file:///home/notes.html' }
    ];
    assert.deepEqual(
        filterListableTabs(tabs).map(tab => tab.id),
        [1, 5]
    );
    assert.deepEqual(
        filterListableTabs(tabs, { allowFileUrls: true }).map(tab => tab.id),
        [1, 5, 6]
    );
    assert.deepEqual(filterListableTabs(undefined), []);
});

test('falls back to the favicon service, but never for a local file', () => {
    assert.equal(
        faviconServiceUrl('https://example.com/deep/page?query=1'),
        'https://www.google.com/s2/favicons?domain=example.com&sz=32'
    );
    assert.equal(faviconServiceUrl('not a url'), '');
    // A plain path would otherwise ask the service for an empty domain.
    assert.equal(faviconServiceUrl('file:///home/notes.html'), '');
    assert.equal(faviconServiceUrl('FILE:///C:/notes.html'), '');
    // A network share has a host, which is private and must not be sent.
    assert.equal(faviconServiceUrl('file://myserver/share/doc.html'), '');
});

test('builds the stored tab shape and only adds a note when one is captured', () => {
    const tab = {
        title: 'Example',
        url: 'https://example.com',
        favIconUrl: 'https://example.com/i.png'
    };

    assert.deepEqual(savedTabFromBrowserTab(tab, { id: 'abc' }), {
        title: 'Example',
        url: 'https://example.com',
        favIconUrl: 'https://example.com/i.png',
        id: 'abc',
        color: '#FFFFFF'
    });

    assert.deepEqual(
        savedTabFromBrowserTab(
            { title: 'Example', url: 'https://example.com' },
            {
                id: 'abc',
                note: ''
            }
        ),
        {
            title: 'Example',
            url: 'https://example.com',
            favIconUrl: 'https://www.google.com/s2/favicons?domain=example.com&sz=32',
            id: 'abc',
            color: '#FFFFFF',
            note: null
        }
    );

    assert.equal(
        savedTabFromBrowserTab(tab, { id: 'abc', note: 'selected text' }).note,
        'selected text'
    );
});

test('stores no favicon for a local file, including one on a network share', () => {
    assert.equal(
        savedTabFromBrowserTab({ title: 'Notes', url: 'file:///home/notes.html' }, { id: 'abc' })
            .favIconUrl,
        ''
    );
    // Otherwise the share's host would be persisted, and exported, as part of
    // an icon service URL.
    assert.equal(
        savedTabFromBrowserTab(
            { title: 'Doc', url: 'file://myserver/share/doc.html' },
            { id: 'abc' }
        ).favIconUrl,
        ''
    );
});
