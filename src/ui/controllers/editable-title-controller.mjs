export function createEditableTitleController(document, options = {}) {
    const {
        initialText = '',
        groupClass = '',
        inputClass = '',
        spanClass = '',
        onSave = () => {},
        defaultText = 'New Title',
        container = 'span'
    } = options;

    // classList rejects empty tokens, so unnamed classes are simply skipped.
    function addClass(element, className) {
        if (className) element.classList.add(className);
    }

    const titleGroup = document.createElement('div');
    addClass(titleGroup, groupClass);
    const titleSpan = document.createElement(container);
    addClass(titleSpan, spanClass);
    titleSpan.textContent = initialText || defaultText;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    addClass(titleInput, inputClass);
    titleInput.style.display = 'none';

    titleSpan.addEventListener('click', () => {
        titleInput.value = titleSpan.textContent;
        titleInput.dataset.originalValue = titleInput.value;
        titleInput.style.display = 'inline';
        titleSpan.style.display = 'none';
        titleInput.focus();
        titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        const column = titleSpan.closest('.column');
        if (column) column.draggable = false;
        const subgroup = titleSpan.closest('.subgroup-item');
        if (subgroup) subgroup.draggable = false;
    });

    titleInput.addEventListener('blur', () => {
        const column = titleInput.closest('.column');
        if (column) column.draggable = true;
        const subgroup = titleSpan.closest('.subgroup-item');
        if (subgroup) subgroup.draggable = true;
        const trimmedValue = titleInput.value.trim();
        titleSpan.textContent = trimmedValue || defaultText;
        titleInput.style.display = 'none';
        titleSpan.style.display = 'inline';
        onSave(trimmedValue);
    });

    titleInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            titleInput.blur();
        } else if (event.key === 'Escape') {
            titleInput.value = titleInput.dataset.originalValue || '';
            titleInput.blur();
        }
    });

    titleGroup.append(titleInput, titleSpan);
    return { titleGroup, titleInput, titleSpan };
}
