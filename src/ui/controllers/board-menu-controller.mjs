import { createColorMenu, createMenuDropdown } from '../rendering.mjs';

function toIds(value) {
    return Array.isArray(value) ? value : [value];
}

/**
 * Own the saved-board menu choices and selection-sensitive menu behavior.
 * State changes and browser workflows remain injected callbacks.
 */
export function createBoardMenuController(document, options) {
    const {
        menuController,
        selectionController,
        colors,
        getTab,
        beginTitleEdit,
        beginNoteEdit,
        handlers = {}
    } = options;
    const {
        onClearDates = () => {},
        onColorChange = () => {},
        onDeleteTabs = () => {},
        onOpenColumn = () => {},
        onDeleteColumn = () => {},
        onOpenGroup = () => {},
        onUngroup = () => {},
        onDeleteGroup = () => {}
    } = handlers;

    if (!menuController || typeof menuController.toggle !== 'function') {
        throw new Error('A menu controller is required.');
    }
    if (!selectionController || typeof selectionController.clear !== 'function') {
        throw new Error('A selection controller is required.');
    }
    if (typeof getTab !== 'function') throw new Error('A tab reader is required.');
    if (typeof beginTitleEdit !== 'function' || typeof beginNoteEdit !== 'function') {
        throw new Error('Board editing callbacks are required.');
    }

    function closeAll() {
        menuController.closeAll();
    }

    function clearDates(tabIds, dateDisplay) {
        onClearDates(toIds(tabIds));
        dateDisplay.textContent = '';
        dateDisplay.classList.add('hidden');
        closeAll();
    }

    function openColorMenu(tabIds, moreOptionsButton) {
        const ids = toIds(tabIds);
        menuController.toggle('color', 'color', () =>
            createColorMenu(document, {
                colors,
                button: moreOptionsButton,
                onSelect: color => {
                    onColorChange(ids, color);
                    closeAll();
                }
            })
        );
    }

    function openTabMenu(context) {
        const { tab, item, dateDisplay, moreOptionsButton, formattedDate } = context;
        const selectedItems = document.querySelectorAll('.selected');
        const isCurrentTabSelected = item.classList.contains('selected');

        if (!isCurrentTabSelected) selectionController.clear();

        let menuItems;
        if (selectedItems.length > 1 && isCurrentTabSelected) {
            const selectedTabIds = Array.from(selectedItems).map(selected =>
                selected.id.slice('tab-'.length)
            );
            const hasDate = selectedTabIds.some(tabId => getTab(tabId)?.parsedDate);

            menuItems = [
                {
                    text: 'Clear Date',
                    action: () => clearDates(selectedTabIds, dateDisplay),
                    hidden: !hasDate
                },
                {
                    text: 'Color',
                    action: () => openColorMenu(selectedTabIds, moreOptionsButton)
                },
                { text: 'Delete', action: () => onDeleteTabs(selectedTabIds) }
            ];
        } else {
            const noteButtonText = tab.note && tab.note.trim() !== '' ? 'Edit Note' : 'Add Note';
            menuItems = [
                {
                    text: 'Rename',
                    action: () => {
                        beginTitleEdit(item);
                        closeAll();
                    }
                },
                {
                    text: noteButtonText,
                    action: () => {
                        beginNoteEdit(item);
                        closeAll();
                    }
                },
                {
                    text: 'Clear Date',
                    action: () => clearDates(tab.id, dateDisplay),
                    hidden: !formattedDate
                },
                { text: 'Color', action: () => openColorMenu(tab.id, moreOptionsButton) },
                { text: 'Delete', action: () => onDeleteTabs([tab.id]) }
            ];
        }
        return menuController.toggle('options', tab.id, () =>
            createMenuDropdown(document, menuItems, moreOptionsButton)
        );
    }

    function openColumnMenu({ column, menuButton }) {
        selectionController.clear();
        return menuController.toggle('column', column.id, () =>
            createMenuDropdown(
                document,
                [
                    { text: 'Open All', action: () => onOpenColumn(column.id) },
                    { text: 'Delete Column', action: () => onDeleteColumn(column.id) }
                ],
                menuButton
            )
        );
    }

    function openGroupMenu({ group, moreOptionsButton }) {
        selectionController.clear();
        return menuController.toggle('options', group.id, () =>
            createMenuDropdown(
                document,
                [
                    {
                        text: 'Open All',
                        action: () => {
                            onOpenGroup(group.id);
                            closeAll();
                        }
                    },
                    {
                        text: 'Ungroup',
                        action: () => {
                            onUngroup(group.id);
                            closeAll();
                        }
                    },
                    {
                        text: 'Delete',
                        action: () => {
                            onDeleteGroup(group.id);
                            closeAll();
                        }
                    }
                ],
                moreOptionsButton
            )
        );
    }

    return { closeAll, openColorMenu, openColumnMenu, openGroupMenu, openTabMenu };
}
