/**
 * Pure pointer/rectangle math for drag and drop. Keeping it separate from the
 * DOM lets the drop position, targeting, auto-scroll, and indicator clamping
 * rules be tested directly.
 */

export const INDICATOR_THICKNESS = 2;
export const TARGET_FIXED_MARGIN = 32;
export const AUTO_SCROLL_THRESHOLD = 240;
export const AUTO_SCROLL_MAX_SPEED = 15;

/** Insertion index for a vertical list; a minimized column always appends. */
export function dropIndexForRects(clientY, rects, options = {}) {
    if (options.isMinimized) return rects.length;
    for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (clientY < rect.top + rect.height / 2) return index;
    }
    return rects.length;
}

/** Insertion index for the horizontal column list. */
export function columnDropIndexForRects(clientX, rects) {
    for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (clientX < rect.left + rect.width / 2) return index;
    }
    return rects.length;
}

/**
 * Whether the pointer is deep enough inside an item to target it, rather than
 * to insert next to it. The wider of a middle-third band and a fixed inset
 * band wins, so short items keep a usable target area.
 */
export function isPointerOnItem(clientY, rect) {
    const height = rect.bottom - rect.top;
    const middleThirdTop = rect.top + height / 3;
    const middleThirdBottom = rect.bottom - height / 3;
    const fixedTop = rect.top + TARGET_FIXED_MARGIN;
    const fixedBottom = rect.bottom - TARGET_FIXED_MARGIN;

    return fixedBottom - fixedTop > middleThirdBottom - middleThirdTop
        ? clientY >= fixedTop && clientY <= fixedBottom
        : clientY >= middleThirdTop && clientY <= middleThirdBottom;
}

function edgeSpeed(distance, threshold, maxSpeed) {
    if (distance <= 0 || distance >= threshold) return 0;
    const progress = 1 - distance / threshold;
    return maxSpeed * Math.pow(progress, 2);
}

/** Auto-scroll velocity as the pointer approaches the container edges. */
export function autoScrollSpeeds(pointer, containerRect, options = {}) {
    const { threshold = AUTO_SCROLL_THRESHOLD, maxSpeed = AUTO_SCROLL_MAX_SPEED } = options;

    const left = edgeSpeed(pointer.clientX - containerRect.left, threshold, maxSpeed);
    const right = edgeSpeed(containerRect.right - pointer.clientX, threshold, maxSpeed);
    const top = edgeSpeed(pointer.clientY - containerRect.top, threshold, maxSpeed);
    const bottom = edgeSpeed(containerRect.bottom - pointer.clientY, threshold, maxSpeed);

    return { scrollX: right - left, scrollY: bottom - top };
}

/** Trim a horizontal indicator so it stays inside the visible container. */
export function clampIndicatorSpan(span, bounds) {
    let { left, width } = span;
    if (left < bounds.left) {
        width -= bounds.left - left;
        left = bounds.left;
    }
    if (left + width > bounds.right) {
        width = bounds.right - left;
    }
    return { left, width };
}

/** Keep the column indicator itself within the visible column container. */
export function clampColumnIndicatorLeft(left, bounds, width = INDICATOR_THICKNESS) {
    if (left < bounds.left) return bounds.left;
    if (left > bounds.right - width) return bounds.right - width;
    return left;
}

/** Keep a horizontal indicator within the scroll container it belongs to. */
export function clampIndicatorTop(top, containerRect, thickness = INDICATOR_THICKNESS) {
    return Math.min(Math.max(top, containerRect.top), containerRect.bottom - thickness);
}
