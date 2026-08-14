/**
 * Browser tab boundary. Wraps the neutral API adapters so application code
 * never calls the WebExtension namespace directly, and hides the tab-group
 * capability difference between Chrome, Firefox, and Safari.
 */
export function createTabsRepository(browserApi) {
    if (!browserApi?.tabs) {
        throw new Error('A WebExtension tabs API is required.');
    }
    const { tabs, tabGroups, capabilities = {} } = browserApi;

    function get(tabId) {
        return tabs.get(tabId);
    }

    function query(queryInfo) {
        return tabs.query(queryInfo);
    }

    function create(createProperties) {
        return tabs.create(createProperties);
    }

    function remove(tabIds) {
        return tabs.remove(tabIds);
    }

    function move(tabId, moveProperties) {
        return tabs.move(tabId, moveProperties);
    }

    function activate(tabId) {
        return tabs.update(tabId, { active: true });
    }

    async function queryActiveTab() {
        const active = await tabs.query({ active: true, currentWindow: true });
        return active[0] || null;
    }

    /**
     * Open background tabs at an optional index and, where the browser
     * supports tab groups, collect them into one titled group.
     */
    async function openUrls(urls, options = {}) {
        const { index = null, groupTitle = null } = options;
        const targets = (Array.isArray(urls) ? urls : []).filter(Boolean);
        if (targets.length === 0) return [];

        const created = await Promise.all(targets.map((url, offset) => {
            const createProperties = { url, active: false };
            if (index !== null) createProperties.index = index + offset;
            return create(createProperties);
        }));

        if (!capabilities.tabGroups) return created;

        const tabIds = created.map(tab => tab?.id).filter(id => id !== undefined);
        if (tabIds.length === 0) return created;

        const groupId = await tabs.group({ tabIds });
        if (groupTitle) await tabGroups.update(groupId, { title: groupTitle });
        return created;
    }

    return {
        activate,
        capabilities,
        create,
        get,
        move,
        onMoved: tabs.onMoved,
        onRemoved: tabs.onRemoved,
        onUpdated: tabs.onUpdated,
        openUrls,
        query,
        queryActiveTab,
        remove
    };
}
