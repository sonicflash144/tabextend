import { isFileUrl } from '../domain/browser-tabs.mjs';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_DEFINITIONS = {
    'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
    'chevron-up': [['path', { d: 'm18 15-6-6-6 6' }]],
    close: [
        ['line', { x1: '18', x2: '6', y1: '6', y2: '18' }],
        ['line', { x1: '6', x2: '18', y1: '6', y2: '18' }]
    ],
    delete: [
        ['polyline', { points: '3 6 5 6 21 6' }],
        [
            'path',
            { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }
        ],
        ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
        ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }]
    ],
    file: [
        ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
        ['path', { d: 'M14 2v5h6' }]
    ],
    maximize: [
        ['polyline', { points: '15 3 21 3 21 9' }],
        ['polyline', { points: '9 21 3 21 3 15' }],
        ['line', { x1: '21', x2: '14', y1: '3', y2: '10' }],
        ['line', { x1: '3', x2: '10', y1: '21', y2: '14' }]
    ],
    minimize: [
        ['path', { d: 'M3 19V5' }],
        ['path', { d: 'm13 6-6 6 6 6' }],
        ['path', { d: 'M7 12h14' }]
    ],
    more: [
        ['circle', { cx: '12', cy: '12', r: '1' }],
        ['circle', { cx: '12', cy: '5', r: '1' }],
        ['circle', { cx: '12', cy: '19', r: '1' }]
    ],
    'new-column': [
        [
            'path',
            { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }
        ],
        ['line', { x1: '12', x2: '12', y1: '11', y2: '17' }],
        ['line', { x1: '9', x2: '15', y1: '14', y2: '14' }]
    ]
};

function createIcon(document, name, options = {}) {
    const definition = ICON_DEFINITIONS[name];
    if (!definition) throw new Error(`Unknown icon ${JSON.stringify(name)}.`);
    const { width = 24, height = width, filled = false, classes = [] } = options;
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const attributes = {
        xmlns: SVG_NAMESPACE,
        width: String(width),
        height: String(height),
        viewBox: '0 0 24 24',
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true'
    };
    Object.entries(attributes).forEach(([key, value]) => svg.setAttribute(key, value));
    svg.classList.add('main-grid-item-icon', ...classes);

    definition.forEach(([tagName, childAttributes]) => {
        const child = document.createElementNS(SVG_NAMESPACE, tagName);
        Object.entries(childAttributes).forEach(([key, value]) => child.setAttribute(key, value));
        svg.appendChild(child);
    });
    return svg;
}

function setButtonIcon(button, name, options) {
    button.replaceChildren(createIcon(button.ownerDocument, name, options));
}

/**
 * Roughly the picker's natural width: eight columns of emoji at the element's
 * default sizes. Only used when the element cannot be measured.
 */
export const EMOJI_PICKER_WIDTH = 320;

/**
 * Where a popover anchored to a button should start, in viewport
 * coordinates. It normally lines up with the button's left edge, but near the
 * right of the window it lines its right edge up with the button's instead,
 * so it stays on screen.
 */
export function popoverLeftForAnchor(anchorRect, popoverWidth, viewportWidth) {
    if (anchorRect.left + popoverWidth <= viewportWidth) return anchorRect.left;
    return Math.max(0, anchorRect.right - popoverWidth);
}

/**
 * The `emoji-picker` custom element from `emoji-picker-element`, which the
 * page registers on load. It reports a choice as an `emoji-click` event
 * carrying `detail.unicode`.
 */
function createEmojiPicker(document, theme) {
    const picker = document.createElement('emoji-picker');
    picker.classList.add('emoji-picker-on-top', theme);
    picker.style.display = 'none';
    return picker;
}

export function createDeletionArea(document, onDragLeave) {
    const deletionArea = document.createElement('div');
    deletionArea.id = 'deletion-area';

    const deleteIcon = document.createElement('div');
    deleteIcon.appendChild(createIcon(document, 'delete', { width: 40 }));
    deleteIcon.classList.add('delete-icon');
    deletionArea.appendChild(deleteIcon);
    deletionArea.addEventListener('dragleave', event => {
        if (!deletionArea.contains(event.relatedTarget)) {
            deletionArea.classList.remove('deletion-area-active');
            onDragLeave?.(event);
        }
    });
    document.body.appendChild(deletionArea);
    return deletionArea;
}

