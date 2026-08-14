/**
 * Pure helpers describing how browser tabs are filtered, decorated, and
 * converted into stored tabs. Shared by the new tab page and the background
 * worker so both entry points apply identical rules.
 */

export const RESTRICTED_URL_PREFIXES = [
    'chrome://',
    'edge://',
    'opera://',
    'vivaldi://',
    'brave://',
    'moz-extension://',
    'about:',
    'safari-web-extension://'
];

export const FILE_URL_PREFIX = 'file://';

const SAVED_TAB_DEFAULT_COLOR = '#FFFFFF';

/** A local file, which only some browsers let an extension list and open. */
export function isFileUrl(url) {
    return typeof url === 'string' && url.toLowerCase().startsWith(FILE_URL_PREFIX);
}

/**
 * Browser-internal pages that the extension may neither list nor save. Local
 * files are restricted unless the caller says the browser can open them, so
 * callers that know nothing about the browser keep the historical behaviour.
 */
export function isRestrictedUrl(url, options = {}) {
    if (typeof url !== 'string' || url === '') return true;
    const normalized = url.toLowerCase();
    if (normalized.startsWith(FILE_URL_PREFIX)) return options.allowFileUrls !== true;
    return RESTRICTED_URL_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function isListableTab(tab, options = {}) {
    return Boolean(tab) && !isRestrictedUrl(tab.url, options);
}

export function filterListableTabs(tabs, options = {}) {
    return (Array.isArray(tabs) ? tabs : []).filter(tab => isListableTab(tab, options));
}

/** Favicon fallback for tabs the browser did not supply an icon for. */
export function faviconServiceUrl(tabUrl) {
    try {
        const url = new URL(tabUrl);
        // A local file never has an icon to look up: a plain path carries no
        // host at all, and a network share must not send its host, which is
        // private to that network, to the icon service.
        if (!url.hostname || url.protocol === 'file:') return '';
        return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    } catch {
        return '';
    }
}

export function resolveFaviconUrl(tab) {
    return tab?.favIconUrl || faviconServiceUrl(tab?.url);
}

/**
 * Build the stored tab shape from a browser tab. The note key is only added
 * for callers that capture one, matching the shapes already in storage.
 */
export function savedTabFromBrowserTab(tab, options = {}) {
    const { id, note } = options;
    const savedTab = {
        title: tab.title,
        url: tab.url,
        favIconUrl: resolveFaviconUrl(tab),
        id,
        color: SAVED_TAB_DEFAULT_COLOR
    };
    if (note !== undefined) savedTab.note = note || null;
    return savedTab;
}
