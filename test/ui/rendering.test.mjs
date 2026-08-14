import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
    createColorMenu,
    createColumnView,
    createDeletionArea,
    createMenuDropdown,
    createNewColumnIndicator,
    createNotificationDot,
    createOpenTabView,
    createSavedTabView,
    createSubgroupPreview,
    createSubgroupView,
    getColorClass,
    popoverLeftForAnchor,
    setColumnMinimized,
    setSubgroupExpanded
} from '../../src/ui/rendering.mjs';
import { createEditableTitleController } from '../../src/ui/controllers/editable-title-controller.mjs';
import { click, createPageDom, setRect } from '../helpers/dom.mjs';

let page;
let document;

before(() => {
    page = createPageDom();
    document = page.document;
});

after(() => page.cleanup());

function savedTabView(overrides = {}) {
    return createSavedTabView(document, {
        tab: { id: 'alpha', title: 'Alpha' },
        navigableUrl: 'https://example.com/alpha',
        faviconUrl: 'https://example.com/icon.png',
        colorClass: 'tab-blue',
        formattedDate: '',
        dateDisplayColor: '',
        noteDisplayText: '',
        noteEditableText: '',
        ...overrides
    });
}

function columnTitleGroup(text = 'Research') {
    return createEditableTitleController(document, {
        initialText: text,
        groupClass: 'title-group',
        inputClass: 'column-title-input',
        spanClass: 'column-title-text',
        defaultText: 'New Column'
    });
}

test('the page markup the extension ships provides the containers the app needs', () => {
    ['sidebar', 'open-tabs-list', 'main-content', 'space-container', 'columns-container'].forEach(
        id => assert.ok(document.getElementById(id), `missing #${id}`)
    );
    assert.ok(document.querySelector('.settings-button'));
    assert.ok(document.querySelector('.minimize-sidebar'));
    assert.ok(document.querySelector('.maximize-sidebar'));
    assert.ok(document.getElementById('add-column'));
});

test('a saved tab renders its title, note, date, and colour', () => {
    const view = savedTabView({
        tab: { id: 'alpha', title: 'Alpha' },
        formattedDate: 'Tomorrow',
        dateDisplayColor: 'rgb(255, 0, 0)',
        noteDisplayText: 'a note',
        noteEditableText: 'a note'
    });

    assert.equal(view.item.id, 'tab-alpha');
    assert.equal(view.item.draggable, true);
    assert.ok(view.item.classList.contains('tab-item'));
    assert.ok(view.item.classList.contains('tab-blue'));
    assert.equal(view.item.dataset.url, 'https://example.com/alpha');
    assert.equal(view.titleDisplay.textContent, 'Alpha');
    assert.equal(view.titleDisplay.getAttribute('href'), 'https://example.com/alpha');
    assert.equal(view.titleInput.value, 'Alpha');
    assert.ok(view.titleInput.classList.contains('hidden'));
    assert.equal(view.noteDisplay.textContent, 'a note');
    assert.equal(view.noteInput.value, 'a note');
    assert.equal(view.dateDisplay.textContent, 'Tomorrow');
    assert.equal(view.dateDisplay.classList.contains('hidden'), false);
});

test('a saved tab without a date keeps its date row hidden', () => {
    const view = savedTabView();
    assert.equal(view.dateDisplay.classList.contains('hidden'), true);
    assert.equal(view.dateDisplay.textContent, '');
});

test('stored text is rendered as text, never as markup', () => {
    const view = savedTabView({
        tab: { id: 'alpha', title: '<img src=x onerror="alert(1)">' },
        noteDisplayText: '<script>alert(1)</script>',
        noteEditableText: '<script>alert(1)</script>'
    });

    assert.equal(view.titleDisplay.querySelector('img'), null);
    assert.equal(view.noteDisplay.querySelector('script'), null);
    assert.equal(view.titleDisplay.textContent, '<img src=x onerror="alert(1)">');
    assert.equal(view.noteDisplay.textContent, '<script>alert(1)</script>');
});

test('an omitted favicon leaves the image source empty rather than broken', () => {
    const view = savedTabView({ faviconUrl: '' });
    assert.equal(view.item.querySelector('img').getAttribute('src'), null);
});

test('drag callbacks are wired to the rendered list item', () => {
    const started = [];
    const ended = [];
    const view = savedTabView({
        onDragStart: () => started.push('start'),
        onDragEnd: () => ended.push('end')
    });

    view.item.dispatchEvent(new page.window.Event('dragstart'));
    view.item.dispatchEvent(new page.window.Event('dragend'));

    assert.deepEqual(started, ['start']);
    assert.deepEqual(ended, ['end']);
});

