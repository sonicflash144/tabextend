export function createMenuController() {
    const activeMenus = new Map();

    function close(kind) {
        const active = activeMenus.get(kind);
        active?.menu.remove();
        activeMenus.delete(kind);
    }

    function closeAll() {
        [...activeMenus.keys()].forEach(close);
    }

    function isOpen(kind, identity) {
        const active = activeMenus.get(kind);
        return Boolean(active && active.identity === String(identity));
    }

    function open(kind, identity, createMenu) {
        closeAll();
        const menu = createMenu();
        activeMenus.set(kind, { identity: String(identity), menu });
        return menu;
    }

    function toggle(kind, identity, createMenu) {
        if (isOpen(kind, identity)) {
            closeAll();
            return null;
        }
        return open(kind, identity, createMenu);
    }

    function get(kind) {
        return activeMenus.get(kind)?.menu ?? null;
    }

    return { close, closeAll, get, isOpen, open, toggle };
}