export function createMenuDropdown(document, menuItems, button) {
    const menuDropdown = document.createElement('div');
    menuDropdown.className = 'options-menu';

    menuItems.forEach(item => {
        if (item.hidden) return;
        const menuItem = document.createElement('button');
        menuItem.classList.add('menu-option');
        const menuLabel = document.createElement('span');
        menuLabel.textContent = item.text;
        menuItem.appendChild(menuLabel);
        menuItem.addEventListener('click', event => {
            event.stopPropagation();
            item.action(event);
            menuDropdown.style.display = 'none';
        });
        menuDropdown.appendChild(menuItem);
    });

    const buttonRect = button.getBoundingClientRect();
    menuDropdown.style.position = 'fixed';
    menuDropdown.style.top = `${buttonRect.bottom + 5}px`;
    menuDropdown.style.right = `${window.innerWidth - buttonRect.right}px`;
    document.body.appendChild(menuDropdown);
    return menuDropdown;
}

/** The swatch grid shown under a tab's menu button. */
export function createColorMenu(document, options) {
    const { colors, button, onSelect } = options;
    const colorMenu = document.createElement('div');
    colorMenu.classList.add('color-menu');

    colors.forEach(color => {
        const colorOption = document.createElement('div');
        colorOption.classList.add('color-option', color);
        colorOption.addEventListener('click', () => onSelect(color));
        colorMenu.appendChild(colorOption);
    });

    document.body.appendChild(colorMenu);
    const buttonRect = button.getBoundingClientRect();
    colorMenu.style.top = `${buttonRect.bottom + 5}px`;
    colorMenu.style.right = `${window.innerWidth - buttonRect.right}px`;
    return colorMenu;
}

/**
 * The dot marking something unread. The inline form sits inside a menu
 * option rather than on a toolbar button.
 */
export function createNotificationDot(document, options = {}) {
    const dot = document.createElement('div');
    dot.classList.add('notification-circle');
    if (options.inline) dot.classList.add('inline-notification');
    return dot;
}

export function createDraggableListItem(document, options = {}) {
    const { id, isSubgroup = false, classes = [], onDragStart, onDragEnd } = options;
    const item = document.createElement('li');
    item.classList.add('tab-item', ...classes);
    if (isSubgroup) item.classList.add('subgroup-item');
    item.draggable = true;
    item.id = id;
    if (onDragStart) item.addEventListener('dragstart', onDragStart);
    if (onDragEnd) item.addEventListener('dragend', onDragEnd);
    return item;
}

export function setColumnMinimized(column, minimized) {
    column.classList.toggle('minimized', minimized);
}

export function setSubgroupExpanded(expandButton, expanded) {
    const nextExpanded = expanded ?? !expandButton.classList.contains('expanded');
    const container = expandButton.closest('.tab-group-container');
    const faviconsContainer = container.querySelector('.favicons-container');
    const expandedContainer = container.querySelector('.expanded-tabs');

    expandButton.classList.toggle('expanded', nextExpanded);
    setButtonIcon(expandButton, nextExpanded ? 'chevron-up' : 'chevron-down');
    faviconsContainer.style.display = nextExpanded ? 'none' : 'flex';
    expandedContainer.style.display = nextExpanded ? 'flex' : 'none';
    return nextExpanded;
}

export function getColorClass(color) {
    switch (color) {
        case '#FFFFFF':
            return 'tab-default';
        case '#ffc4c4':
        case '#f7c2d6':
            return 'tab-pink';
        case '#fffdc4':
        case '#f9ffc4':
            return 'tab-yellow';
        case '#b0e5ff':
        case '#c6e2e9':
            return 'tab-blue';
        case '#ebc4ff':
        case '#e9c8fa':
            return 'tab-purple';
        default:
            return 'tab-default';
    }
}

/**
 * A tab's own icon, or the icon named as its fallback when it has none that
 * can render. The fallback is drawn from the shared set, so it follows the
 * theme through `currentColor`; an image would have to carry its own colour.
 *
 * Either way it carries `tab-favicon`, because the two are different elements
 * and the stylesheet has to size and align the slot without knowing which one
 * is in it.
 */
function createFavicon(document, options = {}) {
    const { faviconUrl, faviconFallback } = options;
    if (!faviconUrl && faviconFallback) {
        return createIcon(document, faviconFallback, {
            width: 24,
            classes: ['tab-favicon']
        });
    }
    const image = document.createElement('img');
    image.classList.add('tab-favicon');
    if (faviconUrl) image.src = faviconUrl;
    return image;
}

