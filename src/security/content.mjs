/**
 * `file:` is deliberately absent: local files are navigable pages rather than
 * a scripting or privilege risk, and whether they may be listed or opened at
 * all is a browser capability decided in `domain/browser-tabs.mjs`.
 */
const BLOCKED_PAGE_PROTOCOLS = new Set([
    'about:',
    'brave:',
    'chrome:',
    'data:',
    'edge:',
    'javascript:',
    'moz-extension:',
    'opera:',
    'safari-web-extension:',
    'vbscript:',
    'vivaldi:'
]);

const ALLOWED_IMAGE_PROTOCOLS = new Set([
    'blob:',
    'chrome:',
    'chrome-extension:',
    'data:',
    'http:',
    'https:',
    'moz-extension:'
]);

function parseAbsoluteUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

/** Return a navigable absolute URL, or an empty string for unsafe input. */
export function safePageUrl(value) {
    const url = parseAbsoluteUrl(value);
    if (!url || BLOCKED_PAGE_PROTOCOLS.has(url.protocol.toLowerCase())) return '';
    return url.href;
}

/** Return an image URL suitable for an img element, or an empty string. */
export function safeImageUrl(value) {
    const url = parseAbsoluteUrl(value);
    if (!url || !ALLOWED_IMAGE_PROTOCOLS.has(url.protocol.toLowerCase())) return '';
    if (url.protocol.toLowerCase() === 'data:' && !/^data:image\//i.test(value)) return '';
    return value;
}

export function legacyNoteToEditableText(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/<br\s*\/?>/gi, '\n');
}

export function legacyNoteToDisplayText(value) {
    return legacyNoteToEditableText(value).replace(/\\/g, '');
}

/** Keep the historical persisted note format for downgrade/export compatibility. */
export function textToLegacyStoredNote(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
}
