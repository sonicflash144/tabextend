const COLLAPSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;
const EXPAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up"><path d="m18 15-6-6-6 6"/></svg>`;

export function createDeletionArea(document, onDragLeave) {
    const deletionArea = document.createElement('div');
    deletionArea.id = 'deletion-area';

    const deleteIcon = document.createElement('div');
    deleteIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>`;
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

export function createDraggableListItem(document, options = {}) {
    const {
        id,
        isSubgroup = false,
        classes = [],
        onDragStart,
        onDragEnd
    } = options;
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
    const titleSpan = column.querySelector('.column-title-text');
    const titleInput = column.querySelector('.column-title-input');
    const maximizeButton = column.querySelector('.maximize-column');
    const minimizeButton = column.querySelector('.minimize-column');
    const titleGroup = column.querySelector('.title-group');
    const menuContainer = column.querySelector('.menu-container');
    const menuButton = column.querySelector('.more-options');
    const headerContainer = column.querySelector('.header-container');

    column.classList.toggle('minimized', minimized);
    titleSpan.classList.toggle('vertical-text', minimized);
    titleInput.classList.toggle('vertical-text', minimized);
    titleGroup.classList.toggle('vertical', minimized);
    maximizeButton.style.display = minimized ? 'inline' : 'none';
    minimizeButton.style.display = minimized ? 'none' : 'inline';
    menuContainer.classList.toggle('vertical', minimized);
    menuButton.classList.toggle('vertical', minimized);
    headerContainer.classList.toggle('vertical', minimized);
    column.querySelectorAll('.tab-item').forEach(item => {
        item.style.display = minimized ? 'none' : 'flex';
    });
}

export function setSubgroupExpanded(expandButton, expanded) {
    const nextExpanded = expanded ?? !expandButton.classList.contains('expanded');
    const container = expandButton.closest('.tab-group-container');
    const faviconsContainer = container.querySelector('.favicons-container');
    const expandedContainer = container.querySelector('.expanded-tabs');

    expandButton.classList.toggle('expanded', nextExpanded);
    expandButton.innerHTML = nextExpanded ? EXPAND_ICON : COLLAPSE_ICON;
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

const MORE_OPTIONS_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>`;
const FILLED_MORE_OPTIONS_ICON = MORE_OPTIONS_ICON.replace('fill="none"', 'fill="currentColor"');

export function createSavedTabView(document, options) {
    const {
        tab,
        navigableUrl,
        faviconUrl,
        colorClass,
        formattedDate,
        dateDisplayColor,
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
    const faviconImage = document.createElement('img');
    if (faviconUrl) faviconImage.src = faviconUrl;
    faviconImage.draggable = false;
    infoLeft.appendChild(faviconImage);

    const infoRight = document.createElement('div');
    infoRight.classList.add('tab-info-right');
    const titleDisplay = document.createElement('a');
    titleDisplay.classList.add('tab-title');
    titleDisplay.id = `title-display-${tab.id}`;
    titleDisplay.style.textDecoration = 'none';
    titleDisplay.textContent = typeof tab.title === 'string' ? tab.title : '';
    if (navigableUrl) titleDisplay.href = navigableUrl;
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
    dateDisplay.style.backgroundColor = dateDisplayColor;
    infoRight.append(titleDisplay, titleInput, noteDisplay, noteInput, dateDisplay);

    const actions = document.createElement('div');
    actions.classList.add('tab-actions');
    const moreOptionsButton = document.createElement('button');
    moreOptionsButton.classList.add('more-options');
    moreOptionsButton.dataset.index = String(tab.id);
    moreOptionsButton.innerHTML = FILLED_MORE_OPTIONS_ICON;
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
    const {
        id,
        minimized,
        emoji,
        theme,
        titleGroup,
        fallbackEmoji,
        onDragStart,
        onDragEnd
    } = options;
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
    minimizeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-to-line"><path d="M3 19V5"/><path d="m13 6-6 6 6 6"/><path d="M7 12h14"/></svg>`;
    const maximizeButton = document.createElement('button');
    maximizeButton.classList.add('maximize-column');
    maximizeButton.title = 'Maximize Column';
    maximizeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-maximize-2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`;
    const menuContainer = document.createElement('div');
    menuContainer.classList.add('menu-container');
    const menuButton = document.createElement('button');
    menuButton.classList.add('more-options');
    menuButton.innerHTML = MORE_OPTIONS_ICON;
    menuContainer.appendChild(menuButton);
    const emojiButton = document.createElement('button');
    emojiButton.classList.add('emoji-button');
    emojiButton.textContent = emoji || fallbackEmoji;
    column.dataset.emoji = emojiButton.textContent;
    const emojiPicker = document.createElement('emoji-picker');
    emojiPicker.classList.add('emoji-picker-on-top', theme);
    emojiPicker.style.display = 'none';

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
    expandButton.innerHTML = COLLAPSE_ICON;
    const moreOptionsButton = document.createElement('button');
    moreOptionsButton.classList.add('more-options');
    moreOptionsButton.innerHTML = MORE_OPTIONS_ICON;
    actions.append(expandButton, moreOptionsButton);
    titleGroup.appendChild(actions);
    infoContainer.append(faviconsContainer, expandedContainer);
    groupContainer.appendChild(infoContainer);
    item.appendChild(groupContainer);
    return { item, faviconsContainer, expandedContainer, expandButton, moreOptionsButton };
}

export function createSubgroupPreview(document, options) {
    const { tab, navigableUrl, faviconUrl, colorClass } = options;
    const wrapper = document.createElement('a');
    if (navigableUrl) wrapper.href = navigableUrl;
    wrapper.classList.add('favicon-wrapper', colorClass);
    wrapper.style.textDecoration = 'none';
    const favicon = document.createElement('img');
    if (faviconUrl) favicon.src = faviconUrl;
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
    const { tab, classes, faviconUrl, onDragStart, onDragEnd } = options;
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
    const faviconImage = document.createElement('img');
    if (faviconUrl) faviconImage.src = faviconUrl;
    faviconImage.draggable = false;
    infoLeft.appendChild(faviconImage);
    const infoRight = document.createElement('div');
    infoRight.classList.add('tab-info-right');
    const title = document.createElement('span');
    title.classList.add('tab-title');
    title.textContent = typeof tab.title === 'string' ? tab.title : '';
    infoRight.appendChild(title);
    const actions = document.createElement('div');
    actions.classList.add('tab-actions');
    actions.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" class="close-button" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`;
    infoContainer.append(infoLeft, infoRight, actions);
    item.appendChild(infoContainer);
    return { item, infoLeft, title, closeButton: actions.querySelector('.close-button') };
}

export function createNewColumnIndicator(document) {
    const indicator = document.createElement('div');
    indicator.classList.add('new-column-indicator');
    const icon = document.createElement('div');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" class="main-grid-item-icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" x2="12" y1="11" y2="17"/><line x1="9" x2="15" y1="14" y2="14"/></svg>`;
    icon.classList.add('new-column-icon');
    indicator.appendChild(icon);
    indicator.addEventListener('dragleave', event => {
        if (!indicator.contains(event.relatedTarget)) {
            indicator.classList.remove('new-column-indicator-active');
        }
    });
    return indicator;
}
