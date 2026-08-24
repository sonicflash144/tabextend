import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { canonicalStateFromLegacy } from '../../src/domain/state.mjs';
import { createBoardView } from '../../src/ui/board-view.mjs';
import { createTabPresenter } from '../../src/ui/tab-presentation.mjs';
import { click, createPageDom, keyDown, loadPageStyles, setRect } from '../helpers/dom.mjs';

const NOON = new Date('2026-08-13T12:00:00').getTime();

let page;
let document;

before(() => {
    page = createPageDom();
    document = page.document;
    loadPageStyles(document);
});

after(() => page.cleanup());

beforeEach(() => {
    document.getElementById('columns-container').replaceChildren();
});

function createChrono(matches = []) {
    return {
        parseDate(text) {
            const match = matches.find(candidate => text.includes(candidate.text));
            return match ? match.date : null;
        },
        parse(text) {
            const match = matches.find(candidate => text.includes(candidate.text));
            return match ? [{ text: match.text }] : [];
        }
    };
}

function createBoard(options = {}) {
    const calls = [];
    const record =
        name =>
        (...args) =>
            calls.push([name, ...args]);
    const board = createBoardView(document, {
        container: document.getElementById('columns-container'),
        presenter: createTabPresenter({
            chrono: createChrono(options.dates || []),
            now: () => NOON
        }),
        getTheme: () => options.theme || 'light',
        nextFallbackEmoji: () => '🍎',
        handlers: {
            onColumnDragStart: record('columnDragStart'),
            onColumnEmojiChange: record('columnEmoji'),
            onColumnMenu: record('columnMenu'),
            onColumnMinimizedChange: record('columnMinimized'),
            onColumnRename: record('columnRename'),
            onDragEnd: record('dragEnd'),
            onGroupExpandedChange: record('groupExpanded'),
            onGroupMenu: record('groupMenu'),
            onGroupRename: record('groupRename'),
            onNoteSave: record('noteSave'),
            onTabDragStart: record('tabDragStart'),
            onTabMenu: record('tabMenu'),
            // Reports whether it opened the link itself, so it cannot use the
            // recorder, whose return value is always truthy.
            onTabOpen: (tab, url) => {
                calls.push(['tabOpen', tab.id, url]);
                return options.handleOpen === true;
            },
            onTabSelect: record('tabSelect'),
            onTitleSave: record('titleSave')
        }
    });
    return { board, calls };
}

/** Click and hand back the event, so a test can see whether it was consumed. */
function clickLink(element) {
    const event = new document.defaultView.MouseEvent('click', {
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent(event);
    return event;
}

function stateWith(options = {}) {
    const { tabIds = ['tab-alpha', 'tab-beta'], minimized = false, tabs } = options;
    return canonicalStateFromLegacy(
        tabs || [
            {
                id: 'alpha',
                title: 'Alpha',
                url: 'https://example.com/alpha',
                favIconUrl: 'https://example.com/icon.png',
                color: '#ebc4ff'
            },
            { id: 'beta', title: 'Beta', url: 'https://example.com/beta' }
        ],
        [{ id: 'column-1', title: 'Research', minimized, emoji: '📚', tabIds }]
    );
}

test('requires a container and a presenter', () => {
    assert.throws(() => createBoardView(document, { presenter: {} }), /container element/);
    assert.throws(() => createBoardView(document, { container: document.body }), /tab presenter/);
});

test('rendering builds the columns, tabs, and the new column indicator', () => {
    const { board } = createBoard();

    const indicator = board.render(stateWith());

    const column = document.getElementById('column-1');
    assert.equal(column.querySelector('.column-title-text').textContent, 'Research');
    assert.equal(column.querySelector('.column-title-text').title, 'Research');
    assert.equal(column.dataset.emoji, '📚');
    assert.deepEqual(
        Array.from(column.querySelectorAll('.tab-item')).map(item => item.id),
        ['tab-alpha', 'tab-beta']
    );
    assert.ok(document.getElementById('tab-alpha').classList.contains('tab-purple'));
    assert.equal(indicator.classList.contains('new-column-indicator'), true);
    assert.equal(indicator, document.getElementById('columns-container').lastElementChild);
});

test('rendering again replaces the previous board', () => {
    const { board } = createBoard();

    board.render(stateWith());
    board.render(stateWith({ tabIds: ['tab-beta'] }));

    assert.equal(document.querySelectorAll('.column').length, 1);
    assert.equal(document.getElementById('tab-alpha'), null);
    assert.equal(document.querySelectorAll('.new-column-indicator').length, 1);
});

test('a minimized column is collapsed after its tabs are rendered', () => {
    const { board } = createBoard();

    board.render(stateWith({ minimized: true }));

    const column = document.getElementById('column-1');
    assert.ok(column.classList.contains('minimized'));
    assert.equal(page.window.getComputedStyle(column.querySelector('.tab-item')).display, 'none');
    assert.equal(
        page.window.getComputedStyle(column.querySelector('.maximize-column')).display,
        'inline'
    );
});

test('a subgroup renders previews, nested tabs, and honours its expanded flag', () => {
    const { board } = createBoard();

    board.render(
        stateWith({
            tabIds: [['group-1', 'tab-alpha', 'tab-beta', 'Reading', true]]
        })
    );

    const subgroup = document.getElementById('group-1');
    assert.equal(subgroup.querySelector('.subgroup-title-text').textContent, 'Reading');
    assert.equal(subgroup.querySelector('.subgroup-title-text').title, 'Reading');
    assert.equal(subgroup.querySelectorAll('.subgroup-favicon').length, 2);
    assert.deepEqual(
        Array.from(subgroup.querySelectorAll('.expanded-tabs .tab-item')).map(t => t.id),
        ['tab-alpha', 'tab-beta']
    );
    assert.equal(subgroup.querySelector('.expanded-tabs').style.display, 'flex');
});

test('an ordinary link is offered to the page and then left to the browser', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());

    const link = document.querySelector('#tab-alpha .tab-title');
    const event = clickLink(link);

    assert.deepEqual(
        calls.filter(call => call[0] === 'tabOpen'),
        [['tabOpen', 'alpha', 'https://example.com/alpha']]
    );
    assert.equal(event.defaultPrevented, false);
});

