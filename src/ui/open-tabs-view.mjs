import { createOpenTabView } from './rendering.mjs';

const NOOP = () => {};

/**
 * The sidebar list of the window's open tabs. Like the board, it renders and
 * wires the rows but delegates anything that touches the browser or the
 * selection back to the page.
 */
export function createOpenTabsView(document, options) {
    const { list, sidebar, presenter, handlers = {} } = options;

    if (!list) throw new Error('An open tabs list element is required.');
    if (!presenter) throw new Error('A tab presenter is required.');

    const {
        onActivate = NOOP,
        onClose = NOOP,
        onDragEnd = NOOP,
        onDragStart = NOOP,
        onSelect = NOOP
    } = handlers;

    function rowClasses() {
        const classes = ['tab-item'];
        // A collapsed sidebar shows icons only.
        if (sidebar && sidebar.classList.contains('collapsed')) classes.push('collapsed');
        return classes;
    }

    function renderTab(tab, index, classes = rowClasses()) {
        const { item, infoLeft, title, closeButton } = createOpenTabView(document, {
            tab,
            classes,
            ...presenter.presentOpen(tab),
            onDragStart,
            onDragEnd
        });

        item.setAttribute('data-tab-id', tab.id);
        item.setAttribute('data-index', index);

        closeButton.addEventListener('click', () => onClose(tab, item));
        infoLeft.addEventListener('click', event => onSelect(item, event));
        title.addEventListener('click', () => onActivate(tab, item));

        return item;
    }

    /** Replace the sidebar with a row per open tab, in window order. */
    function render(tabs) {
        const classes = rowClasses();
        list.replaceChildren();
        tabs.forEach((tab, index) => {
            list.appendChild(renderTab(tab, index, classes));
        });
        return list;
    }

    return { render, renderTab };
}
