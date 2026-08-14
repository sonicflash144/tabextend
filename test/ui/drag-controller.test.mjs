import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDragController } from '../../src/ui/controllers/drag-controller.mjs';

function classList(initial = []) {
    const values = new Set(initial);
    return {
        values,
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        contains(value) { return values.has(value); }
    };
}

/**
 * Minimal element stub. `parent` builds the ancestor chain that closest()
 * walks, and `rect` feeds the geometry helpers.
 */
function element(options = {}) {
    const {
        id = '',
        classes = [],
        parent = null,
        rect = { top: 0, bottom: 40, height: 40, left: 0, right: 100, width: 100 },
        children = [],
        tagName = 'LI'
    } = options;

    const node = {
        id,
        tagName,
        parent,
        children,
        style: {},
        dataset: {},
        classList: classList(classes),
        getBoundingClientRect: () => rect,
        closest(selector) {
            let current = node;
            while (current) {
                if (current.matches(selector)) return current;
                current = current.parent;
            }
            return null;
        },
        matches(selector) {
            return matchesSelector(node, selector);
        },
        contains(other) {
            let current = other;
            while (current) {
                if (current === node) return true;
                current = current.parent;
            }
            return false;
        },
        querySelectorAll(selector) {
            return descendants(node).filter(candidate => candidate.matches(selector));
        }
    };
    children.forEach(child => { child.parent = node; });
    return node;
}

function descendants(node) {
    return node.children.flatMap(child => [child, ...descendants(child)]);
}

function matchesCompound(node, selector) {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    return selector.split('.').filter(Boolean)
        .every(name => node.classList.contains(name));
}

/** Supports the compound and descendant selectors the controller uses. */
function matchesSelector(node, selector) {
    const parts = selector.trim().split(/\s+/);
    const own = parts.pop();
    if (!matchesCompound(node, own)) return false;

    let current = node.parent;
    for (const ancestor of parts.reverse()) {
        while (current && !matchesCompound(current, ancestor)) current = current.parent;
        if (!current) return false;
        current = current.parent;
    }
    return true;
}

function stackedRects(count, height = 40) {
    return Array.from({ length: count }, (unused, index) => ({
        top: index * height,
        bottom: (index + 1) * height,
        height,
        left: 0,
        right: 100,
        width: 100
    }));
}

function createFixture(options = {}) {
    const { columnItems = [], columnClasses = ['column'], columnId = 'column-1' } = options;
    const column = element({ id: columnId, classes: columnClasses, children: columnItems });
    const openTabsList = element({ id: 'open-tabs-list', classes: [] });
    const sidebar = element({ id: 'sidebar', classes: [], children: [openTabsList] });
    const deletionArea = element({ id: 'deletion-area', classes: ['deletion-area'] });
    const newColumnIndicator = element({ id: 'new-column', classes: ['new-column-indicator'] });
    const columnsContainer = element({ id: 'columns-container', children: [column] });

    const roots = [columnsContainer, sidebar, deletionArea, newColumnIndicator];
    const document = {
        body: { appendChild() {} },
        createElement: () => element({ tagName: 'DIV' }),
        getElementById(id) {
            return roots.flatMap(root => [root, ...descendants(root)])
                .find(node => node.id === id) || null;
        },
        querySelector(selector) {
            return document.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            return roots.flatMap(root => [root, ...descendants(root)])
                .filter(node => node.matches(selector));
        }
    };

    const controller = createDragController(document, {
        columnsContainer,
        getDeletionArea: () => deletionArea,
        getNewColumnIndicator: () => newColumnIndicator
    });

    return {
        column,
        columnsContainer,
        controller,
        deletionArea,
        document,
        newColumnIndicator,
        openTabsList,
        sidebar
    };
}

function dropEvent(target, droppedId, clientY = 0, clientX = 0) {
    return {
        target,
        clientX,
        clientY,
        preventDefault() {},
        dataTransfer: { getData: () => droppedId }
    };
}

function dragStartEvent(target) {
    const transfer = { data: null, image: null };
    return {
        target,
        prevented: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() {},
        dataTransfer: {
            setData(type, value) { transfer.data = value; },
            setDragImage(node) { transfer.image = node; }
        },
        transfer
    };
}