test('a link the page opened itself is not followed by the browser as well', () => {
    const { board, calls } = createBoard({ handleOpen: true });
    board.render(
        stateWith({
            tabs: [{ id: 'alpha', title: 'Notes', url: 'file:///home/notes.html' }],
            tabIds: ['tab-alpha']
        })
    );

    const link = document.querySelector('#tab-alpha .tab-title');
    assert.equal(link.hasAttribute('href'), false);
    const event = clickLink(link);

    assert.deepEqual(calls, [['tabOpen', 'alpha', 'file:///home/notes.html']]);
    assert.equal(event.defaultPrevented, true);
});

test('a subgroup preview routes its click the same way as a tab title', () => {
    const { board, calls } = createBoard({ handleOpen: true });
    board.render(
        stateWith({
            tabs: [{ id: 'alpha', title: 'Notes', url: 'file:///home/notes.html' }],
            tabIds: [['group-1', 'tab-alpha', 'Reading', false]]
        })
    );

    const preview = document.querySelector('#group-1 .favicon-wrapper');
    const event = clickLink(preview);

    assert.ok(calls.some(call => call[0] === 'tabOpen' && call[2] === 'file:///home/notes.html'));
    assert.equal(event.defaultPrevented, true);
});

test('a tab whose stored entry is missing is skipped', () => {
    const { board } = createBoard();

    board.render(stateWith({ tabIds: ['tab-alpha', 'tab-missing'] }));

    assert.deepEqual(
        Array.from(document.querySelectorAll('#column-1 .tab-item')).map(item => item.id),
        ['tab-alpha']
    );
});

test('renaming a column reports the new title and records it on the element', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const column = document.getElementById('column-1');
    const titleSpan = column.querySelector('.column-title-text');

    click(titleSpan);
    column.querySelector('.column-title-input').value = 'Reading list';
    keyDown(column.querySelector('.column-title-input'), 'Enter');

    assert.deepEqual(
        calls.filter(call => call[0] === 'columnRename'),
        [['columnRename', column, 'Reading list']]
    );
    assert.equal(column.dataset.title, 'Reading list');
    assert.equal(titleSpan.textContent, 'Reading list');
    assert.equal(titleSpan.title, 'Reading list');
});

test('minimizing and maximizing a column reports each change once', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const column = document.getElementById('column-1');

    click(column.querySelector('.minimize-column'));
    assert.ok(column.classList.contains('minimized'));
    click(column.querySelector('.maximize-column'));
    assert.equal(column.classList.contains('minimized'), false);

    assert.deepEqual(
        calls.filter(call => call[0] === 'columnMinimized'),
        [
            ['columnMinimized', column, true],
            ['columnMinimized', column, false]
        ]
    );
});