export function createSavedTabView(document, options) {
    const {
        tab,
        navigableUrl,
        faviconUrl,
        faviconFallback,
        colorClass,
        formattedDate,
        dateDisplayClass,
        noteDisplayText,
        noteEditableText,
        onDragStart,
        onDragEnd
    } = options;
    const item = createDraggableListItem(document, {
        id: `tab-${tab.id}`,
        onDragStart,
        onDragEnd
    });
    item.dataset.url = navigableUrl;
    item.classList.add(colorClass);

    const infoContainer = document.createElement('div');
    infoContainer.classList.add('tab-info-container');
    const infoLeft = document.createElement('div');
    infoLeft.classList.add('tab-info-left');
    const faviconImage = createFavicon(document, { faviconUrl, faviconFallback });
    faviconImage.draggable = false;
    infoLeft.appendChild(faviconImage);

    const infoRight = document.createElement('div');
    infoRight.classList.add('tab-info-right');
    const titleDisplay = document.createElement('a');
    titleDisplay.classList.add('tab-title');
    titleDisplay.id = `title-display-${tab.id}`;
    titleDisplay.style.textDecoration = 'none';
    titleDisplay.textContent = typeof tab.title === 'string' ? tab.title : '';
    // Local files already have to open through the tabs API. Leaving their
    // `file://` URL on an anchor lets Safari claim the gesture as a native
    // link drag before the draggable row can receive it.
    if (navigableUrl && !isFileUrl(navigableUrl)) titleDisplay.href = navigableUrl;
    // The row is the drag source, never the link inside it. A link with an
    // href is a drag source by default and would be found first, which puts
    // the browser's own link drag in charge: Firefox then refuses to drag a
    // `file://` target from an extension page and the row cannot be moved at
    // all. Local links omit the href as well because Safari can still claim
    // that gesture before the row. Same reason the favicon opts out.
    titleDisplay.draggable = false;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.classList.add('hidden');
    titleInput.id = `title-input-${tab.id}`;
    titleInput.value = typeof tab.title === 'string' ? tab.title : '';
    const noteDisplay = document.createElement('div');
    noteDisplay.classList.add('note-display', 'fixed-width');
    noteDisplay.id = `note-display-${tab.id}`;
    noteDisplay.textContent = noteDisplayText;
    const noteInput = document.createElement('textarea');
    noteInput.classList.add('tab-note', 'hidden');
    noteInput.id = `note-input-${tab.id}`;
    noteInput.value = noteEditableText;
    const dateDisplay = document.createElement('div');
    dateDisplay.classList.add('date-display');
    if (!formattedDate) dateDisplay.classList.add('hidden');
    dateDisplay.id = `date-display-${tab.id}`;
    dateDisplay.textContent = formattedDate || '';
    if (dateDisplayClass) dateDisplay.classList.add(dateDisplayClass);
    infoRight.append(titleDisplay, titleInput, noteDisplay, noteInput, dateDisplay);

    const actions = document.createElement('div');
    actions.classList.add('tab-actions');
    const moreOptionsButton = document.createElement('button');
    moreOptionsButton.classList.add('more-options');
    moreOptionsButton.dataset.index = String(tab.id);
    moreOptionsButton.appendChild(
        createIcon(document, 'more', {
            width: 20,
            filled: true
        })
    );
    actions.appendChild(moreOptionsButton);
    infoContainer.append(infoLeft, infoRight, actions);
    item.appendChild(infoContainer);

    return {
        item,
        infoLeft,
        titleDisplay,
        titleInput,
        noteDisplay,
        noteInput,
        dateDisplay,
        moreOptionsButton
    };
}

export function createColumnView(document, options) {
    const { id, minimized, emoji, theme, titleGroup, fallbackEmoji, onDragStart, onDragEnd } =
        options;
    const column = document.createElement('div');
    column.classList.add('column');
    if (minimized) column.classList.add('minimized');
    column.id = id;
    column.draggable = true;
    if (onDragStart) column.addEventListener('dragstart', onDragStart);
    if (onDragEnd) column.addEventListener('dragend', onDragEnd);

    const headerContainer = document.createElement('div');
    headerContainer.classList.add('header-container');
    const minimizeButton = document.createElement('button');
    minimizeButton.classList.add('minimize-column');
    minimizeButton.title = 'Minimize Column';
    minimizeButton.appendChild(createIcon(document, 'minimize'));
    const maximizeButton = document.createElement('button');
    maximizeButton.classList.add('maximize-column');
    maximizeButton.title = 'Maximize Column';
    maximizeButton.appendChild(createIcon(document, 'maximize'));
    const menuContainer = document.createElement('div');
    menuContainer.classList.add('menu-container');
    const menuButton = document.createElement('button');
    menuButton.classList.add('more-options');
    menuButton.appendChild(createIcon(document, 'more', { width: 20 }));
    menuContainer.appendChild(menuButton);
    const emojiButton = document.createElement('button');
    emojiButton.classList.add('emoji-button');
    emojiButton.textContent = emoji || fallbackEmoji;
    column.dataset.emoji = emojiButton.textContent;
    const emojiPicker = createEmojiPicker(document, theme);

    titleGroup.insertBefore(emojiPicker, titleGroup.firstChild);
    titleGroup.insertBefore(emojiButton, titleGroup.firstChild);
    headerContainer.append(minimizeButton, maximizeButton, titleGroup, menuContainer);
    column.appendChild(headerContainer);
    return { column, minimizeButton, maximizeButton, menuButton, emojiButton, emojiPicker };
}

