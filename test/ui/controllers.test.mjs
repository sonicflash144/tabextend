import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMenuController } from '../../src/ui/controllers/menu-controller.mjs';
import { createSelectionController } from '../../src/ui/controllers/selection-controller.mjs';

function classList(initial = []) {
    const values = new Set(initial);
    return {
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        contains(value) { return values.has(value); },
        toggle(value) {
            if (values.has(value)) values.delete(value);
            else values.add(value);
        }
    };
}

function selectionFixture(count = 4) {
    const items = Array.from({ length: count }, () => ({
        classList: classList(),
        offsetParent: {}
    }));
    const document = {
        querySelectorAll(selector) {
            if (selector === '.selected') {
                return items.filter(item => item.classList.contains('selected'));
            }
            if (selector === 'li:not(.subgroup-item)') return items;
            return [];
        }
    };
    return { items, controller: createSelectionController(document) };
}

function clickOptions(overrides = {}) {
    return { stopPropagation() {}, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

test('selection controller supports single, additive, and range selection', () => {
    const { items, controller } = selectionFixture();

    controller.handleItemClick(items[0], clickOptions());
    controller.handleItemClick(items[2], clickOptions({ ctrlKey: true }));
    assert.deepEqual(controller.selectedItems(), [items[0], items[2]]);

    controller.handleItemClick(items[3], clickOptions());
    assert.deepEqual(controller.selectedItems(), [items[3]]);
    controller.handleItemClick(items[1], clickOptions({ shiftKey: true }));
    assert.deepEqual(controller.selectedItems(), [items[1], items[2], items[3]]);
});

test('menu controller owns one active menu and removes replaced menus', () => {
    const controller = createMenuController();
    const first = { removed: 0, remove() { this.removed += 1; } };
    const second = { removed: 0, remove() { this.removed += 1; } };

    assert.equal(controller.toggle('options', 'one', () => first), first);
    assert.equal(controller.isOpen('options', 'one'), true);
    assert.equal(controller.open('column', 'two', () => second), second);
    assert.equal(first.removed, 1);
    assert.equal(controller.get('column'), second);

    assert.equal(controller.toggle('column', 'two', () => first), null);
    assert.equal(second.removed, 1);
    assert.equal(controller.get('column'), null);
});