test('picking an emoji updates the header and reports the change', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const column = document.getElementById('column-1');
    const picker = column.querySelector('.emoji-picker-on-top');

    picker.dispatchEvent(
        new page.window.CustomEvent('emoji-click', {
            detail: { unicode: '🌵' }
        })
    );

    assert.equal(column.querySelector('.emoji-button').textContent, '🌵');
    assert.equal(column.dataset.emoji, '🌵');
    assert.equal(picker.style.display, 'none');
    assert.deepEqual(
        calls.filter(call => call[0] === 'columnEmoji'),
        [['columnEmoji', column, '🌵']]
    );
});

test('the emoji picker opens under its button and closes the others', () => {
    const { board } = createBoard();
    board.render(
        canonicalStateFromLegacy(
            [],
            [
                { id: 'column-1', title: 'One', tabIds: [] },
                { id: 'column-2', title: 'Two', tabIds: [] }
            ]
        )
    );
    const [first, second] = Array.from(document.querySelectorAll('.column'));
    setRect(first.querySelector('.emoji-button'), { top: 20, height: 24, left: 40, width: 24 });

    click(second.querySelector('.emoji-button'));
    assert.equal(second.querySelector('.emoji-picker-on-top').style.display, 'block');

    click(first.querySelector('.emoji-button'));
    assert.equal(second.querySelector('.emoji-picker-on-top').style.display, 'none');
    const picker = first.querySelector('.emoji-picker-on-top');
    assert.equal(picker.style.display, 'block');
    assert.equal(picker.style.top, '48px');
    assert.equal(picker.style.left, '40px');

    click(first.querySelector('.emoji-button'));
    assert.equal(picker.style.display, 'none');
});

test('a picker near the right of the window opens leftwards from its button', () => {
    const { board } = createBoard();
    board.render(canonicalStateFromLegacy([], [{ id: 'column-1', title: 'One', tabIds: [] }]));
    const column = document.getElementById('column-1');
    const button = column.querySelector('.emoji-button');
    const picker = column.querySelector('.emoji-picker-on-top');
    // jsdom reports a 1024px wide window and no layout, so both are stated.
    Object.defineProperty(picker, 'offsetWidth', { configurable: true, value: 300 });
    setRect(button, { top: 100, height: 24, left: 900, width: 24 });

    click(button);

    // The picker's right edge lines up with the button's: 924 - 300.
    assert.equal(picker.style.left, '624px');
    assert.equal(picker.style.top, '128px');
    assert.equal(picker.style.display, 'block');
});

test('the menu buttons hand their context to the page', () => {
    const { board, calls } = createBoard();
    board.render(
        stateWith({
            tabIds: ['tab-alpha', ['group-1', 'tab-beta', 'Reading', false]]
        })
    );
    const column = document.getElementById('column-1');

    click(column.querySelector('.more-options'));
    click(document.querySelector('#tab-alpha .more-options'));
    click(document.querySelector('#group-1 .subgroup-tab-actions .more-options'));

    const columnMenu = calls.find(call => call[0] === 'columnMenu');
    assert.equal(columnMenu[1].column, column);

    const tabMenu = calls.find(call => call[0] === 'tabMenu');
    assert.equal(tabMenu[1].tab.id, 'alpha');
    assert.equal(tabMenu[1].item, document.getElementById('tab-alpha'));
    assert.equal(tabMenu[1].formattedDate, '');

    // A group is identified by itself; the page looks the rest up in state.
    const groupMenu = calls.find(call => call[0] === 'groupMenu');
    assert.equal(groupMenu[1].group.id, 'group-1');
    assert.equal(groupMenu[1].moreOptionsButton.isConnected, true);
});

test('clicking a favicon reports the selection click', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());

    click(document.querySelector('#tab-alpha .tab-info-left'));

    const selected = calls.find(call => call[0] === 'tabSelect');
    assert.equal(selected[1], document.getElementById('tab-alpha'));
});

test('expanding a subgroup reports the new state', () => {
    const { board, calls } = createBoard();
    board.render(stateWith({ tabIds: [['group-1', 'tab-alpha', 'Reading', false]] }));
    const subgroup = document.getElementById('group-1');

    click(subgroup.querySelector('.expand-button'));
    assert.equal(subgroup.querySelector('.expanded-tabs').style.display, 'flex');

    click(subgroup.querySelector('.expand-button'));
    assert.equal(subgroup.querySelector('.expanded-tabs').style.display, 'none');

    assert.deepEqual(
        calls.filter(call => call[0] === 'groupExpanded').map(call => call[2]),
        [true, false]
    );
});