export function createSubgroupView(document, options) {
    const { group, titleGroup, onDragStart, onDragEnd } = options;
    const item = createDraggableListItem(document, {
        id: group.id,
        isSubgroup: true,
        onDragStart,
        onDragEnd
    });
    const groupContainer = document.createElement('div');
    groupContainer.classList.add('tab-group-container');
    groupContainer.appendChild(titleGroup);
    const infoContainer = document.createElement('div');
    infoContainer.classList.add('tab-info-container');
    const faviconsContainer = document.createElement('div');
    faviconsContainer.classList.add('favicons-container');
    const expandedContainer = document.createElement('div');
    expandedContainer.classList.add('expanded-tabs');
    expandedContainer.style.display = 'none';
    const actions = document.createElement('div');
    actions.classList.add('subgroup-tab-actions');
    const expandButton = document.createElement('button');
    expandButton.classList.add('expand-button');
    expandButton.appendChild(createIcon(document, 'chevron-down'));
    const moreOptionsButton = document.createElement('button');
    moreOptionsButton.classList.add('more-options');
    moreOptionsButton.appendChild(createIcon(document, 'more', { width: 20 }));
    actions.append(expandButton, moreOptionsButton);
    titleGroup.appendChild(actions);
    infoContainer.append(faviconsContainer, expandedContainer);
    groupContainer.appendChild(infoContainer);
    item.appendChild(groupContainer);
    return { item, faviconsContainer, expandedContainer, expandButton, moreOptionsButton };
}

export function createSubgroupPreview(document, options) {
    const { tab, navigableUrl, faviconUrl, faviconFallback, colorClass } = options;
    const wrapper = document.createElement('a');
    if (navigableUrl) wrapper.href = navigableUrl;
    wrapper.classList.add('favicon-wrapper', colorClass);
    wrapper.style.textDecoration = 'none';
    // The subgroup row owns the drag, so its preview links opt out the way the
    // saved-tab title does; a `file://` preview would otherwise stop the whole
    // subgroup from being draggable in Firefox.
    wrapper.draggable = false;
    const favicon = createFavicon(document, { faviconUrl, faviconFallback });
    favicon.dataset.tabId = String(tab.id);
    favicon.classList.add('subgroup-favicon');
    favicon.dataset.url = navigableUrl;
    favicon.draggable = false;
    const title = document.createElement('div');
    title.classList.add('favicon-title');
    title.textContent = tab.title;
    title.title = tab.title;
    wrapper.append(favicon, title);
    return wrapper;
}

export function createOpenTabView(document, options) {
    const { tab, classes, faviconUrl, faviconFallback, onDragStart, onDragEnd } = options;
    const item = createDraggableListItem(document, {
        id: `opentab-${tab.id}`,
        classes,
        onDragStart,
        onDragEnd
    });
    const infoContainer = document.createElement('div');
    infoContainer.classList.add('tab-info-container');
    const infoLeft = document.createElement('div');
    infoLeft.classList.add('tab-info-left');
    const faviconContainer = document.createElement('div');
    faviconContainer.classList.add('open-tab-favicon-container');
    const faviconImage = createFavicon(document, { faviconUrl, faviconFallback });
    faviconImage.draggable = false;
    faviconContainer.appendChild(faviconImage);
    if (tab.pinned === true) {
        const pinIndicator = document.createElement('span');
        pinIndicator.classList.add('pinned-tab-indicator');
        pinIndicator.setAttribute('aria-label', 'Pinned tab');
        faviconContainer.appendChild(pinIndicator);
    }
    infoLeft.appendChild(faviconContainer);
    const infoRight = document.createElement('div');
    infoRight.classList.add('tab-info-right');
    const title = document.createElement('span');
    title.classList.add('tab-title');
    title.textContent = typeof tab.title === 'string' ? tab.title : '';
    infoRight.appendChild(title);
    const actions = document.createElement('div');
    actions.classList.add('tab-actions');
    const closeButton = createIcon(document, 'close', {
        width: 20,
        classes: ['close-button']
    });
    actions.appendChild(closeButton);
    infoContainer.append(infoLeft, infoRight, actions);
    item.appendChild(infoContainer);
    return { item, infoLeft, faviconContainer, title, closeButton };
}

export function createNewColumnIndicator(document) {
    const indicator = document.createElement('div');
    indicator.classList.add('new-column-indicator');
    const icon = document.createElement('div');
    icon.appendChild(createIcon(document, 'new-column', { width: 40 }));
    icon.classList.add('new-column-icon');
    indicator.appendChild(icon);
    indicator.addEventListener('dragleave', event => {
        if (!indicator.contains(event.relatedTarget)) {
            indicator.classList.remove('new-column-indicator-active');
        }
    });
    return indicator;
}
