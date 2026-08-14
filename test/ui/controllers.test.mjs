import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createEditableTitleController } from '../../src/ui/controllers/editable-title-controller.mjs';
import { createMenuController } from '../../src/ui/controllers/menu-controller.mjs';
import { createSelectionController } from '../../src/ui/controllers/selection-controller.mjs';
import { createMenuDropdown } from '../../src/ui/rendering.mjs';
import { click, createPageDom, keyDown, markVisible, setRect } from '../helpers/dom.mjs';

let page;
let document;

before(() => {
    page = createPageDom();
    document = page.document;
});

after(() => page.cleanup());

beforeEach(() => {
    document.getElementById('columns-container').replaceChildren();
    document.getElementById('open-tabs-list').replaceChildren();
    document.querySelectorAll('.options-menu').forEach(menu => menu.remove());
});

function renderRows(count, options = {}) {
    const { subgroupAt = null } = options;
    const list = document.getElementById('open-tabs-list');
    const rows = Array.from({ length: count }, (unused, index) => {
        const row = document.createElement('li');
        row.id = `tab-${index + 1}`;
        row.classList.add('tab-item');
        if (subgroupAt === index) row.classList.add('subgroup-item');
        list.appendChild(row);
        return row;
    });
    markVisible(rows);
    return rows;
}

test('clicking selects one row and clicking it again clears the selection', () => {
    const rows = renderRows(3);
    const controller = createSelectionController(document);

    click(rows[0]);
    controller.handleItemClick(rows[0], { stopPropagation() {} });
    assert.deepEqual(controller.selectedItems(), [rows[0]]);

    controller.handleItemClick(rows[0], { stopPropagation() {} });
    assert.deepEqual(controller.selectedItems(), []);
});

test('ctrl-click adds rows and shift-click selects the range between them', () => {
    const rows = renderRows(4);
    const controller = createSelectionController(document);

    controller.handleItemClick(rows[0], { stopPropagation() {} });
    controller.handleItemClick(rows[2], { stopPropagation() {}, ctrlKey: true });
    assert.deepEqual(controller.selectedItems(), [rows[0], rows[2]]);

    controller.handleItemClick(rows[3], { stopPropagation() {} });
    controller.handleItemClick(rows[1], { stopPropagation() {}, shiftKey: true });
    assert.deepEqual(controller.selectedItems(), [rows[1], rows[2], rows[3]]);

    controller.clear();
    assert.deepEqual(controller.selectedItems(), []);
});

test('hidden rows and subgroup rows are not part of the selectable range', () => {
    const rows = renderRows(3, { subgroupAt: 1 });
    Object.defineProperty(rows[2], 'offsetParent', { configurable: true, get: () => null });
    const controller = createSelectionController(document);

    assert.deepEqual(controller.visibleItems(), [rows[0]]);
});

test('only one menu of a kind is open, and reopening the same one closes it', () => {
    const button = setRect(document.querySelector('.settings-button'), {
        top: 0,
        height: 20,
        left: 0,
        width: 20
    });
    const controller = createMenuController();
    const open = id =>
        controller.toggle('options', id, () =>
            createMenuDropdown(document, [{ text: id, action: () => {} }], button)
        );

    const first = open('one');
    assert.equal(document.querySelectorAll('.options-menu').length, 1);

    const second = open('two');
    assert.equal(first.isConnected, false);
    assert.equal(second.isConnected, true);
    assert.equal(document.querySelectorAll('.options-menu').length, 1);

    assert.equal(open('two'), null);
    assert.equal(second.isConnected, false);
    assert.equal(document.querySelectorAll('.options-menu').length, 0);
});

test('opening any menu closes the one already showing, and closeAll clears it', () => {
    const button = setRect(document.querySelector('.settings-button'), {
        top: 0,
        height: 20,
        left: 0,
        width: 20
    });
    const controller = createMenuController();
    const build = label => () =>
        createMenuDropdown(document, [{ text: label, action: () => {} }], button);

    const tabMenu = controller.open('options', 'one', build('one'));
    // A column menu replaces the tab menu; the page never shows two at once.
    const columnMenu = controller.open('column', 'two', build('two'));
    assert.equal(tabMenu.isConnected, false);
    assert.equal(controller.get('options'), null);
    assert.equal(document.querySelectorAll('.options-menu').length, 1);

    controller.closeAll();
    assert.equal(columnMenu.isConnected, false);
    assert.equal(document.querySelectorAll('.options-menu').length, 0);
    assert.equal(controller.get('column'), null);
});

function editableColumn(options = {}) {
    const column = document.createElement('div');
    column.classList.add('column');
    column.draggable = true;
    const saved = [];
    const controller = createEditableTitleController(document, {
        initialText: 'Research',
        groupClass: 'title-group',
        inputClass: 'column-title-input',
        spanClass: 'column-title-text',
        container: 'h2',
        defaultText: 'New Column',
        onSave: value => saved.push(value),
        ...options
    });
    column.appendChild(controller.titleGroup);
    document.getElementById('columns-container').appendChild(column);
    return { column, controller, saved };
}

test('editing a title swaps in the input and stops the column from dragging', () => {
    const { column, controller } = editableColumn();

    click(controller.titleSpan);

    assert.equal(controller.titleInput.style.display, 'inline');
    assert.equal(controller.titleSpan.style.display, 'none');
    assert.equal(controller.titleInput.value, 'Research');
    assert.equal(column.draggable, false);
});

test('committing an edit saves the trimmed title and restores dragging', () => {
    const { column, controller, saved } = editableColumn();

    click(controller.titleSpan);
    controller.titleInput.value = '  Reading list  ';
    keyDown(controller.titleInput, 'Enter');

    assert.deepEqual(saved, ['Reading list']);
    assert.equal(controller.titleSpan.textContent, 'Reading list');
    assert.equal(controller.titleSpan.style.display, 'inline');
    assert.equal(controller.titleInput.style.display, 'none');
    assert.equal(column.draggable, true);
});

test('escape restores the title that was there before the edit', () => {
    const { controller, saved } = editableColumn();

    click(controller.titleSpan);
    controller.titleInput.value = 'Discarded';
    keyDown(controller.titleInput, 'Escape');

    assert.equal(controller.titleSpan.textContent, 'Research');
    assert.deepEqual(saved, ['Research']);
});

test('clearing a title falls back to the default name', () => {
    const { controller, saved } = editableColumn();

    click(controller.titleSpan);
    controller.titleInput.value = '   ';
    keyDown(controller.titleInput, 'Enter');

    assert.equal(controller.titleSpan.textContent, 'New Column');
    assert.deepEqual(saved, ['']);
});

test('a title with no class names still renders', () => {
    const controller = createEditableTitleController(document, { initialText: 'Plain' });

    assert.equal(controller.titleSpan.textContent, 'Plain');
    assert.equal(controller.titleGroup.className, '');
});
