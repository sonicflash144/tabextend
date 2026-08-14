import { savedTabFromBrowserTab } from '../domain/browser-tabs.mjs';

export const BACKGROUND_TABS_KEY = 'bgTabs';

/**
 * Queue of tabs saved outside the new tab page. The new tab page drains this
 * key on startup and on storage changes, so the queue only ever appends.
 */
export function createBackgroundTabQueue(options) {
    const { storage, idFactory } = options;

    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new Error('A storage adapter with get and set methods is required.');
    }
    if (typeof idFactory !== 'function') {
        throw new Error('An id factory is required.');
    }

    async function read() {
        const data = await storage.get([BACKGROUND_TABS_KEY]);
        const queued = data[BACKGROUND_TABS_KEY];
        return Array.isArray(queued) ? queued : [];
    }

    /** Append a browser tab, optionally carrying the selected page text. */
    async function enqueue(tab, note) {
        const queuedTab = savedTabFromBrowserTab(tab, {
            id: idFactory(),
            note: note || null
        });
        const queued = await read();
        await storage.set({ [BACKGROUND_TABS_KEY]: [...queued, queuedTab] });
        return queuedTab;
    }

    return { enqueue, read };
}
