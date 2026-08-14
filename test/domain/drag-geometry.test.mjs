import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    autoScrollSpeeds,
    clampColumnIndicatorLeft,
    clampIndicatorSpan,
    clampIndicatorTop,
    columnDropIndexForRects,
    dropIndexForRects,
    isPointerOnItem
} from '../../src/domain/drag-geometry.mjs';

function verticalRects(count, height = 40, top = 0) {
    return Array.from({ length: count }, (unused, index) => ({
        top: top + index * height,
        bottom: top + (index + 1) * height,
        height
    }));
}

test('inserts above an item once the pointer passes its midpoint', () => {
    const rects = verticalRects(3);

    assert.equal(dropIndexForRects(5, rects), 0);
    assert.equal(dropIndexForRects(19, rects), 0);
    assert.equal(dropIndexForRects(20, rects), 1);
    assert.equal(dropIndexForRects(59, rects), 1);
    assert.equal(dropIndexForRects(140, rects), 3);
    assert.equal(dropIndexForRects(0, []), 0);
});

test('a minimized column always appends', () => {
    const rects = verticalRects(3);
    assert.equal(dropIndexForRects(5, rects, { isMinimized: true }), 3);
});

test('columns insert on the horizontal midpoint', () => {
    const rects = [
        { left: 0, width: 100 },
        { left: 100, width: 100 }
    ];

    assert.equal(columnDropIndexForRects(10, rects), 0);
    assert.equal(columnDropIndexForRects(60, rects), 1);
    assert.equal(columnDropIndexForRects(190, rects), 2);
    assert.equal(columnDropIndexForRects(0, []), 0);
});

test('tall items target through the fixed inset band', () => {
    const rect = { top: 0, bottom: 300 };

    // The 32px inset band is wider than the middle third for tall items.
    assert.equal(isPointerOnItem(31, rect), false);
    assert.equal(isPointerOnItem(32, rect), true);
    assert.equal(isPointerOnItem(150, rect), true);
    assert.equal(isPointerOnItem(268, rect), true);
    assert.equal(isPointerOnItem(269, rect), false);
});

test('short items keep a usable middle-third target band', () => {
    const rect = { top: 0, bottom: 30 };

    // A 32px inset would invert on a 30px item, so the middle third wins.
    assert.equal(isPointerOnItem(9, rect), false);
    assert.equal(isPointerOnItem(15, rect), true);
    assert.equal(isPointerOnItem(21, rect), false);
});

test('auto scroll accelerates towards the nearer edge and rests in the middle', () => {
    const containerRect = { left: 0, right: 1000, top: 0, bottom: 1000 };

    assert.deepEqual(autoScrollSpeeds({ clientX: 500, clientY: 500 }, containerRect), {
        scrollX: 0,
        scrollY: 0
    });

    const nearLeft = autoScrollSpeeds({ clientX: 10, clientY: 500 }, containerRect);
    assert.ok(nearLeft.scrollX < 0);
    assert.equal(nearLeft.scrollY, 0);

    const nearBottom = autoScrollSpeeds({ clientX: 500, clientY: 995 }, containerRect);
    assert.ok(nearBottom.scrollY > 0);

    // Speed grows as the pointer nears the edge, and stops outside the container.
    const closer = autoScrollSpeeds({ clientX: 5, clientY: 500 }, containerRect);
    assert.ok(closer.scrollX < nearLeft.scrollX);
    assert.equal(autoScrollSpeeds({ clientX: 0, clientY: 500 }, containerRect).scrollX, 0);
});

test('trims a horizontal indicator to the visible container', () => {
    const bounds = { left: 100, right: 500 };

    assert.deepEqual(clampIndicatorSpan({ left: 200, width: 100 }, bounds), {
        left: 200,
        width: 100
    });
    // A column scrolled past the left edge keeps its right edge in place.
    assert.deepEqual(clampIndicatorSpan({ left: 60, width: 200 }, bounds), {
        left: 100,
        width: 160
    });
    assert.deepEqual(clampIndicatorSpan({ left: 400, width: 300 }, bounds), {
        left: 400,
        width: 100
    });
});

test('keeps the column indicator inside the visible column container', () => {
    const bounds = { left: 100, right: 500 };

    assert.equal(clampColumnIndicatorLeft(300, bounds), 300);
    assert.equal(clampColumnIndicatorLeft(40, bounds), 100);
    assert.equal(clampColumnIndicatorLeft(600, bounds), 498);
});

test('keeps a horizontal indicator inside its scroll container', () => {
    const containerRect = { top: 50, bottom: 400 };

    assert.equal(clampIndicatorTop(120, containerRect), 120);
    assert.equal(clampIndicatorTop(10, containerRect), 50);
    assert.equal(clampIndicatorTop(900, containerRect), 398);
});
