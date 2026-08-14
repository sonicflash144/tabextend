export function createSelectionController(document) {
    let lastSelectedIndex = null;

    function visibleItems() {
        return Array.from(document.querySelectorAll('li:not(.subgroup-item)')).filter(
            item => item.offsetParent !== null
        );
    }

    function selectedItems() {
        return Array.from(document.querySelectorAll('.selected'));
    }

    function clear() {
        selectedItems().forEach(item => item.classList.remove('selected'));
    }

    function handleItemClick(item, event) {
        event.stopPropagation();
        const selected = selectedItems();
        const items = visibleItems();
        const currentIndex = items.indexOf(item);

        if (event.ctrlKey || event.metaKey) {
            item.classList.toggle('selected');
        } else if (event.shiftKey && lastSelectedIndex !== null) {
            const start = Math.min(lastSelectedIndex, currentIndex);
            const end = Math.max(lastSelectedIndex, currentIndex);
            for (let index = start; index <= end; index += 1) {
                items[index]?.classList.add('selected');
            }
        } else if (selected.length === 1 && selected[0] === item) {
            item.classList.remove('selected');
        } else {
            clear();
            item.classList.add('selected');
        }

        lastSelectedIndex = currentIndex;
    }

    function resetAnchor() {
        lastSelectedIndex = null;
    }

    return { clear, handleItemClick, resetAnchor, selectedItems, visibleItems };
}
