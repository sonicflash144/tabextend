import {
    autoScrollSpeeds,
    clampColumnIndicatorLeft,
    clampIndicatorSpan,
    clampIndicatorTop,
    columnDropIndexForRects,
    dropIndexForRects,
    INDICATOR_THICKNESS,
    isPointerOnItem
} from '../../domain/drag-geometry.mjs';

const OPEN_TABS_LIST_ID = 'open-tabs-list';

function toArray(collection) {
    return Array.from(collection || []);
}

/**
 * Owns drag and drop coordination for the page: which elements are being
 * dragged, the auto-scroll animation, the drop indicator, and reading a drop
 * event back into a description of what the user asked for. Applying that
 * description to stored state stays with the page.
 */
export function createDragController(document, options = {}) {
    const {
        columnsContainer,
        getDeletionArea = () => null,
        getNewColumnIndicator = () => null,
        onDragStart = () => {},
        requestFrame = callback => globalThis.requestAnimationFrame(callback),
        cancelFrame = handle => globalThis.cancelAnimationFrame(handle)
    } = options;

    let dropType = null;
    let dropIndicator = null;
    const scrollAnimation = {
        isScrolling: false,
        scrollX: 0,
        scrollY: 0,
        animationFrameId: null
    };

    function startScrolling(container) {
        function animate() {
            if (!scrollAnimation.isScrolling) return;

            if (scrollAnimation.scrollX !== 0 || scrollAnimation.scrollY !== 0) {
                container.scrollBy(scrollAnimation.scrollX, scrollAnimation.scrollY);
                scrollAnimation.animationFrameId = requestFrame(animate);
            } else {
                stopScrolling();
            }
        }
        scrollAnimation.animationFrameId = requestFrame(animate);
    }

    function stopScrolling() {
        scrollAnimation.isScrolling = false;
        scrollAnimation.scrollX = 0;
        scrollAnimation.scrollY = 0;
        if (scrollAnimation.animationFrameId) {
            cancelFrame(scrollAnimation.animationFrameId);
            scrollAnimation.animationFrameId = null;
        }
    }

    function updateAutoScroll(event) {
        const containerRect = columnsContainer.getBoundingClientRect();
        const speeds = autoScrollSpeeds(event, containerRect);
        scrollAnimation.scrollX = speeds.scrollX;
        scrollAnimation.scrollY = speeds.scrollY;

        const scrolling = speeds.scrollX !== 0 || speeds.scrollY !== 0;
        if (!scrollAnimation.isScrolling && scrolling) {
            scrollAnimation.isScrolling = true;
            startScrolling(columnsContainer);
        } else if (!scrolling) {
            stopScrolling();
        }
        return containerRect;
    }

    function draggingItems() {
        return toArray(document.querySelectorAll('.dragging'));
    }

    /**
     * Insertion index within a list of item elements. A dragged subgroup
     * ignores items nested inside other subgroups.
     */
    function dropIndexForItems(event, items, isMinimized = false) {
        let candidates = items;
        if (!isMinimized) {
            const dragged = document.querySelector('.dragging');
            if (dragged && dragged.classList.contains('subgroup-item')) {
                candidates = items.filter(item => !item.closest('.expanded-tabs'));
            }
        }
        return dropIndexForRects(
            event.clientY,
            candidates.map(item => item.getBoundingClientRect()),
            { isMinimized }
        );
    }

    function columnDropIndex(event) {
        const columns = toArray(columnsContainer.querySelectorAll('.column'));
        return columnDropIndexForRects(
            event.clientX,
            columns.map(column => column.getBoundingClientRect())
        );
    }

    /**
     * The item the pointer is resting on, if any. Items in the open tab list,
     * items being dragged, and the subgroup a dragged item already belongs to
     * are never targets.
     */
    function targetItemAtPointer(event, items, dragged) {
        return items.find(item => {
            if (
                item.closest(`#${OPEN_TABS_LIST_ID}`) ||
                item.classList.contains('dragging') ||
                item.closest('.expanded-tabs')
            ) {
                return false;
            }
            const targetSubgroup = item.closest('.subgroup-item');
            if (targetSubgroup && dragged.some(tab => targetSubgroup.contains(tab))) {
                return false;
            }
            return isPointerOnItem(event.clientY, item.getBoundingClientRect());
        });
    }

    /**
     * The subgroup every dragged item sits in, or null when they come from
     * different places. Callers decide how a dragged subgroup itself counts.
     */
    function sharedSubgroup(items) {
        if (items.length === 0) return null;
        const first = items[0].closest('.subgroup-item');
        return items.every(item => item.closest('.subgroup-item') === first) ? first : null;
    }

    function ensureDropIndicator() {
        if (dropIndicator) return dropIndicator;
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        const container = document.createElement('div');
        container.className = 'drop-indicator-container';
        container.appendChild(dropIndicator);
        document.body.appendChild(container);
        return dropIndicator;
    }

    function handleTabDragStart(event) {
        // Don't initiate tab drag if dragging from an input/textarea
        // (e.g. text selection).
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        event.stopPropagation();
        onDragStart();
        const tabItem = event.target.closest('.tab-item');
        if (!tabItem) return;
        event.dataTransfer.setData('text/plain', tabItem.id);
        event.dataTransfer.setDragImage(tabItem, 0, 0);
        dropType = 'list-item';

        const selectedItems = toArray(document.querySelectorAll('.selected'));
        const isDraggedItemSelected = tabItem.classList.contains('selected');

        if (isDraggedItemSelected && selectedItems.length > 1) {
            selectedItems.forEach(item => item.classList.add('dragging'));
        }
        // If dragging an unselected item, only that item is dragged.
        else {
            selectedItems.forEach(item => item.classList.remove('selected'));
            tabItem.classList.add('dragging');
        }
    }

    function handleColumnDragStart(event) {
        // Don't initiate column drag if dragging from an input/textarea
        // (e.g. text selection).
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        const column = event.target.closest('.column');
        if (!column) return;

        // Don't initiate drag while the column title is being edited.
        if (!column.draggable) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        onDragStart();
        if (event.target.closest('.tab-item')) {
            event.preventDefault();
            return;
        }

        toArray(document.querySelectorAll('.selected')).forEach(item =>
            item.classList.remove('selected')
        );

        event.dataTransfer.setData('text/plain', column.id);
        event.dataTransfer.setDragImage(column, 0, 0);
        dropType = 'column';
        column.classList.add('dragging');
    }

    function renderListItemIndicator(event, context) {
        const { sidebar, sidebarRect, spaceContainerRect, containerScrollTop } = context;
        const newColumnIndicator = getNewColumnIndicator();
        newColumnIndicator.style.display = 'flex';

        const column = event.target.closest('.column');
        const element = sidebar ? document.getElementById(OPEN_TABS_LIST_ID) : column;
        if (!element) {
            dropIndicator.style.display = 'none';
            return;
        }

        const rect = element.getBoundingClientRect();
        // Only top-level tab items; items inside subgroups are not drop slots.
        const listItems = toArray(element.children).filter(
            item => item.classList.contains('tab-item') && !item.closest('.expanded-tabs')
        );
        const isMinimized = Boolean(column && column.classList.contains('minimized'));
        const dropPosition = dropIndexForItems(event, listItems, isMinimized);

        const span = sidebar
            ? { left: sidebarRect.left, width: sidebarRect.width }
            : clampIndicatorSpan({ left: rect.left, width: rect.width }, spaceContainerRect);
        dropIndicator.style.width = `${span.width}px`;
        dropIndicator.style.height = `${INDICATOR_THICKNESS}px`;
        dropIndicator.style.left = `${span.left}px`;

        // The list indicator has always been clamped to the sidebar's box,
        // for the sidebar and for columns alike.
        const containerRect = sidebarRect;
        let indicatorTop;
        if (dropPosition === listItems.length) {
            const lastItem = listItems[listItems.length - 1];
            indicatorTop =
                isMinimized || !lastItem
                    ? rect.top + containerScrollTop
                    : lastItem.getBoundingClientRect().bottom + containerScrollTop;
        } else {
            indicatorTop = listItems[dropPosition].getBoundingClientRect().top + containerScrollTop;
        }
        dropIndicator.style.top = `${clampIndicatorTop(indicatorTop, containerRect)}px`;

        const dragged = draggingItems();
        const targetTab = targetItemAtPointer(event, listItems, dragged);

        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('targeted');
        });
        if (targetTab) {
            targetTab.classList.add('targeted');
            dropIndicator.style.display = 'none';
        } else {
            dropIndicator.style.display = 'block';
        }

        // Rearranging tabs within the subgroup they came from. Dragging the
        // subgroup itself is a move, not a rearrangement.
        const draggedFromSubgroup = dragged[0]?.classList.contains('subgroup-item')
            ? null
            : sharedSubgroup(dragged);
        const targetInSubgroup = event.target.closest('.subgroup-item');
        if (!draggedFromSubgroup || targetInSubgroup !== draggedFromSubgroup) return;

        const subgroupItems = toArray(draggedFromSubgroup.querySelectorAll('.tab-item')).filter(
            item => item.closest('.expanded-tabs')
        );
        const subgroupDropPosition = dropIndexForItems(event, subgroupItems, isMinimized);
        const subgroupRect = draggedFromSubgroup.getBoundingClientRect();

        dropIndicator.style.width = `${subgroupRect.width}px`;
        dropIndicator.style.height = `${INDICATOR_THICKNESS}px`;
        dropIndicator.style.left = `${subgroupRect.left}px`;

        let subgroupIndicatorTop;
        if (subgroupDropPosition === subgroupItems.length) {
            const lastSubItem = subgroupItems[subgroupDropPosition - 1];
            subgroupIndicatorTop = lastSubItem
                ? lastSubItem.getBoundingClientRect().bottom + containerScrollTop
                : subgroupRect.top + containerScrollTop;
        } else {
            subgroupIndicatorTop =
                subgroupItems[subgroupDropPosition].getBoundingClientRect().top +
                containerScrollTop;
        }
        dropIndicator.style.top = `${subgroupIndicatorTop}px`;
    }

    function renderColumnIndicator(event, context) {
        const { containerRect, spaceContainerRect, containerScrollTop } = context;
        getNewColumnIndicator().style.display = 'none';
        dropIndicator.style.display = 'block';

        const columns = toArray(columnsContainer.querySelectorAll('.column'));
        const dropPosition = columnDropIndex(event);

        let indicatorLeft;
        if (dropPosition === columns.length) {
            const lastColumn = columns[columns.length - 1];
            indicatorLeft = lastColumn
                ? lastColumn.getBoundingClientRect().right
                : containerRect.left;
        } else {
            indicatorLeft = columns[dropPosition].getBoundingClientRect().left;
        }

        dropIndicator.style.width = `${INDICATOR_THICKNESS}px`;
        dropIndicator.style.height = `${containerRect.height}px`;
        dropIndicator.style.left = `${clampColumnIndicatorLeft(indicatorLeft, spaceContainerRect)}px`;
        dropIndicator.style.top = `${containerRect.top + containerScrollTop}px`;
    }

    function handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        const containerRect = updateAutoScroll(event);

        const deletionArea = getDeletionArea();
        const newColumnIndicator = getNewColumnIndicator();
        deletionArea.style.display = 'flex';
        if (deletionArea.contains(event.target)) {
            deletionArea.classList.add('deletion-area-active');
            if (dropIndicator) dropIndicator.style.display = 'none';
            return;
        }
        if (newColumnIndicator.contains(event.target)) {
            newColumnIndicator.classList.add('new-column-indicator-active');
            if (dropIndicator) dropIndicator.style.display = 'none';
            return;
        }

        const sidebarElement = document.getElementById('sidebar');
        const sidebar = event.target.closest('#sidebar');
        const spaceContainer = document.getElementById('space-container');
        const context = {
            containerRect,
            sidebar,
            sidebarRect: sidebarElement.getBoundingClientRect(),
            spaceContainerRect: spaceContainer.getBoundingClientRect(),
            containerScrollTop: sidebar ? sidebarElement.scrollTop : columnsContainer.scrollTop
        };

        ensureDropIndicator();

        if (dropType === 'list-item') {
            renderListItemIndicator(event, context);
        } else if (dropType === 'column') {
            renderColumnIndicator(event, context);
        }
    }

    /**
     * Read a drop event as a description of the requested change. Returns
     * null when the drop lands somewhere that means nothing.
     */
    function resolveDrop(event) {
        const droppedId = event.dataTransfer.getData('text/plain');
        const deletionArea = getDeletionArea();
        const droppedColumn = document.getElementById(droppedId);

        if (droppedColumn && droppedColumn.classList.contains('column')) {
            return deletionArea.contains(event.target)
                ? { type: 'delete-column', column: droppedColumn }
                : {
                      type: 'move-column',
                      column: droppedColumn,
                      index: columnDropIndex(event)
                  };
        }

        const dragged = draggingItems();
        const tabItem =
            dragged.find(item => item.id === droppedId) ||
            toArray(document.querySelectorAll('.tab-item')).find(item => item.id === droppedId);
        if (!tabItem) return null;
        const items = dragged.length > 1 ? dragged : [tabItem];

        if (deletionArea.contains(event.target)) {
            return { type: 'delete-items', items };
        }
        if (getNewColumnIndicator().contains(event.target)) {
            return { type: 'new-column', items };
        }

        const columnElement = event.target.closest('.column');
        const sidebar = event.target.closest('#sidebar');
        const destination =
            columnElement || (sidebar && document.getElementById(OPEN_TABS_LIST_ID));
        if (!destination) return null;

        const isMinimized = destination.classList.contains('minimized');
        const listItems = toArray(destination.querySelectorAll('.tab-item')).filter(
            item => !item.closest('.expanded-tabs')
        );
        const dropPosition = dropIndexForItems(event, listItems, isMinimized);

        if (destination.id === OPEN_TABS_LIST_ID) {
            return { type: 'open-tabs', items, index: dropPosition };
        }

        // Reordering within the subgroup the whole selection came from. A
        // dragged subgroup anywhere in the selection makes this a move.
        const draggedFromSubgroup = items.some(item => item.classList.contains('subgroup-item'))
            ? null
            : sharedSubgroup(items);
        if (draggedFromSubgroup && event.target.closest('.subgroup-item') === draggedFromSubgroup) {
            const subgroupItems = toArray(
                draggedFromSubgroup.querySelectorAll('.expanded-tabs .tab-item')
            );
            return {
                type: 'group',
                items,
                groupId: draggedFromSubgroup.id,
                index: dropIndexForItems(event, subgroupItems, false)
            };
        }

        const targetItem = targetItemAtPointer(event, listItems, dragged);
        if (targetItem) {
            return {
                type: 'item',
                items,
                item: targetItem.classList.contains('subgroup-item')
                    ? { type: 'group', groupId: targetItem.id }
                    : { type: 'tab', tabId: targetItem.id.slice('tab-'.length) }
            };
        }

        return {
            type: 'column',
            items,
            columnId: destination.id,
            index: dropPosition
        };
    }

    function handleDragEnd(event) {
        stopScrolling();
        document.querySelectorAll('.tab-item.dragging').forEach(item => {
            item.classList.remove('dragging');
        });
        event.target.closest('.column')?.classList.remove('dragging');

        const deletionArea = getDeletionArea();
        if (deletionArea) {
            deletionArea.style.display = 'none';
            deletionArea.classList.remove('deletion-area-active');
        }
        const newColumnIndicator = getNewColumnIndicator();
        if (newColumnIndicator) {
            newColumnIndicator.style.display = 'none';
            newColumnIndicator.classList.remove('new-column-indicator-active');
        }
        if (dropIndicator) dropIndicator.style.display = 'none';
        document.querySelectorAll('.tab-item').forEach(item => {
            item.style.outline = 'none';
        });
    }

    return {
        handleColumnDragStart,
        handleDragEnd,
        handleDragOver,
        handleTabDragStart,
        resolveDrop,
        stopScrolling
    };
}