test('dragging a selected item drags the whole selection', () => {
    const items = [
        element({ id: 'tab-1', classes: ['tab-item', 'selected'] }),
        element({ id: 'tab-2', classes: ['tab-item', 'selected'] }),
        element({ id: 'tab-3', classes: ['tab-item'] })
    ];
    const { controller } = createFixture({ columnItems: items });

    const event = dragStartEvent(items[0]);
    controller.handleTabDragStart(event);

    assert.equal(event.transfer.data, 'tab-1');
    assert.deepEqual(items.map(item => item.classList.contains('dragging')), [true, true, false]);
});

test('dragging an unselected item clears the selection and drags it alone', () => {
    const items = [
        element({ id: 'tab-1', classes: ['tab-item', 'selected'] }),
        element({ id: 'tab-2', classes: ['tab-item'] })
    ];
    const { controller } = createFixture({ columnItems: items });

    controller.handleTabDragStart(dragStartEvent(items[1]));

    assert.equal(items[0].classList.contains('selected'), false);
    assert.equal(items[0].classList.contains('dragging'), false);
    assert.equal(items[1].classList.contains('dragging'), true);
});

test('a drag started inside a text field is cancelled', () => {
    const input = element({ tagName: 'TEXTAREA', classes: [] });
    const { controller } = createFixture();

    const event = dragStartEvent(input);
    controller.handleTabDragStart(event);

    assert.equal(event.prevented, true);
    assert.equal(event.transfer.data, null);
});

test('a column being renamed is not draggable', () => {
    const { column, controller } = createFixture();
    column.draggable = false;

    const event = dragStartEvent(column);
    controller.handleColumnDragStart(event);

    assert.equal(event.prevented, true);
    assert.equal(column.classList.contains('dragging'), false);
});

test('dropping a column on the deletion area deletes it, elsewhere reorders it', () => {
    const { column, controller, deletionArea, columnsContainer } = createFixture();
    column.draggable = true;
    column.getBoundingClientRect = () => ({ left: 0, right: 200, width: 200, top: 0, bottom: 400, height: 400 });
    controller.handleColumnDragStart(dragStartEvent(column));

    assert.deepEqual(controller.resolveDrop(dropEvent(deletionArea, 'column-1')), {
        type: 'delete-column',
        column
    });

    assert.deepEqual(controller.resolveDrop(dropEvent(columnsContainer, 'column-1', 0, 10)), {
        type: 'move-column',
        column,
        index: 0
    });
    assert.equal(
        controller.resolveDrop(dropEvent(columnsContainer, 'column-1', 0, 150)).index,
        1
    );
});

test('dropping tabs on empty column space appends them at the pointer position', () => {
    const rects = stackedRects(3);
    const items = rects.map((rect, index) => element({
        id: `tab-${index + 1}`,
        classes: ['tab-item'],
        rect
    }));
    const { column, controller } = createFixture({ columnItems: items });
    items[0].classList.add('dragging');

    // Just inside the third item, above its midpoint and outside its target band.
    const descriptor = controller.resolveDrop(dropEvent(column, 'tab-1', 81));

    assert.deepEqual(descriptor, {
        type: 'column',
        items: [items[0]],
        columnId: 'column-1',
        index: 2
    });

    // Below every item, so the drop appends.
    assert.equal(controller.resolveDrop(dropEvent(column, 'tab-1', 119)).index, 3);
});

test('resting the pointer on another tab groups onto it', () => {
    const items = stackedRects(2).map((rect, index) => element({
        id: `tab-${index + 1}`,
        classes: ['tab-item'],
        rect
    }));
    const { column, controller } = createFixture({ columnItems: items });
    items[0].classList.add('dragging');

    const descriptor = controller.resolveDrop(dropEvent(column, 'tab-1', 60));

    assert.deepEqual(descriptor, {
        type: 'item',
        items: [items[0]],
        item: { type: 'tab', tabId: '2' }
    });
});

test('a tab dropped back on its own subgroup is reordered inside it', () => {
    const expandedTabs = element({ classes: ['expanded-tabs'], children: [
        element({ id: 'tab-1', classes: ['tab-item'], rect: stackedRects(2)[0] }),
        element({ id: 'tab-2', classes: ['tab-item'], rect: stackedRects(2)[1] })
    ] });
    const subgroup = element({
        id: 'group-1',
        classes: ['tab-item', 'subgroup-item'],
        children: [expandedTabs]
    });
    const { column, controller } = createFixture({ columnItems: [subgroup] });
    const [first] = expandedTabs.children;
    first.classList.add('dragging');

    const descriptor = controller.resolveDrop(dropEvent(first, 'tab-1', 50));

    assert.deepEqual(descriptor, {
        type: 'group',
        items: [first],
        groupId: 'group-1',
        index: 1
    });
    assert.equal(column.id, 'column-1');
});