test('a column renders its header controls and carries its emoji', () => {
    const { titleGroup } = columnTitleGroup();
    const view = createColumnView(document, {
        id: 'column-1',
        minimized: false,
        emoji: '📚',
        theme: 'light',
        titleGroup,
        fallbackEmoji: '🍎'
    });

    assert.equal(view.column.id, 'column-1');
    assert.equal(view.column.draggable, true);
    assert.equal(view.column.dataset.emoji, '📚');
    assert.equal(view.emojiButton.textContent, '📚');
    assert.ok(view.column.querySelector('.minimize-column'));
    assert.ok(view.column.querySelector('.maximize-column'));
    assert.ok(view.column.querySelector('.more-options'));
    assert.equal(view.column.querySelector('.column-title-text').textContent, 'Research');
    assert.equal(view.emojiPicker.style.display, 'none');
});

test('the column emoji picker is the emoji-picker-element custom element', () => {
    const { titleGroup } = columnTitleGroup();
    const view = createColumnView(document, {
        id: 'column-1',
        minimized: false,
        emoji: '📚',
        theme: 'light',
        titleGroup,
        fallbackEmoji: '🍎'
    });

    // The page registers this element by importing emoji-picker-element; a
    // hand-rolled replacement would lose search and the full emoji set.
    assert.equal(view.emojiPicker.tagName, 'EMOJI-PICKER');
    assert.ok(view.emojiPicker.classList.contains('emoji-picker-on-top'));
    assert.ok(view.emojiPicker.classList.contains('light'));
    assert.equal(view.emojiPicker.style.display, 'none');
    assert.equal(view.emojiPicker, view.column.querySelector('emoji-picker'));
});

test('a column without a stored emoji falls back to the supplied one', () => {
    const { titleGroup } = columnTitleGroup();
    const view = createColumnView(document, {
        id: 'column-1',
        minimized: false,
        emoji: null,
        theme: 'dark',
        titleGroup,
        fallbackEmoji: '🍎'
    });

    assert.equal(view.emojiButton.textContent, '🍎');
    assert.equal(view.column.dataset.emoji, '🍎');
    assert.ok(view.emojiPicker.classList.contains('dark'));
});

test('minimizing and maximizing a column flips its header and hides its tabs', () => {
    const { titleGroup } = columnTitleGroup();
    const { column } = createColumnView(document, {
        id: 'column-1',
        minimized: false,
        emoji: '📚',
        theme: 'light',
        titleGroup,
        fallbackEmoji: '🍎'
    });
    column.appendChild(savedTabView().item);

    setColumnMinimized(column, true);
    assert.ok(column.classList.contains('minimized'));
    assert.ok(column.querySelector('.column-title-text').classList.contains('vertical-text'));
    assert.equal(column.querySelector('.maximize-column').style.display, 'inline');
    assert.equal(column.querySelector('.minimize-column').style.display, 'none');
    assert.equal(column.querySelector('.tab-item').style.display, 'none');

    setColumnMinimized(column, false);
    assert.equal(column.classList.contains('minimized'), false);
    assert.equal(column.querySelector('.tab-item').style.display, 'flex');
    assert.equal(column.querySelector('.maximize-column').style.display, 'none');
});

test('a subgroup starts collapsed and toggles between previews and tabs', () => {
    const { titleGroup } = createEditableTitleController(document, {
        initialText: 'Reading',
        groupClass: 'subgroup-title-group',
        inputClass: 'subgroup-title',
        spanClass: 'subgroup-title-text',
        defaultText: 'New Group'
    });
    const view = createSubgroupView(document, {
        group: { id: 'group-1', title: 'Reading' },
        titleGroup
    });
    view.faviconsContainer.appendChild(
        createSubgroupPreview(document, {
            tab: { id: 'alpha', title: 'Alpha' },
            navigableUrl: 'https://example.com/alpha',
            faviconUrl: 'https://example.com/icon.png',
            colorClass: 'tab-blue'
        })
    );
    view.expandedContainer.appendChild(savedTabView().item);

    assert.equal(view.item.id, 'group-1');
    assert.ok(view.item.classList.contains('subgroup-item'));
    assert.ok(view.item.classList.contains('tab-item'));
    assert.equal(view.expandedContainer.style.display, 'none');

    assert.equal(setSubgroupExpanded(view.expandButton), true);
    assert.equal(view.expandedContainer.style.display, 'flex');
    assert.equal(view.faviconsContainer.style.display, 'none');

    assert.equal(setSubgroupExpanded(view.expandButton), false);
    assert.equal(view.expandedContainer.style.display, 'none');
    assert.equal(view.faviconsContainer.style.display, 'flex');
});

test('a subgroup preview carries the url the open-all action reads', () => {
    const preview = createSubgroupPreview(document, {
        tab: { id: 'alpha', title: 'Alpha' },
        navigableUrl: 'https://example.com/alpha',
        faviconUrl: 'https://example.com/icon.png',
        colorClass: 'tab-pink'
    });
    const favicon = preview.querySelector('.subgroup-favicon');

    assert.equal(favicon.dataset.url, 'https://example.com/alpha');
    assert.equal(favicon.dataset.tabId, 'alpha');
    assert.equal(preview.querySelector('.favicon-title').textContent, 'Alpha');
    assert.ok(preview.classList.contains('tab-pink'));
});

