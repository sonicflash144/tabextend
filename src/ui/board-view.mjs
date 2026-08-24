import { getTab } from '../domain/state.mjs';
import { createEditableTitleController } from './controllers/editable-title-controller.mjs';
import {
    createColumnView,
    createNewColumnIndicator,
    createSavedTabView,
    createSubgroupPreview,
    createSubgroupView,
    EMOJI_PICKER_WIDTH,
    popoverLeftForAnchor,
    setColumnMinimized,
    setSubgroupExpanded
} from './rendering.mjs';

const NOOP = () => {};

/**
 * Builds the saved-tab board from canonical state: columns, subgroups, and
 * tabs, with their in-place editing wired up. Everything that changes stored
 * state is delegated through `handlers`, so this module never reaches for the
 * store, storage, or the browser.
 */
export function createBoardView(document, options) {
    const {
        container,
        presenter,
        getTheme = () => 'light',
        nextFallbackEmoji = () => '',
        handlers = {}
    } = options;

    if (!container) throw new Error('A columns container element is required.');
    if (!presenter) throw new Error('A tab presenter is required.');

    const {
        onColumnDragStart = NOOP,
        onColumnEmojiChange = NOOP,
        onColumnMenu = NOOP,
        onColumnMinimizedChange = NOOP,
        onColumnRename = NOOP,
        onDragEnd = NOOP,
        onGroupExpandedChange = NOOP,
        onGroupMenu = NOOP,
        onGroupRename = NOOP,
        onNoteSave = NOOP,
        onTabDragStart = NOOP,
        onTabMenu = NOOP,
        onTabOpen = NOOP,
        onTabSelect = NOOP,
        onTitleSave = NOOP
    } = handlers;

    /**
     * Saved tabs are links, so the browser opens them itself and keeps its own
     * modifier-click handling. `onTabOpen` returns true for the URLs it opened
     * another way, which are the ones an extension page may not navigate to.
     */
    function wireOpening(anchor, tab, navigableUrl) {
        anchor.addEventListener('click', event => {
            if (onTabOpen(tab, navigableUrl, event)) event.preventDefault();
        });
    }

    /**
     * A row cannot be dragged while one of its fields is being edited, or a
     * text selection would start a drag.
     */
    function beginInlineEdit(item) {
        item.removeEventListener('dragstart', onTabDragStart);
        item.draggable = false;
        const column = item.closest('.column');
        if (column) column.draggable = false;
        const subgroup = item.closest('.subgroup-item');
        if (subgroup) subgroup.draggable = false;
    }

    /** Restore the row after an inline edit, including its drag handle. */
    function endInlineEdit(item) {
        item.draggable = true;
        const column = item.closest('.column');
        if (column) column.draggable = true;
        const subgroup = item.closest('.subgroup-item');
        if (subgroup) subgroup.draggable = true;
        item.addEventListener('dragstart', onTabDragStart);
    }

    function moveCaretToEnd(field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
    }

    /** Swap a tab's title for its input and put the caret in it. */
    function beginTitleEdit(item) {
        const titleDisplay = item.querySelector('.tab-title');
        const titleInput = item.querySelector('.tab-info-right input[type="text"]');

        // Kept so Escape can restore what was there before the edit.
        titleInput.dataset.originalValue = titleInput.value;
        beginInlineEdit(item);
        titleInput.classList.remove('hidden');
        titleDisplay.classList.add('hidden');
        moveCaretToEnd(titleInput);
    }

    /** Swap a tab's note for its editor, grown to fit what it holds. */
    function beginNoteEdit(item) {
        const noteDisplay = item.querySelector('.note-display');
        const noteInput = item.querySelector('.tab-note');

        noteInput.dataset.originalValue = noteInput.value;
        beginInlineEdit(item);
        noteInput.classList.remove('hidden');
        noteDisplay.classList.add('hidden');
        noteInput.style.height = 'auto';
        noteInput.style.height = `${noteInput.scrollHeight}px`;
        moveCaretToEnd(noteInput);
    }

    function wireTitleEditing(tab, item, view) {
        const { titleDisplay, titleInput } = view;

        titleInput.addEventListener('blur', () => {
            const title = titleInput.value;
            endInlineEdit(item);
            titleDisplay.textContent = title;
            titleDisplay.title = title;
            titleInput.classList.add('hidden');
            titleDisplay.classList.remove('hidden');
            onTitleSave(tab, title);
        });

        titleInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                titleInput.blur();
            } else if (event.key === 'Escape') {
                titleInput.value = titleInput.dataset.originalValue || '';
                titleInput.blur();
            }
        });
    }

    function wireNoteEditing(tab, item, view, presentation) {
        const { noteDisplay, noteInput, dateDisplay } = view;
        const { formattedDate, dateDisplayClass } = presentation;
        let currentDateDisplayClass = dateDisplayClass;

        noteDisplay.addEventListener('click', () => beginNoteEdit(item));

        noteInput.addEventListener('blur', () => {
            const note = noteInput.value;
            endInlineEdit(item);
            onNoteSave(tab, note);
            noteDisplay.textContent = presenter.noteDisplayText(note);
            noteInput.classList.add('hidden');
            noteDisplay.classList.remove('hidden');
        });

        // Kept so Escape can restore what was there before the edit.
        noteInput.dataset.originalValue = noteInput.value;

        noteInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                noteInput.blur();
            } else if (event.key === 'Escape') {
                noteInput.value = noteInput.dataset.originalValue || '';
                noteInput.blur();
            } else if (event.key === 'Enter' && event.shiftKey) {
                const start = noteInput.selectionStart;
                const end = noteInput.selectionEnd;
                noteInput.value =
                    `${noteInput.value.substring(0, start)}\n` + noteInput.value.substring(end);
                noteInput.selectionStart = start + 1;
                noteInput.selectionEnd = start + 1;
                event.preventDefault();
            }
        });

        noteInput.addEventListener('input', () => {
            noteInput.style.height = 'auto';
            noteInput.style.height = `${noteInput.scrollHeight}px`;

            // Show the due date the note is about to be saved with.
            const { parsedDate } = presenter.parseNote(noteInput.value);
            const preview = parsedDate
                ? presenter.formatDate(parsedDate)
                : { formattedDate, dateDisplayClass };
            if (!preview.formattedDate) {
                dateDisplay.classList.add('hidden');
                return;
            }
            dateDisplay.textContent = preview.formattedDate;
            dateDisplay.classList.remove('hidden');
            if (currentDateDisplayClass) dateDisplay.classList.remove(currentDateDisplayClass);
            if (preview.dateDisplayClass) dateDisplay.classList.add(preview.dateDisplayClass);
            currentDateDisplayClass = preview.dateDisplayClass;
        });
    }

    function renderTab(tab) {
        const presentation = presenter.present(tab);
        const view = createSavedTabView(document, {
            tab,
            ...presentation,
            onDragStart: onTabDragStart,
            onDragEnd
        });
        const item = view.item;

        wireOpening(view.titleDisplay, tab, presentation.navigableUrl);
        view.infoLeft.addEventListener('click', event => onTabSelect(item, event));
        view.moreOptionsButton.addEventListener('click', event => {
            event.stopPropagation();
            onTabMenu({
                tab,
                item,
                dateDisplay: view.dateDisplay,
                moreOptionsButton: view.moreOptionsButton,
                formattedDate: presentation.formattedDate
            });
        });
        wireTitleEditing(tab, item, view);
        wireNoteEditing(tab, item, view, presentation);

        return item;
    }

    function renderColumn(columnData) {
        const { titleGroup } = createEditableTitleController(document, {
            initialText: columnData.title,
            groupClass: 'title-group',
            inputClass: 'column-title-input',
            spanClass: 'column-title-text',
            container: 'h2',
            defaultText: 'New Column',
            showTooltip: true,
            onSave: value => {
                column.dataset.title = value;
                onColumnRename(column, value);
            }
        });
        const { column, minimizeButton, maximizeButton, menuButton, emojiButton, emojiPicker } =
            createColumnView(document, {
                id: columnData.id,
                minimized: columnData.minimized,
                emoji: columnData.emoji,
                theme: getTheme(),
                titleGroup,
                fallbackEmoji: nextFallbackEmoji(),
                onDragStart: onColumnDragStart,
                onDragEnd
            });

        minimizeButton.addEventListener('click', () => {
            setColumnMinimized(column, true);
            onColumnMinimizedChange(column, true);
        });
        maximizeButton.addEventListener('click', () => {
            setColumnMinimized(column, false);
            onColumnMinimizedChange(column, false);
        });
        menuButton.addEventListener('click', event => {
            event.stopPropagation();
            onColumnMenu({ column, menuButton });
        });

        emojiPicker.addEventListener('emoji-click', event => {
            const emoji = event.detail.unicode;
            emojiButton.textContent = emoji;
            column.dataset.emoji = emoji;
            emojiPicker.style.display = 'none';
            onColumnEmojiChange(column, emoji);
        });
        emojiButton.addEventListener('click', () => {
            document.querySelectorAll('.emoji-picker-on-top').forEach(picker => {
                if (picker !== emojiPicker) picker.style.display = 'none';
            });

            if (emojiPicker.style.display !== 'none') {
                emojiPicker.style.display = 'none';
                return;
            }
            // Shown first so the picker can be measured; it is only painted
            // once this handler returns, so it never appears unpositioned.
            emojiPicker.style.display = 'block';
            const rect = emojiButton.getBoundingClientRect();
            emojiPicker.style.top = `${rect.bottom + 4}px`;
            emojiPicker.style.left = `${popoverLeftForAnchor(
                rect,
                emojiPicker.offsetWidth || EMOJI_PICKER_WIDTH,
                // Without a window to measure, never flip.
                document.defaultView?.innerWidth || Number.POSITIVE_INFINITY
            )}px`;
        });

        return column;
    }

    function renderGroup(state, group, column) {
        const { titleGroup } = createEditableTitleController(document, {
            initialText: group.title,
            groupClass: 'subgroup-title-group',
            inputClass: 'subgroup-title',
            spanClass: 'subgroup-title-text',
            defaultText: 'New Group',
            showTooltip: true,
            onSave: value => onGroupRename(group, value)
        });
        const { item, faviconsContainer, expandedContainer, expandButton, moreOptionsButton } =
            createSubgroupView(document, {
                group,
                titleGroup,
                onDragStart: onTabDragStart,
                onDragEnd
            });

        group.tabIds.forEach(tabId => {
            const tab = getTab(state, tabId);
            if (!tab) return;
            const { navigableUrl, faviconUrl, faviconFallback, colorClass } =
                presenter.present(tab);
            const preview = createSubgroupPreview(document, {
                tab,
                navigableUrl,
                faviconUrl,
                faviconFallback,
                colorClass
            });
            wireOpening(preview, tab, navigableUrl);
            faviconsContainer.appendChild(preview);
            expandedContainer.appendChild(renderTab(tab));
        });

        moreOptionsButton.addEventListener('click', event => {
            event.stopPropagation();
            onGroupMenu({ group, moreOptionsButton });
        });
        expandButton.addEventListener('click', () => {
            onGroupExpandedChange(group, setSubgroupExpanded(expandButton));
        });

        column.appendChild(item);
        if (group.expanded) setSubgroupExpanded(expandButton, true);
        return item;
    }

    /**
     * Replace the board with the given state and return the new column
     * indicator, which the drag surfaces need a reference to.
     */
    function render(state) {
        container.replaceChildren();

        state.columns.forEach(columnData => {
            const column = renderColumn(columnData);
            container.appendChild(column);

            columnData.items.forEach(item => {
                if (item.type === 'group') {
                    renderGroup(state, item, column);
                    return;
                }
                const tab = getTab(state, item.tabId);
                if (tab) column.appendChild(renderTab(tab));
            });
        });

        const newColumnIndicator = createNewColumnIndicator(document);
        container.appendChild(newColumnIndicator);
        return newColumnIndicator;
    }

    return {
        beginNoteEdit,
        beginTitleEdit,
        render,
        renderColumn,
        renderGroup,
        renderTab
    };
}
