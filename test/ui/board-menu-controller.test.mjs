import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createBoardMenuController } from '../../src/ui/controllers/board-menu-controller.mjs';
import { createMenuController } from '../../src/ui/controllers/menu-controller.mjs';
import { click, createPageDom } from '../helpers/dom.mjs';

let page;
let document;

before(() => {
    page = createPageDom();
    document = page.document;
});

after(() => page.cleanup());

beforeEach(() => {
    document.querySelectorAll('.options-menu, .color-menu').forEach(menu => menu.remove());
    document.getElementById('columns-container').replaceChildren();
});

function createHarness(options = {}) {
    const calls = [];
    const menuController = createMenuController();
    const selectionController = {
        clear() {
            calls.push(['clearSelection']);
        }
    };
    const record =
        name =>
        (...args) =>
            calls.push([name, ...args]);
    const tabs = options.tabs || new Map();
    const controller = createBoardMenuController(document, {
        menuController,
        selectionController,
        colors: ['tab-default', 'tab-blue'],
        getTab: id => tabs.get(id) || null,
        beginTitleEdit: record('beginTitleEdit'),
        beginNoteEdit: record('beginNoteEdit'),
        handlers: {
            onClearDates: record('clearDates'),
            onColorChange: record('colorChange'),
            onDeleteTabs: record('deleteTabs'),
            onOpenColumn: record('openColumn'),
            onDeleteColumn: record('deleteColumn'),
            onOpenGroup: record('openGroup'),
            onUngroup: record('ungroup'),
            onDeleteGroup: record('deleteGroup')
        }
    });
    return { calls, controller };
}

function tabContext(options = {}) {
    const tab = { id: options.id || 'one', note: options.note };
    const item = document.createElement('li');
    item.id = `tab-${tab.id}`;
    item.classList.add('tab-item');
    if (options.selected) item.classList.add('selected');
    const dateDisplay = document.createElement('div');
    dateDisplay.textContent = options.formattedDate || '';
    const moreOptionsButton = document.createElement('button');
    item.append(dateDisplay, moreOptionsButton);
    document.getElementById('columns-container').appendChild(item);
    return {
        tab,
        item,
        dateDisplay,
        moreOptionsButton,
        formattedDate: options.formattedDate || ''
    };
}

function menuButton(label) {
    return Array.from(document.querySelectorAll('.menu-option')).find(
        button => button.textContent === label
    );
}

test('requires menu, selection, tab reading, and editing boundaries', () => {
    assert.throws(() => createBoardMenuController(document, {}), /menu controller/);
    assert.throws(
        () =>
            createBoardMenuController(document, {
                menuController: createMenuController()
            }),
        /selection controller/
    );
});

test('a single-tab menu delegates rename, note, and delete behavior', () => {
    const { calls, controller } = createHarness();
    const context = tabContext({ note: 'Existing note' });

    controller.openTabMenu(context);

    assert.deepEqual(
        Array.from(document.querySelectorAll('.menu-option')).map(button => button.textContent),
        ['Rename', 'Edit Note', 'Color', 'Delete']
    );
    assert.deepEqual(calls[0], ['clearSelection']);

    click(menuButton('Rename'));
    assert.deepEqual(calls.at(-1), ['beginTitleEdit', context.item]);

    controller.openTabMenu(context);
    click(menuButton('Delete'));
    assert.deepEqual(calls.at(-1), ['deleteTabs', ['one']]);
});

test('a multi-selection offers shared actions and clears dates for every selected tab', () => {
    const tabs = new Map([
        ['one', { id: 'one' }],
        ['two', { id: 'two', parsedDate: 123 }]
    ]);
    const { calls, controller } = createHarness({ tabs });
    const context = tabContext({ id: 'one', selected: true, formattedDate: 'Today' });
    tabContext({ id: 'two', selected: true });

    controller.openTabMenu(context);

    assert.deepEqual(
        Array.from(document.querySelectorAll('.menu-option')).map(button => button.textContent),
        ['Clear Date', 'Color', 'Delete']
    );
    click(menuButton('Clear Date'));
    assert.deepEqual(calls[0], ['clearDates', ['one', 'two']]);
    assert.equal(context.dateDisplay.textContent, '');
    assert.equal(context.dateDisplay.classList.contains('hidden'), true);
});

test('the color submenu reports the selected color for the active tabs', () => {
    const { calls, controller } = createHarness();
    const context = tabContext();
    controller.openTabMenu(context);

    click(menuButton('Color'));
    const swatches = document.querySelectorAll('.color-option');
    assert.equal(swatches.length, 2);
    click(swatches[1]);

    assert.deepEqual(calls.at(-1), ['colorChange', ['one'], 'tab-blue']);
});

test('column and group menus delegate their workflows', () => {
    const { calls, controller } = createHarness();
    const columnButton = document.createElement('button');
    const groupButton = document.createElement('button');

    controller.openColumnMenu({ column: { id: 'column-one' }, menuButton: columnButton });
    click(menuButton('Open All'));
    assert.deepEqual(calls.at(-1), ['openColumn', 'column-one']);

    controller.openGroupMenu({ group: { id: 'group-one' }, moreOptionsButton: groupButton });
    click(menuButton('Ungroup'));
    assert.deepEqual(calls.at(-1), ['ungroup', 'group-one']);
});