test('an open tab renders collapsed when the sidebar is collapsed', () => {
    const view = createOpenTabView(document, {
        tab: { id: 42, title: 'Open tab' },
        classes: ['collapsed'],
        faviconUrl: 'https://example.com/icon.png'
    });

    assert.equal(view.item.id, 'opentab-42');
    assert.ok(view.item.classList.contains('collapsed'));
    assert.equal(view.title.textContent, 'Open tab');
    assert.ok(view.closeButton.classList.contains('close-button'));
});

test('a menu renders one button per visible entry and closes after acting', () => {
    const button = setRect(document.querySelector('.settings-button'), {
        top: 10,
        height: 30,
        left: 100,
        width: 40
    });
    const actions = [];
    const menu = createMenuDropdown(
        document,
        [
            { text: 'Export Data', action: () => actions.push('export') },
            { text: 'Import Data', action: () => actions.push('import') },
            { text: 'Hidden', action: () => actions.push('hidden'), hidden: true }
        ],
        button
    );

    const options = menu.querySelectorAll('button.menu-option');
    assert.deepEqual(
        Array.from(options).map(option => option.textContent),
        ['Export Data', 'Import Data']
    );
    assert.equal(menu.style.position, 'fixed');
    assert.equal(menu.style.top, '45px');

    options[0].dispatchEvent(new page.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(actions, ['export']);
    assert.equal(menu.style.display, 'none');
});

test('the colour menu renders one swatch per palette entry and reports the choice', () => {
    const button = setRect(document.querySelector('.settings-button'), {
        top: 10,
        height: 30,
        left: 100,
        width: 40
    });
    const chosen = [];
    const menu = createColorMenu(document, {
        colors: ['tab-default', 'tab-pink', 'tab-blue'],
        button,
        onSelect: color => chosen.push(color)
    });

    const swatches = menu.querySelectorAll('.color-option');
    assert.equal(swatches.length, 3);
    assert.ok(swatches[1].classList.contains('tab-pink'));
    assert.equal(menu.style.top, '45px');
    assert.equal(menu.isConnected, true);

    click(swatches[1]);
    assert.deepEqual(chosen, ['tab-pink']);
});

test('notification dots come in a toolbar and an inline form', () => {
    assert.equal(createNotificationDot(document).className, 'notification-circle');
    assert.equal(
        createNotificationDot(document, { inline: true }).className,
        'notification-circle inline-notification'
    );
});

test('the deletion area and new column indicator clear their active state on drag out', () => {
    const deletionArea = createDeletionArea(document);
    const indicator = createNewColumnIndicator(document);
    document.body.appendChild(indicator);
    deletionArea.classList.add('deletion-area-active');
    indicator.classList.add('new-column-indicator-active');

    const leave = () => {
        const event = new page.window.Event('dragleave', { bubbles: true });
        Object.defineProperty(event, 'relatedTarget', { value: document.body });
        return event;
    };
    deletionArea.dispatchEvent(leave());
    indicator.dispatchEvent(leave());

    assert.equal(deletionArea.classList.contains('deletion-area-active'), false);
    assert.equal(indicator.classList.contains('new-column-indicator-active'), false);
    assert.equal(document.getElementById('deletion-area'), deletionArea);
});

test('a popover follows its button, flipping near the right of the window', () => {
    const width = 320;

    // With room to spare, the popover's left edge meets the button's.
    assert.equal(popoverLeftForAnchor({ left: 100, right: 130 }, width, 1000), 100);
    assert.equal(popoverLeftForAnchor({ left: 680, right: 710 }, width, 1000), 680);

    // Once it would run off the edge, the right edges line up instead.
    assert.equal(popoverLeftForAnchor({ left: 681, right: 711 }, width, 1000), 391);
    assert.equal(popoverLeftForAnchor({ left: 960, right: 990 }, width, 1000), 670);

    // A window narrower than the popover keeps it on screen.
    assert.equal(popoverLeftForAnchor({ left: 100, right: 130 }, width, 200), 0);
});

test('stored colours map onto the palette classes', () => {
    assert.equal(getColorClass('#FFFFFF'), 'tab-default');
    assert.equal(getColorClass('#ffc4c4'), 'tab-pink');
    assert.equal(getColorClass('#f9ffc4'), 'tab-yellow');
    assert.equal(getColorClass('#c6e2e9'), 'tab-blue');
    assert.equal(getColorClass('#ebc4ff'), 'tab-purple');
    assert.equal(getColorClass('anything else'), 'tab-default');
});
