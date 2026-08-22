import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The real page markup, so tests see the ids and structure the extension ships.
const pageHtml = readFileSync(path.join(repositoryRoot, 'newtab.html'), 'utf8');
const pageCss = readFileSync(path.join(repositoryRoot, 'newtab.css'), 'utf8');

const EXPOSED_GLOBALS = [
    'window',
    'document',
    'navigator',
    'CustomEvent',
    'Event',
    'DragEvent',
    'MouseEvent',
    'KeyboardEvent',
    'Node',
    'HTMLElement'
];

/**
 * A jsdom page with the extension's own markup. Scripts are never executed:
 * tests drive the modules directly. Globals are exposed because the view
 * modules read `window` for viewport measurements.
 */
export function createPageDom() {
    const dom = new JSDOM(pageHtml, {
        pretendToBeVisual: true,
        url: 'https://tabsmagic.test/newtab.html'
    });
    const { window } = dom;
    const previous = new Map();

    // Some of these (navigator) are getter-only on newer Node versions, so
    // they are redefined rather than assigned.
    EXPOSED_GLOBALS.forEach(name => {
        previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, {
            configurable: true,
            writable: true,
            value: window[name]
        });
    });

    return {
        dom,
        window,
        document: window.document,
        cleanup() {
            previous.forEach((descriptor, name) => {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else delete globalThis[name];
            });
            window.close();
        }
    };
}

/** Attach the page stylesheet when a test needs to assert computed presentation. */
export function loadPageStyles(document) {
    const style = document.createElement('style');
    style.textContent = pageCss;
    document.head.appendChild(style);
    return style;
}

/**
 * jsdom performs no layout, so tests state the geometry they are exercising.
 * Only the fields the drag code reads need to be supplied.
 */
export function setRect(element, rect) {
    const {
        top = 0,
        left = 0,
        width = 0,
        height = 0,
        bottom = top + height,
        right = left + width
    } = rect;
    const measured = {
        top,
        left,
        bottom,
        right,
        width: width || right - left,
        height: height || bottom - top,
        x: left,
        y: top
    };
    element.getBoundingClientRect = () => ({ ...measured, toJSON: () => measured });
    return element;
}

/** Stack elements vertically, the way a rendered column reads. */
export function stackRects(elements, options = {}) {
    const { top = 0, height = 40, left = 0, width = 200 } = options;
    elements.forEach((element, index) => {
        setRect(element, {
            top: top + index * height,
            height,
            left,
            width
        });
    });
    return elements;
}

/**
 * jsdom always reports a null offsetParent. The selection controller uses it
 * to skip hidden rows, so visible rows must say so.
 */
export function markVisible(...elements) {
    elements.flat().forEach(element => {
        Object.defineProperty(element, 'offsetParent', {
            configurable: true,
            get: () => element.parentNode || element.ownerDocument.body
        });
    });
}

export function click(element, init = {}) {
    element.dispatchEvent(
        new element.ownerDocument.defaultView.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            ...init
        })
    );
}

export function keyDown(element, key, init = {}) {
    element.dispatchEvent(
        new element.ownerDocument.defaultView.KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key,
            ...init
        })
    );
}

/**
 * A drag event carrying a working dataTransfer. jsdom does not implement
 * DataTransfer, and the drag code only needs these three methods.
 */
export function dragEvent(type, target, options = {}) {
    const { clientX = 0, clientY = 0, data = '' } = options;
    const window = target.ownerDocument.defaultView;
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    const transfer = {
        dropEffect: 'none',
        data,
        dragImage: null,
        setData(type, value) {
            transfer.data = value;
        },
        getData() {
            return transfer.data;
        },
        setDragImage(node) {
            transfer.dragImage = node;
        }
    };
    Object.defineProperties(event, {
        // Handlers are called directly rather than dispatched, so the target
        // the drag code reads has to be stated here.
        target: { value: target },
        clientX: { value: clientX },
        clientY: { value: clientY },
        dataTransfer: { value: transfer }
    });
    return event;
}