test('renaming a subgroup reports the new title', () => {
    const { board, calls } = createBoard();
    board.render(stateWith({ tabIds: [['group-1', 'tab-alpha', 'Reading', false]] }));
    const subgroup = document.getElementById('group-1');

    click(subgroup.querySelector('.subgroup-title-text'));
    subgroup.querySelector('.subgroup-title').value = 'Later';
    keyDown(subgroup.querySelector('.subgroup-title'), 'Enter');

    const renamed = calls.find(call => call[0] === 'groupRename');
    assert.equal(renamed[1].id, 'group-1');
    assert.equal(renamed[2], 'Later');
    assert.equal(subgroup.querySelector('.subgroup-title-text').title, 'Later');
});

test('clicking a note opens its editor and locks the row against dragging', () => {
    const { board } = createBoard();
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');
    const column = document.getElementById('column-1');

    click(item.querySelector('.note-display'));

    assert.equal(item.querySelector('.tab-note').classList.contains('hidden'), false);
    assert.ok(item.querySelector('.note-display').classList.contains('hidden'));
    assert.equal(item.draggable, false);
    assert.equal(column.draggable, false);
});

test('a note opened from the menu starts from the stored text', () => {
    const { board } = createBoard();
    board.render(
        stateWith({
            tabs: [{ id: 'alpha', title: 'Alpha', url: 'https://a.test', note: 'first<br>second' }],
            tabIds: ['tab-alpha']
        })
    );
    const item = document.getElementById('tab-alpha');

    board.beginNoteEdit(item);

    const noteInput = item.querySelector('.tab-note');
    assert.equal(noteInput.value, 'first\nsecond');
    assert.equal(noteInput.dataset.originalValue, 'first\nsecond');
    assert.equal(noteInput.classList.contains('hidden'), false);
});

test('renaming a tab from the menu swaps in its title input', () => {
    const { board } = createBoard();
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');

    board.beginTitleEdit(item);

    const titleInput = item.querySelector('.tab-info-right input[type="text"]');
    assert.equal(titleInput.value, 'Alpha');
    assert.equal(titleInput.dataset.originalValue, 'Alpha');
    assert.equal(titleInput.classList.contains('hidden'), false);
    assert.ok(item.querySelector('.tab-title').classList.contains('hidden'));
    assert.equal(item.draggable, false);
});

test('committing a rename saves the title, shows it, and restores dragging', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');
    const titleInput = item.querySelector('.tab-info-right input[type="text"]');

    board.beginTitleEdit(item);
    titleInput.value = 'Renamed';
    keyDown(titleInput, 'Enter');

    assert.deepEqual(
        calls.filter(call => call[0] === 'titleSave').map(call => call[2]),
        ['Renamed']
    );
    assert.equal(item.querySelector('.tab-title').textContent, 'Renamed');
    assert.ok(titleInput.classList.contains('hidden'));
    assert.equal(item.querySelector('.tab-title').classList.contains('hidden'), false);
    assert.equal(item.draggable, true);
    assert.equal(document.getElementById('column-1').draggable, true);
});

test('escaping a rename restores the title it started with', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');
    const titleInput = item.querySelector('.tab-info-right input[type="text"]');

    board.beginTitleEdit(item);
    titleInput.value = 'Discarded';
    keyDown(titleInput, 'Escape');

    assert.equal(item.querySelector('.tab-title').textContent, 'Alpha');
    assert.deepEqual(
        calls.filter(call => call[0] === 'titleSave').map(call => call[2]),
        ['Alpha']
    );
});

test('renaming twice does not save twice for one edit', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');
    const titleInput = item.querySelector('.tab-info-right input[type="text"]');

    board.beginTitleEdit(item);
    titleInput.blur();
    board.beginTitleEdit(item);
    titleInput.value = 'Renamed';
    titleInput.blur();

    assert.deepEqual(
        calls.filter(call => call[0] === 'titleSave').map(call => call[2]),
        ['Alpha', 'Renamed']
    );
});

