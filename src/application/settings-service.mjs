const SETTINGS_KEYS = ['sidebarCollapsed', 'theme'];
const THEMES = ['light', 'dark'];
const DEFAULT_THEME = 'light';

export function nextTheme(theme) {
    return theme === 'dark' ? 'light' : 'dark';
}

/** Interface preferences that are stored alongside the saved tab state. */
export function createSettingsService(options) {
    const { storage } = options;

    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new Error('A storage adapter with get and set methods is required.');
    }

    async function load() {
        const data = await storage.get(SETTINGS_KEYS);
        return {
            sidebarCollapsed: data.sidebarCollapsed === true,
            theme: THEMES.includes(data.theme) ? data.theme : DEFAULT_THEME,
            storedTheme: THEMES.includes(data.theme) ? data.theme : null
        };
    }

    function saveTheme(theme) {
        return storage.set({ theme });
    }

    function saveSidebarCollapsed(sidebarCollapsed) {
        return storage.set({ sidebarCollapsed });
    }

    /** Sidebar state applied by another new tab page, or null when unchanged. */
    function readSidebarChange(changes = {}) {
        if (!changes.sidebarCollapsed) return null;
        return { sidebarCollapsed: changes.sidebarCollapsed.newValue === true };
    }

    return { load, readSidebarChange, saveSidebarCollapsed, saveTheme };
}
