import { filterListableTabs, savedTabFromBrowserTab } from '../domain/browser-tabs.mjs';

/**
 * Open-tab workflows for the new tab page: listing the current window,
 * capturing open tabs as stored tabs, and reopening stored tabs.
 */
export function createOpenTabsService(options) {
    const { browserApi, idFactory } = options;

    if (!browserApi?.tabs || typeof browserApi.tabs.query !== 'function') {
        throw new Error('A WebExtension tabs API is required.');
    }
    if (typeof idFactory !== 'function') {
        throw new Error('An id factory is required.');
    }
    const { tabs, tabGroups, capabilities = {} } = browserApi;

    /** Tabs of the current window that the extension is allowed to show. */
    async function list() {
        return filterListableTabs(await tabs.query({ currentWindow: true }), {
            allowFileUrls: capabilities.fileUrls === true
        });
    }

    /** Read open tabs and convert them into stored tabs without closing them. */
    async function capture(browserTabIds) {
        return Promise.all(
            browserTabIds.map(async browserTabId => {
                const tab = await tabs.get(browserTabId);
                return {
                    browserTabId,
                    savedTab: savedTabFromBrowserTab(tab, { id: idFactory() })
                };
            })
        );
    }

    function close(browserTabIds) {
        const ids = Array.isArray(browserTabIds) ? browserTabIds : [browserTabIds];
        if (ids.length === 0) return Promise.resolve();
        return tabs.remove(ids);
    }

    /** Close a tab while keeping the window focused on its active tab. */
    async function closeKeepingFocus(browserTabId) {
        const activeTabs = await tabs.query({ active: true, currentWindow: true });
        const activeTab = activeTabs[0] || null;
        await tabs.remove(browserTabId);
        if (activeTab) await tabs.update(activeTab.id, { active: true });
    }

    function activate(browserTabId) {
        return tabs.update(browserTabId, { active: true });
    }

    function move(browserTabId, index) {
        return tabs.move(browserTabId, { index });
    }

    /**
     * Open several stored tabs together, grouped where the browser can, and
     * report each URL as `opened` or `refused` rather than letting one refusal
     * hide what the rest did.
     */
    async function openUrls(urls, openOptions = {}) {
        const { index = null, groupTitle = null } = openOptions;
        const targets = (Array.isArray(urls) ? urls : []).filter(Boolean);
        if (targets.length === 0) return { opened: [], refused: [] };

        const results = await Promise.all(
            targets.map(async (url, offset) => {
                const createProperties = { url, active: false };
                if (index !== null) createProperties.index = index + offset;
                try {
                    return { url, tab: await tabs.create(createProperties) };
                } catch (error) {
                    return { url, error };
                }
            })
        );

        const opened = results.filter(result => !result.error);
        const refused = results.filter(result => result.error);

        if (capabilities.tabGroups) {
            const tabIds = opened.map(result => result.tab?.id).filter(id => id !== undefined);
            if (tabIds.length > 0) {
                const groupId = await tabs.group({ tabIds });
                if (groupTitle) await tabGroups.update(groupId, { title: groupTitle });
            }
        }

        return { opened, refused };
    }

    /** Open one stored tab behind the current one, without grouping it. */
    function openInBackground(url, index) {
        const createProperties = { url, active: false };
        if (index !== undefined && index !== null) createProperties.index = index;
        return tabs.create(createProperties);
    }

    function openPage(url) {
        return tabs.create({ url, active: true });
    }

    /**
     * Re-run a listing whenever the browser's open tabs change. Firefox
     * reports removals before the window settles, so its refresh is delayed.
     */
    function onChanged(handler, changeOptions = {}) {
        const { removalDelay = 0, schedule = setTimeout } = changeOptions;
        const handleRemoved = removalDelay > 0 ? () => schedule(handler, removalDelay) : handler;

        tabs.onUpdated.addListener(handler);
        tabs.onRemoved.addListener(handleRemoved);
        tabs.onMoved.addListener(handler);

        return () => {
            tabs.onUpdated.removeListener(handler);
            tabs.onRemoved.removeListener(handleRemoved);
            tabs.onMoved.removeListener(handler);
        };
    }

    return {
        activate,
        capture,
        close,
        closeKeepingFocus,
        list,
        move,
        onChanged,
        openInBackground,
        openPage,
        openUrls
    };
}
