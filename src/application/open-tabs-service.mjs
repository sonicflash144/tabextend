import { filterListableTabs, savedTabFromBrowserTab } from '../domain/browser-tabs.mjs';

/**
 * Open-tab workflows for the new tab page: listing the current window,
 * capturing open tabs as stored tabs, and reopening stored tabs.
 */
export function createOpenTabsService(options) {
    const { tabs, idFactory } = options;

    if (!tabs || typeof tabs.query !== 'function') {
        throw new Error('A tabs repository is required.');
    }
    if (typeof idFactory !== 'function') {
        throw new Error('An id factory is required.');
    }

    /** Tabs of the current window that the extension is allowed to show. */
    async function list() {
        return filterListableTabs(await tabs.query({ currentWindow: true }), {
            allowFileUrls: tabs.capabilities?.fileUrls === true
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
        const activeTab = await tabs.queryActiveTab();
        await tabs.remove(browserTabId);
        if (activeTab) await tabs.activate(activeTab.id);
    }

    function activate(browserTabId) {
        return tabs.activate(browserTabId);
    }

    function move(browserTabId, index) {
        return tabs.move(browserTabId, { index });
    }

    /**
     * Open several stored tabs together, grouped where the browser can, and
     * report each URL as `opened` or `refused` rather than letting one refusal
     * hide what the rest did.
     */
    function openUrls(urls, openOptions = {}) {
        return tabs.openUrls(urls, openOptions);
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