test('dragging the subgroup itself onto itself is never a reorder', () => {
    const expandedTabs = element({ classes: ['expanded-tabs'], children: [
        element({ id: 'tab-1', classes: ['tab-item'], rect: stackedRects(1)[0] })
    ] });
    const subgroup = element({
        id: 'group-1',
        classes: ['tab-item', 'subgroup-item'],
        children: [expandedTabs],
        rect: { top: 0, bottom: 80, height: 80, left: 0, right: 100, width: 100 }
    });
    const { controller } = createFixture({ columnItems: [subgroup] });
    subgroup.classList.add('dragging');

    const descriptor = controller.resolveDrop(dropEvent(subgroup, 'group-1', 5));

    assert.equal(descriptor.type, 'column');
    assert.deepEqual(descriptor.items, [subgroup]);
});

test('a selection that includes a subgroup is moved rather than reordered', () => {
    const expandedTabs = element({ classes: ['expanded-tabs'], children: [
        element({ id: 'tab-1', classes: ['tab-item'], rect: stackedRects(1)[0] })
    ] });
    const subgroup = element({
        id: 'group-1',
        classes: ['tab-item', 'subgroup-item'],
        children: [expandedTabs],
        rect: { top: 0, bottom: 80, height: 80, left: 0, right: 100, width: 100 }
    });
    const { controller } = createFixture({ columnItems: [subgroup] });
    const nested = expandedTabs.children[0];
    subgroup.classList.add('dragging');
    nested.classList.add('dragging');

    const descriptor = controller.resolveDrop(dropEvent(nested, 'group-1', 5));

    assert.equal(descriptor.type, 'column');
    assert.equal(descriptor.items.length, 2);
});

test('dropping on the deletion area, the new column indicator, and the sidebar', () => {
    const item = element({ id: 'tab-1', classes: ['tab-item'], rect: stackedRects(1)[0] });
    const fixture = createFixture({ columnItems: [item] });
    item.classList.add('dragging');

    assert.deepEqual(fixture.controller.resolveDrop(dropEvent(fixture.deletionArea, 'tab-1')), {
        type: 'delete-items',
        items: [item]
    });
    assert.deepEqual(
        fixture.controller.resolveDrop(dropEvent(fixture.newColumnIndicator, 'tab-1')),
        { type: 'new-column', items: [item] }
    );
    assert.deepEqual(fixture.controller.resolveDrop(dropEvent(fixture.openTabsList, 'tab-1')), {
        type: 'open-tabs',
        items: [item],
        index: 0
    });
});

test('a minimized column always appends dropped items', () => {
    const items = stackedRects(2).map((rect, index) => element({
        id: `tab-${index + 1}`,
        classes: ['tab-item'],
        rect
    }));
    const { column, controller } = createFixture({
        columnItems: items,
        columnClasses: ['column', 'minimized']
    });
    items[0].classList.add('dragging');

    const descriptor = controller.resolveDrop(dropEvent(column, 'tab-1', 0));

    assert.equal(descriptor.type, 'column');
    assert.equal(descriptor.index, 2);
});

test('drops that land nowhere are ignored', () => {
    const stray = element({ id: 'stray', classes: [] });
    const { controller } = createFixture();

    assert.equal(controller.resolveDrop(dropEvent(stray, 'tab-missing')), null);
});

test('drag end clears dragging state and hides the drag surfaces', () => {
    const item = element({ id: 'tab-1', classes: ['tab-item', 'dragging'] });
    const { column, controller, deletionArea, newColumnIndicator } = createFixture({
        columnItems: [item]
    });
    column.classList.add('dragging');
    deletionArea.classList.add('deletion-area-active');
    newColumnIndicator.classList.add('new-column-indicator-active');

    controller.handleDragEnd({ target: column });

    assert.equal(item.classList.contains('dragging'), false);
    assert.equal(column.classList.contains('dragging'), false);
    assert.equal(deletionArea.style.display, 'none');
    assert.equal(deletionArea.classList.contains('deletion-area-active'), false);
    assert.equal(newColumnIndicator.style.display, 'none');
    assert.equal(newColumnIndicator.classList.contains('new-column-indicator-active'), false);
    assert.equal(item.style.outline, 'none');
});
