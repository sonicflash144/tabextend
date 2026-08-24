import { isRestrictedUrl } from '../domain/browser-tabs.mjs';

export const SAVE_TAB_MENU_ID = 'saveTab';
export const SAVE_TAB_MENU_TITLE = 'Save to Tabs Magic';
export const NEW_TAB_PAGE = 'newtab.html';

/**
 * Background workflows: the page and tab-strip context menu that saves a tab into the
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
    const capabilities = browserApi.capabilities || {};
    const allowFileUrls =
        capabilities.fileUrls === true || capabilities.fileUrlContextMenu === true;
    // Safari reports an empty URL for an open local-file tab. Keep the menu
    // available there and validate the click payload before saving anything.
    const showWhenUrlUnavailable =
        capabilities.fileUrlContextMenu === true && capabilities.fileUrls !== true;

    function report(error) {
        if (error) onError(error);
    }

    function createMenu() {
        return Promise.resolve(
            contextMenus.create({
                id: SAVE_TAB_MENU_ID,
                title: SAVE_TAB_MENU_TITLE,
                contexts: ['page', 'selection', 'tab'],
                visible: showWhenUrlUnavailable
            })
        ).catch(report);
    }

    /** The menu only applies to pages the extension is allowed to save. */
    function updateMenuVisibility(url) {
        if (!url && !showWhenUrlUnavailable) return Promise.resolve();
        const visible = url ? !isRestrictedUrl(url, { allowFileUrls }) : showWhenUrlUnavailable;
        return Promise.resolve(
            contextMenus.update(SAVE_TAB_MENU_ID, {
                visible
            })
        ).catch(report);
    }

    /** Queue a tab for the new tab page, then close it. */
    async function saveTab(browserTabId, selectionText, clickContext = {}) {
        const fetchedTab = await tabs.get(browserTabId);
        const tab = { ...(clickContext.tab || {}), ...(fetchedTab || {}) };
        // Safari's tabs.get() returns an empty URL for local files, while the
        // context-menu event can still identify the page on which it appeared.
        tab.url = clickContext.pageUrl || tab.url;
        if (isRestrictedUrl(tab.url, { allowFileUrls })) {
            throw new Error('The context-menu click did not include a savable page URL.');
        }
        if (!tab.title) tab.title = tab.url;
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
            return saveTab(tab.id, info.selectionText, {
                pageUrl: info.pageUrl,
                tab
            }).catch(report);
        });
    }

    return { createMenu, openNewTabPage, saveTab, start, updateMenuVisibility };
}
