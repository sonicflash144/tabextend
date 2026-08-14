import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createDragController } from '../../src/ui/controllers/drag-controller.mjs';
import {
    createDeletionArea,
    createNewColumnIndicator
} from '../../src/ui/rendering.mjs';
import { createPageDom, dragEvent, setRect, stackRects } from '../helpers/dom.mjs';

let page;
let document;
let columnsContainer;
let deletionArea;
let newColumnIndicator;
let controller;
let frames;

before(() => {
    page = createPageDom();
    document = page.document;
});

after(() => page.cleanup());

beforeEach(() => {
    document.querySelectorAll('.drop-indicator-container, #deletion-area, .new-column-indicator')
        .forEach(node => node.remove());
    columnsContainer = document.getElementById('columns-container');
    columnsContainer.replaceChildren();
    document.getElementById('open-tabs-list').replaceChildren();

    deletionArea = createDeletionArea(document);
    newColumnIndicator = createNewColumnIndicator(document);
    columnsContainer.appendChild(newColumnIndicator);

    // The page's boxes: a sidebar down the left, columns to its right.
    setRect(document.getElementById('sidebar'), { top: 12, height: 800, left: 0, width: 200 });
    setRect(document.getElementById('space-container'), { top: 64, height: 700, left: 220, width: 780 });
    setRect(columnsContainer, { top: 64, height: 700, left: 220, width: 780 });
    setRect(deletionArea, { top: 900, height: 60, left: 0, width: 1000 });
    setRect(newColumnIndicator, { top: 64, height: 700, left: 1000, width: 60 });

    frames = [];
    controller = createDragController(document, {
        columnsContainer,
        getDeletionArea: () => deletionArea,
        getNewColumnIndicator: () => newColumnIndicator,
        requestFrame: callback => {
            frames.push(callback);
            return frames.length;
        },
        cancelFrame: () => {}
    });
});

function addColumn(id, options = {}) {
    const { minimized = false, rect = { top: 64, height: 400, left: 240, width: 300 } } = options;
    const column = document.createElement('div');
    column.classList.add('column');
    if (minimized) column.classList.add('minimized');
    column.id = id;
    column.draggable = true;
    setRect(column, rect);
    columnsContainer.insertBefore(column, newColumnIndicator);
    return column;
}

function addTab(parent, id, options = {}) {
    const item = document.createElement('li');
    item.id = id;
    item.classList.add('tab-item');
    if (options.subgroup) item.classList.add('subgroup-item');
    if (options.url) item.dataset.url = options.url;
    parent.appendChild(item);
    return item;
}

function addSubgroup(column, id) {
    const item = addTab(column, id, { subgroup: true });
    const container = document.createElement('div');
    container.classList.add('tab-group-container');
    const expanded = document.createElement('div');
    expanded.classList.add('expanded-tabs');
    container.appendChild(expanded);
    item.appendChild(container);
    return { item, expanded };
}

function indicator() {
    return document.querySelector('.drop-indicator');
}

function dragOver(target, clientY, clientX = 400) {
    controller.handleDragOver(dragEvent('dragover', target, { clientX, clientY }));
}

test('dragging a selected row drags the whole selection', () => {
    const column = addColumn('column-1');
    const rows = [addTab(column, 'tab-1'), addTab(column, 'tab-2'), addTab(column, 'tab-3')];
    rows[0].classList.add('selected');
    rows[1].classList.add('selected');

    const event = dragEvent('dragstart', rows[0]);
    controller.handleTabDragStart(event);

    assert.equal(event.dataTransfer.getData('text/plain'), 'tab-1');
    assert.equal(event.dataTransfer.dragImage, rows[0]);
    assert.deepEqual(rows.map(row => row.classList.contains('dragging')), [true, true, false]);
});

test('dragging an unselected row clears the selection and drags it alone', () => {
    const column = addColumn('column-1');
    const selected = addTab(column, 'tab-1');
    const dragged = addTab(column, 'tab-2');
    selected.classList.add('selected');

    controller.handleTabDragStart(dragEvent('dragstart', dragged));

    assert.equal(selected.classList.contains('selected'), false);
    assert.equal(selected.classList.contains('dragging'), false);
    assert.equal(dragged.classList.contains('dragging'), true);
});

