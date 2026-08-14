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
    'file://',
    'safari-web-extension://'
];

const SAVED_TAB_DEFAULT_COLOR = '#FFFFFF';

/** Browser-internal pages that the extension may neither list nor save. */
export function isRestrictedUrl(url) {
    if (typeof url !== 'string' || url === '') return true;
    const normalized = url.toLowerCase();
    return RESTRICTED_URL_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function isListableTab(tab) {
    return Boolean(tab) && !isRestrictedUrl(tab.url);
}

export function filterListableTabs(tabs) {
    return (Array.isArray(tabs) ? tabs : []).filter(isListableTab);
}

/** Favicon fallback for tabs the browser did not supply an icon for. */
export function faviconServiceUrl(tabUrl) {
    try {
        const url = new URL(tabUrl);
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
