import { isFileUrl } from '../domain/browser-tabs.mjs';

/**
 * Chromium can open a local file, but only once the user has allowed this
 * extension file access. No manifest key requests that setting and nothing on
 * the API surface reports it, so a refused open is where the user finds out —
 * which means the message has to name the setting to turn on.
 */
export const LOCAL_FILE_ACCESS_MESSAGE =
    'Tabs Magic could not open a local file.\n\n' +
    'Go to the extensions page, open the details for Tabs Magic, and turn on ' +
    '"Allow access to file URLs". Then try again.';

/**
 * Firefox cannot open a local file from an extension at all, so there is no
 * setting to point at. Safari can open one without a setting and therefore
 * needs no special explanation if an unrelated tab creation error occurs.
 */
export const LOCAL_FILE_UNSUPPORTED_MESSAGE =
    'Opening local files is not supported on this browser.';

/**
 * What to tell the user about a failed open, or null when the logged error is
 * the whole story. Only an attempt that involved a local file has anything to
 * explain, and which explanation applies depends on whether this browser could
 * ever open one — a setting the user can change, or a capability it lacks.
 */
export function openFailureMessage(urls, options = {}) {
    if (!(Array.isArray(urls) ? urls : []).some(isFileUrl)) return null;
    if (options.canOpenFileUrls !== true) return LOCAL_FILE_UNSUPPORTED_MESSAGE;
    return options.hasFileUrlAccessSetting === false ? null : LOCAL_FILE_ACCESS_MESSAGE;
}

/**
 * Reports failed opens, explaining a batch of them at most once. The browser
 * refuses each local file separately, so dragging several onto the open-tab
 * list would otherwise raise a modal alert per tab for the user to dismiss in
 * turn. Every failure is still logged; only the explanation is pooled.
 */
export function createOpenFailureReporter(options = {}) {
    const {
        showAlert,
        logError = () => {},
        canOpenFileUrls = false,
        hasFileUrlAccessSetting
    } = options;
    if (typeof showAlert !== 'function') throw new Error('An alert function is required.');

    let depth = 0;
    // One slot is enough: the explanation follows the browser's capability
    // rather than the URL, so a single run can only ever produce one of them.
    let pending = null;

    function report(message, error, urls) {
        logError(message, error);
        const explanation = openFailureMessage(urls, {
            canOpenFileUrls,
            hasFileUrlAccessSetting
        });
        if (!explanation) return;
        if (depth === 0) showAlert(explanation);
        else pending = explanation;
    }

    /**
     * Run work whose refusals belong to one user action. The explanation waits
     * until the work has finished, so the board is already up to date behind
     * the alert, and it still appears if the work throws. Nesting is counted so
     * an inner batch cannot flush the outer one early.
     */
    async function batch(run) {
        depth += 1;
        try {
            return await run();
        } finally {
            depth -= 1;
            if (depth === 0 && pending) {
                const explanation = pending;
                pending = null;
                showAlert(explanation);
            }
        }
    }

    return { batch, report };
}
