import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    faviconServiceUrl,
    filterListableTabs,
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

test('lists only tabs the extension may show', () => {
    const tabs = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'edge://settings' },
        { id: 3, url: '' },
        { id: 4, url: 'moz-extension://abc/newtab.html' },
        { id: 5, url: 'http://localhost:3000' }
    ];
    assert.deepEqual(
        filterListableTabs(tabs).map(tab => tab.id),
        [1, 5]
    );
    assert.deepEqual(filterListableTabs(undefined), []);
});

test('falls back to the favicon service and tolerates unparsable urls', () => {
    assert.equal(
        faviconServiceUrl('https://example.com/deep/page?query=1'),
        'https://www.google.com/s2/favicons?domain=example.com&sz=32'
    );
    assert.equal(faviconServiceUrl('not a url'), '');
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
