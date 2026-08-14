import { isRestrictedUrl } from '../domain/browser-tabs.mjs';

export const SAVE_TAB_MENU_ID = 'saveTab';
export const SAVE_TAB_MENU_TITLE = 'Save to Tabs Magic';
export const NEW_TAB_PAGE = 'newtab.html';

/**
 * Background workflows: the page context menu that saves a tab into the
 * queue, its visibility rules, and the toolbar action.
 */
export function createBackgroundService(options) {
    const { browserApi, queue, onError = () => {} } = options;

    if (!browserApi?.tabs || !browserApi?.contextMenus) {
        throw new Error('A WebExtension API with tabs and contextMenus is required.');
    }
    if (typeof queue?.enqueue !== 'function') {
        throw new Error('A background tab queue is required.');
    }

    const { action, contextMenus, tabs } = browserApi;

    function report(error) {
        if (error) onError(error);
    }

    function createMenu() {
        return Promise.resolve(contextMenus.create({
            id: SAVE_TAB_MENU_ID,
            title: SAVE_TAB_MENU_TITLE,
            contexts: ['page', 'selection'],
            visible: false // Start hidden
        })).catch(report);
    }

    /** The menu only applies to pages the extension is allowed to save. */
    function updateMenuVisibility(url) {
        if (!url) return Promise.resolve();
        return Promise.resolve(contextMenus.update(SAVE_TAB_MENU_ID, {
            visible: !isRestrictedUrl(url)
        })).catch(report);
    }

    /** Queue a tab for the new tab page, then close it. */
    async function saveTab(browserTabId, selectionText) {
        const tab = await tabs.get(browserTabId);
        const queuedTab = await queue.enqueue(tab, selectionText);
        await tabs.remove(browserTabId);
        return queuedTab;
    }

    function openNewTabPage() {
        return Promise.resolve(tabs.create({ url: NEW_TAB_PAGE })).catch(report);
    }

    // Listeners return their pending work so callers can observe failures;
    // the browser ignores return values for all of these events.
    function start() {
        browserApi.runtime.onInstalled.addListener(() => createMenu());

        tabs.onUpdated.addListener((tabId, changeInfo, tab) => updateMenuVisibility(tab?.url));

        tabs.onActivated.addListener(async ({ tabId }) => {
            try {
                const tab = await tabs.get(tabId);
                await updateMenuVisibility(tab?.url);
            } catch (error) {
                report(error);
            }
        });

        action.onClicked.addListener(() => openNewTabPage());

        contextMenus.onClicked.addListener((info, tab) => {
            if (info.menuItemId !== SAVE_TAB_MENU_ID) return undefined;
            return saveTab(tab.id, info.selectionText).catch(report);
        });
    }

    return { createMenu, openNewTabPage, saveTab, start, updateMenuVisibility };
}