test('a drag begun inside a text field is cancelled', () => {
    const column = addColumn('column-1');
    const row = addTab(column, 'tab-1');
    const input = document.createElement('textarea');
    row.appendChild(input);

    const event = dragEvent('dragstart', input);
    controller.handleTabDragStart(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(row.classList.contains('dragging'), false);
});

test('a column being renamed cannot be dragged', () => {
    const column = addColumn('column-1');
    column.draggable = false;

    const event = dragEvent('dragstart', column);
    controller.handleColumnDragStart(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(column.classList.contains('dragging'), false);
});

test('a column drag started on one of its tabs is left to the tab', () => {
    const column = addColumn('column-1');
    const row = addTab(column, 'tab-1');

    const event = dragEvent('dragstart', row);
    controller.handleColumnDragStart(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(column.classList.contains('dragging'), false);
});

test('the drop indicator sits on the boundary the pointer is nearest', () => {
    const column = addColumn('column-1');
    const rows = [addTab(column, 'tab-1'), addTab(column, 'tab-2')];
    stackRects(rows, { top: 100, height: 40, left: 240, width: 300 });
    rows[0].classList.add('dragging');
    controller.handleTabDragStart(dragEvent('dragstart', rows[0]));

    // Above the second row's midpoint, so the indicator sits on its top edge.
    dragOver(column, 125);
    assert.equal(indicator().style.display, 'block');
    assert.equal(indicator().style.top, '140px');
    assert.equal(indicator().style.height, '2px');

    // Below every row, so the indicator sits under the last one.
    dragOver(column, 175);
    assert.equal(indicator().style.top, '180px');
});

test('the indicator spans the column and is trimmed to the visible area', () => {
    const column = addColumn('column-1', { rect: { top: 64, height: 400, left: 240, width: 300 } });
    const row = addTab(column, 'tab-1');
    stackRects([row], { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', row));

    dragOver(column, 110);
    assert.equal(indicator().style.left, '240px');
    assert.equal(indicator().style.width, '300px');

    // A column scrolled past the left edge keeps its right edge in place.
    setRect(column, { top: 64, height: 400, left: 120, width: 300 });
    dragOver(column, 110);
    assert.equal(indicator().style.left, '220px');
    assert.equal(indicator().style.width, '200px');
});

test('the column indicator is clamped inside the visible column container', () => {
    const first = addColumn('column-1', { rect: { top: 64, height: 400, left: 240, width: 300 } });
    addColumn('column-2', { rect: { top: 64, height: 400, left: 1400, width: 300 } });
    controller.handleColumnDragStart(dragEvent('dragstart', first));

    // Far to the right, the indicator would land past the container's edge.
    dragOver(columnsContainer, 300, 1900);
    assert.equal(indicator().style.left, '998px');
    assert.equal(indicator().style.width, '2px');
    assert.equal(indicator().style.height, '700px');

    // Far to the left it is pinned to the container's left edge.
    setRect(first, { top: 64, height: 400, left: -80, width: 300 });
    dragOver(columnsContainer, 300, 0);
    assert.equal(indicator().style.left, '220px');
});

test('resting on a tab targets it and hides the insertion indicator', () => {
    const column = addColumn('column-1');
    const rows = [addTab(column, 'tab-1'), addTab(column, 'tab-2')];
    stackRects(rows, { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', rows[0]));

    dragOver(column, 160);
    assert.equal(rows[1].classList.contains('targeted'), true);
    assert.equal(indicator().style.display, 'none');

    dragOver(column, 125);
    assert.equal(rows[1].classList.contains('targeted'), false);
    assert.equal(indicator().style.display, 'block');
});

test('the deletion area and new column indicator take over from the indicator', () => {
    const column = addColumn('column-1');
    const row = addTab(column, 'tab-1');
    stackRects([row], { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', row));
    dragOver(column, 110);

    dragOver(deletionArea, 920);
    assert.equal(deletionArea.classList.contains('deletion-area-active'), true);
    assert.equal(indicator().style.display, 'none');

    dragOver(newColumnIndicator, 300, 1010);
    assert.equal(newColumnIndicator.classList.contains('new-column-indicator-active'), true);
    assert.equal(indicator().style.display, 'none');
});

test('dragging near an edge scrolls the column container until it is released', () => {
    const column = addColumn('column-1');
    const row = addTab(column, 'tab-1');
    stackRects([row], { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', row));

    const scrolled = [];
    columnsContainer.scrollBy = (x, y) => scrolled.push([x, y]);

    dragOver(column, 110, 960);
    assert.equal(frames.length, 1);
    frames.pop()();
    assert.equal(scrolled.length, 1);
    assert.ok(scrolled[0][0] > 0, 'scrolls towards the right edge');

    // Back in the middle, the animation stops and nothing further scrolls.
    dragOver(column, 400, 600);
    frames.forEach(frame => frame());
    assert.equal(scrolled.length, 1);
});

test('dropping a column on the deletion area deletes it, elsewhere reorders it', () => {
    const first = addColumn('column-1', { rect: { top: 64, height: 400, left: 240, width: 300 } });
    addColumn('column-2', { rect: { top: 64, height: 400, left: 560, width: 300 } });
    controller.handleColumnDragStart(dragEvent('dragstart', first));

    assert.deepEqual(
        controller.resolveDrop(dragEvent('drop', deletionArea, { data: 'column-1' })),
        { type: 'delete-column', column: first }
    );

    const moved = controller.resolveDrop(
        dragEvent('drop', columnsContainer, { data: 'column-1', clientX: 800 })
    );
    assert.deepEqual(moved, { type: 'move-column', column: first, index: 2 });
});

test('dropping tabs into a column inserts them at the pointer', () => {
    const column = addColumn('column-1');
    const rows = [addTab(column, 'tab-1'), addTab(column, 'tab-2'), addTab(column, 'tab-3')];
    stackRects(rows, { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', rows[0]));

    const descriptor = controller.resolveDrop(
        dragEvent('drop', column, { data: 'tab-1', clientY: 185 })
    );

    assert.deepEqual(descriptor, {
        type: 'column',
        items: [rows[0]],
        columnId: 'column-1',
        index: 2
    });
});

test('resting the pointer on another tab groups onto it', () => {
    const column = addColumn('column-1');
    const rows = [addTab(column, 'tab-1'), addTab(column, 'tab-2')];
    stackRects(rows, { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', rows[0]));

    const descriptor = controller.resolveDrop(
        dragEvent('drop', column, { data: 'tab-1', clientY: 160 })
    );

    assert.deepEqual(descriptor, {
        type: 'item',
        items: [rows[0]],
        item: { type: 'tab', tabId: '2' }
    });
});

test('a tab dropped back on its own subgroup is reordered inside it', () => {
    const column = addColumn('column-1');
    const { item, expanded } = addSubgroup(column, 'group-1');
    setRect(item, { top: 100, height: 120, left: 240, width: 300 });
    const nested = [addTab(expanded, 'tab-1'), addTab(expanded, 'tab-2')];
    stackRects(nested, { top: 140, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', nested[0]));

    const descriptor = controller.resolveDrop(
        dragEvent('drop', nested[1], { data: 'tab-1', clientY: 200 })
    );

    assert.deepEqual(descriptor, {
        type: 'group',
        items: [nested[0]],
        groupId: 'group-1',
        index: 2
    });
});

test('dragging the subgroup itself onto itself moves it instead of reordering', () => {
    const column = addColumn('column-1');
    const { item, expanded } = addSubgroup(column, 'group-1');
    setRect(item, { top: 100, height: 120, left: 240, width: 300 });
    const nested = addTab(expanded, 'tab-1');
    stackRects([nested], { top: 140, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', item));

    const descriptor = controller.resolveDrop(
        dragEvent('drop', item, { data: 'group-1', clientY: 105 })
    );

    assert.equal(descriptor.type, 'column');
    assert.deepEqual(descriptor.items, [item]);
});

test('a selection holding a subgroup and one of its tabs is moved, not reordered', () => {
    const column = addColumn('column-1');
    const { item, expanded } = addSubgroup(column, 'group-1');
    setRect(item, { top: 100, height: 120, left: 240, width: 300 });
    const nested = addTab(expanded, 'tab-1');
    stackRects([nested], { top: 140, height: 40, left: 240, width: 300 });
    item.classList.add('selected');
    nested.classList.add('selected');
    controller.handleTabDragStart(dragEvent('dragstart', item));

    const descriptor = controller.resolveDrop(
        dragEvent('drop', nested, { data: 'group-1', clientY: 105 })
    );

    assert.equal(descriptor.type, 'column');
    assert.equal(descriptor.items.length, 2);
});

test('drops onto the deletion area, a new column, and the sidebar', () => {
    const column = addColumn('column-1');
    const row = addTab(column, 'tab-1', { url: 'https://example.com' });
    stackRects([row], { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', row));

    assert.deepEqual(
        controller.resolveDrop(dragEvent('drop', deletionArea, { data: 'tab-1' })),
        { type: 'delete-items', items: [row] }
    );
    assert.deepEqual(
        controller.resolveDrop(dragEvent('drop', newColumnIndicator, { data: 'tab-1' })),
        { type: 'new-column', items: [row] }
    );
    assert.deepEqual(
        controller.resolveDrop(dragEvent('drop', document.getElementById('open-tabs-list'), {
            data: 'tab-1'
        })),
        { type: 'open-tabs', items: [row], index: 0 }
    );
});

test('a minimized column always appends dropped tabs', () => {
    const column = addColumn('column-1', { minimized: true });
    const rows = [addTab(column, 'tab-1'), addTab(column, 'tab-2')];
    stackRects(rows, { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', rows[0]));

    const descriptor = controller.resolveDrop(
        dragEvent('drop', column, { data: 'tab-1', clientY: 100 })
    );

    assert.equal(descriptor.index, 2);
});

test('a drop that lands nowhere is ignored', () => {
    assert.equal(
        controller.resolveDrop(dragEvent('drop', document.body, { data: 'tab-missing' })),
        null
    );
});

test('drag end clears dragging state and hides every drag surface', () => {
    const column = addColumn('column-1');
    const row = addTab(column, 'tab-1');
    stackRects([row], { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', row));
    dragOver(column, 110);
    dragOver(deletionArea, 920);
    column.classList.add('dragging');

    controller.handleDragEnd(dragEvent('dragend', column));

    assert.equal(row.classList.contains('dragging'), false);
    assert.equal(column.classList.contains('dragging'), false);
    assert.equal(deletionArea.style.display, 'none');
    assert.equal(deletionArea.classList.contains('deletion-area-active'), false);
    assert.equal(newColumnIndicator.style.display, 'none');
    assert.equal(indicator().style.display, 'none');
    assert.equal(row.style.outline, 'none');
});