test('leaving the note saves it, restores the row, and shows the stored text', () => {
    const { board, calls } = createBoard();
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');
    const noteInput = item.querySelector('.tab-note');
    item.draggable = false;

    noteInput.value = 'line one\nline two';
    noteInput.dispatchEvent(new page.window.Event('blur'));

    assert.deepEqual(
        calls.filter(call => call[0] === 'noteSave'),
        [['noteSave', calls.find(call => call[0] === 'noteSave')[1], 'line one\nline two']]
    );
    assert.equal(item.querySelector('.note-display').textContent, 'line one\nline two');
    assert.ok(noteInput.classList.contains('hidden'));
    assert.equal(item.querySelector('.note-display').classList.contains('hidden'), false);
    assert.equal(item.draggable, true);
});

test('enter commits a note and escape restores the text it started with', () => {
    const { board } = createBoard();
    board.render(stateWith());
    const noteInput = document.querySelector('#tab-alpha .tab-note');
    let blurs = 0;
    noteInput.blur = () => {
        blurs += 1;
    };

    noteInput.value = 'edited';
    keyDown(noteInput, 'Enter');
    assert.equal(blurs, 1);

    keyDown(noteInput, 'Escape');
    assert.equal(noteInput.value, '');
    assert.equal(blurs, 2);
});

test('shift+enter inserts a line break instead of committing', () => {
    const { board } = createBoard();
    board.render(stateWith());
    const noteInput = document.querySelector('#tab-alpha .tab-note');
    let blurs = 0;
    noteInput.blur = () => {
        blurs += 1;
    };

    noteInput.value = 'ab';
    noteInput.selectionStart = 1;
    noteInput.selectionEnd = 1;
    keyDown(noteInput, 'Enter', { shiftKey: true });

    assert.equal(blurs, 0);
});

test('typing a date into a note previews the due date it will be saved with', () => {
    const { board } = createBoard({
        dates: [{ text: 'tomorrow', date: new Date(2026, 7, 14, 9) }]
    });
    board.render(stateWith());
    const item = document.getElementById('tab-alpha');
    const noteInput = item.querySelector('.tab-note');
    const dateDisplay = item.querySelector('.date-display');

    noteInput.value = 'ship it tomorrow';
    noteInput.dispatchEvent(new page.window.Event('input'));

    assert.equal(dateDisplay.textContent, 'Tomorrow');
    assert.equal(dateDisplay.classList.contains('hidden'), false);
    assert.equal(dateDisplay.classList.contains('date-tomorrow'), true);
    assert.equal(dateDisplay.classList.contains('date-overdue'), false);

    // Removing the date hides the badge again for a tab that had none.
    noteInput.value = 'ship it';
    noteInput.dispatchEvent(new page.window.Event('input'));
    assert.ok(dateDisplay.classList.contains('hidden'));
});

test('a tab that already has a due date keeps it while the note is edited', () => {
    const { board } = createBoard();
    board.render(
        stateWith({
            tabs: [
                {
                    id: 'alpha',
                    title: 'Alpha',
                    url: 'https://example.com/alpha',
                    parsedDate: new Date(2026, 7, 13, 9).getTime()
                }
            ],
            tabIds: ['tab-alpha']
        })
    );
    const dateDisplay = document.querySelector('#tab-alpha .date-display');
    const noteInput = document.querySelector('#tab-alpha .tab-note');
    assert.equal(dateDisplay.textContent, 'Today');
    assert.equal(dateDisplay.classList.contains('date-today'), true);

    noteInput.value = 'no date here';
    noteInput.dispatchEvent(new page.window.Event('input'));

    assert.equal(dateDisplay.textContent, 'Today');
    assert.equal(dateDisplay.classList.contains('hidden'), false);
});

test('drag handlers are wired to tabs, subgroups, and columns', () => {
    const { board, calls } = createBoard();
    board.render(stateWith({ tabIds: ['tab-alpha', ['group-1', 'tab-beta', 'Reading', false]] }));

    document.getElementById('tab-alpha').dispatchEvent(new page.window.Event('dragstart'));
    document.getElementById('group-1').dispatchEvent(new page.window.Event('dragstart'));
    document.getElementById('column-1').dispatchEvent(new page.window.Event('dragstart'));
    document.getElementById('column-1').dispatchEvent(new page.window.Event('dragend'));

    assert.equal(calls.filter(call => call[0] === 'tabDragStart').length, 2);
    assert.equal(calls.filter(call => call[0] === 'columnDragStart').length, 1);
    assert.ok(calls.some(call => call[0] === 'dragEnd'));
});
