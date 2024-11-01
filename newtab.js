import { Chrono } from 'chrono-node';
let dropIndicator = null;
let dropType = null;
let deletionArea;
let newColumnIndicator;
let lastSelectedIndex = null;
let activeOptionsMenu = null;
let activeColorMenu = null;
let tabs_in_storage = [];
function getToday(tabDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of the day

    const parsedDate = new Date(tabDate);
    parsedDate.setHours(0, 0, 0, 0); // Normalize to start of the day

    const diffTime = parsedDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}
document.getElementById("add-column").addEventListener("click", () => {
    createColumn("New Column");
    saveColumnState();
    displaySavedTabs(tabs_in_storage);
});

function createDeletionArea() {
    deletionArea = document.createElement('div');
    deletionArea.id = 'deletion-area';

    // Create an img element for the SVG icon
    const deleteIcon = document.createElement('img');
    deleteIcon.src = '../icons/delete-icon.svg';
    deleteIcon.alt = 'Delete Icon';
    deleteIcon.classList.add('delete-icon');

    // Append the img element to the deletionArea
    deletionArea.appendChild(deleteIcon);

    deletionArea.addEventListener('dragover', handleDragOver);
    deletionArea.addEventListener('drop', handleDrop);
    deletionArea.addEventListener('dragleave', handleDragLeave);
    document.body.appendChild(deletionArea);
}
createDeletionArea();
function closeAllMenus() {
    if (activeOptionsMenu) {
        activeOptionsMenu.remove();
        activeOptionsMenu = null;
    }
    if (activeColorMenu) {
        activeColorMenu.remove();
        activeColorMenu = null;
    }
}
function applySidebarState() {
    browser.storage.local.get("sidebarCollapsed", (data) => {
        const sidebar = document.getElementById("sidebar");
        if (data.sidebarCollapsed) {
            sidebar.classList.add("collapsed");
        } else {
            sidebar.classList.remove("collapsed");
        }
    });
}
applySidebarState();

function deleteTab(id) {
    if (!Array.isArray(id)) {
        id = [id];
    }

    browser.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        id.forEach(tabId => {
            const index = tabs.findIndex(tab => tab.id === tabId);
            if (index !== -1) {
                tabs.splice(index, 1); // Remove the tab at the specified index
                console.log('Tab deleted:', tabId);
            }
        });
        browser.storage.local.set({ savedTabs: tabs }, () => {
            console.log('Updated storage with remaining tabs');
        });
    });
}
function saveTab(tabId) {
    const tabIds = Array.isArray(tabId) ? tabId : [tabId];
    const newTabs = [];

    tabIds.forEach(id => {
        const numericId = parseInt(id.replace('tab-', ''));
        browser.tabs.get(numericId, (tab) => {
            const newTab = {
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl || '',
                id: numericId,
                color: '#FFFFFF'
            };
            newTabs.push(newTab);

            if (newTabs.length === tabIds.length) {
                browser.storage.local.get("savedTabs", (data) => {
                    const existingTabs = data.savedTabs || [];
                    const updatedTabs = [...existingTabs, ...newTabs];
                    browser.storage.local.set({ savedTabs: updatedTabs }, () => {
                        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            let activeTab = tabs[0];
                            
                            // Close the specified tabs
                            browser.tabs.remove(tabIds.map(id => parseInt(id.replace('tab-', ''))), () => {
                                // Optionally, you can ensure the focus remains on the active tab
                                browser.tabs.update(activeTab.id, { active: true });
                            });
                        });
                    });
                });
            }
        });
    });
}
function saveTabNote(id, note) {
    browser.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const index = tabs.findIndex(tab => tab.id === id);

        // Parse the date but do not format it yet
        const { parsedDate, remainingNote } = parseAndSaveDate(note);
        tabs[index].note = remainingNote; // Update the note for the tab

        if (parsedDate) {
            tabs[index].parsedDate = parsedDate.getTime(); // Save the timestamp of the date
        }

        browser.storage.local.set({ savedTabs: tabs }, () => {
            console.log('Tab note saved:', id, remainingNote);
        });
    });
}
function parseAndSaveDate(note) {
    const chrono = new Chrono();
    const parsedDate = chrono.parseDate(note);
    
    // Remove the parsed date from the note
    const remainingNote = parsedDate ? note.replace(chrono.parse(note)[0].text, '').trim() : note;
    
    return { parsedDate, remainingNote };
}
function saveTabTitle(id, newTitle) {
    browser.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const tabIndex = tabs.findIndex(tab => tab.id === id);
        tabs[tabIndex].title = newTitle;
        browser.storage.local.set({ savedTabs: tabs }, () => {
            console.log('Tab title saved:', id, newTitle);
        });
    });
}

function saveColumnState() {
    const columnsContainer = document.getElementById('columns-container');
    const columns = columnsContainer.querySelectorAll('.column');
    const columnState = [];

    columns.forEach(column => {
        const columnId = column.id;
        const tabItems = column.querySelectorAll('.tab-item');
        const tabIds = Array.from(tabItems).map(tabItem => tabItem.id);
        const columnTitle = column.querySelector('.column-title-text').textContent;
        columnState.push({
            id: columnId,
            tabIds: tabIds,
            title: columnTitle,
        });
    });

    browser.storage.local.set({ columnState }, () => {
        console.log('Column state saved:', columnState);
    });
}
function createColumn(title, id) {
    const columnsContainer = document.getElementById("columns-container");
    const column = document.createElement("div");
    column.classList.add("column");
    if(id) column.id = id;
    else column.id = `column-${Date.now()}`;
    column.addEventListener("dragover", handleDragOver);
    column.addEventListener("drop", handleDrop);

    // Create a container for the title and buttons
    const headerContainer = document.createElement("div");
    headerContainer.classList.add("header-container");

    // Add open all button to the column
    const openAllButton = document.createElement("button");
    openAllButton.classList.add("open-all");
    openAllButton.title = "Open All";
    openAllButton.innerHTML = `<img src="../icons/openall.svg" width="24" height="24" class="main-grid-item-icon" />`;
    openAllButton.addEventListener("click", openAllInColumn);

    // Add title input to the column
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.classList.add("column-title");
    titleInput.placeholder = "Enter column title";

    // Add delete button to the column
    const deleteButton = document.createElement("button");
    deleteButton.classList.add("delete-column");
    deleteButton.title = "Delete Column";
    deleteButton.innerHTML = `<img src="../icons/delete-icon.svg" width="24" height="24" class="main-grid-item-icon" />`;
    deleteButton.addEventListener("click", deleteColumn);

    // Create a span to display the title in read mode
    const titleSpan = document.createElement("h2");
    titleSpan.classList.add("column-title-text");

    // If a title is provided, display it in read mode
    if (title) {
        titleSpan.textContent = title;
        titleSpan.style.display = "inline";
        titleInput.style.display = "none";
    }

    // Event listener to switch to read mode
    titleInput.addEventListener("blur", () => {
        if (titleInput.value.trim() !== "") {
            titleSpan.textContent = titleInput.value;
            titleInput.style.display = "none";
            titleSpan.style.display = "inline";
        }
        column.setAttribute("draggable", "true");
        saveColumnState();
    });

    // Event listener to switch to edit mode
    titleSpan.addEventListener("click", () => {
        column.setAttribute("draggable", "false");
        titleInput.value = titleSpan.textContent;
        titleInput.style.display = "inline";
        titleSpan.style.display = "none";
        titleInput.focus();
        const length = titleInput.value.length;
        titleInput.setSelectionRange(length, length);
    });

    // Event listener to save on Enter key press
    titleInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            titleInput.blur();
        }
    });

    // Append open all button, title, and delete button to the header container
    headerContainer.appendChild(openAllButton);
    headerContainer.appendChild(titleInput);
    headerContainer.appendChild(titleSpan);
    headerContainer.appendChild(deleteButton);

    // Append header container to the column
    column.appendChild(headerContainer);
    columnsContainer.appendChild(column);

    // Ensure 'new-column-indicator' remains the last child
    const newColumnIndicator = columnsContainer.querySelector('.new-column-indicator');
    if (newColumnIndicator) {
        columnsContainer.appendChild(newColumnIndicator);
    }
    
    return column;
}
function deleteColumn(event) {
    let column = event;
    if(event instanceof Event){
        column = event.target.closest(".column");
    }
    const tabItems = column.querySelectorAll('.tab-item');
    const tabIds = Array.from(tabItems).map(tabItem => tabItem.id);
    deleteTab(tabIds.map(id => parseInt(id.replace('tab-', ''))));
    column.remove();
    saveColumnState();
}
function openAllInColumn(event) {
    const column = event.target.closest(".column");
    const tabItems = column.querySelectorAll('.tab-item');
    const urls = Array.from(tabItems).map(tabItem => tabItem.dataset.url);

    urls.forEach(url => {
        window.open(url, '_blank');
    });
}

/* Tab Drag and Drop */
function handleDragStart(event) {
    event.stopPropagation();
    closeAllMenus();
    const tabItem = event.target.closest('.tab-item');
    if(!tabItem) return;
    event.dataTransfer.setData("text/plain", tabItem.id);
    event.dataTransfer.setDragImage(tabItem, 0, 0);
    dropType = "list-item";
    tabItem.classList.add("dragging");
}
function handleDragEnd(event) {
    event.target.closest('.tab-item').classList.remove("dragging");
    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }
}
function calculateDropPosition(event, tabItems) {
    let dropPosition = tabItems.length;
    for (let i = 0; i < tabItems.length; i++) {
        const tabRect = tabItems[i].getBoundingClientRect();
        if (event.clientY < tabRect.top + tabRect.height / 2) {
            dropPosition = i;
            break;
        }
    }
    return dropPosition;
}
function handleDragLeave(event) {
    if (!deletionArea.contains(event.relatedTarget)) {
        deletionArea.classList.remove('deletion-area-active');
    }
    if (!newColumnIndicator.contains(event.relatedTarget)) {
        newColumnIndicator.classList.remove('new-column-indicator-active');
    }
}
function handleDragOver(event) {
    event.preventDefault();

    const scrollThreshold = 100;
    const scrollSpeed = 36;
    if (event.clientX < scrollThreshold) {
        window.scrollBy({ left: -scrollSpeed, behavior: 'smooth' });
    } else if (window.innerWidth - event.clientX < scrollThreshold) {
        window.scrollBy({ left: scrollSpeed, behavior: 'smooth' });
    }

    deletionArea.style.display = 'flex';
    if(event.target === deletionArea) {
        deletionArea.classList.add('deletion-area-active');
        dropIndicator.style.display = 'none';
        event.dataTransfer.dropEffect = 'move';
        return;
    }
    else if(event.target === newColumnIndicator) {
        newColumnIndicator.classList.add('new-column-indicator-active');
        dropIndicator.style.display = 'none';
        event.dataTransfer.dropEffect = 'move';
        return;
    }
    const column = event.target.closest('.column') || event.target.closest('#open-tabs-list');
    const columnsContainer = document.getElementById('columns-container');
    
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        document.body.appendChild(dropIndicator);
    }
    
    if (dropType === "list-item" && column) {
        // Handle list item drag over
        newColumnIndicator.style.display = 'flex';
        const rect = column.getBoundingClientRect();
        const listItems = Array.from(column.querySelectorAll('.tab-item'));
        const dropPosition = calculateDropPosition(event, listItems);

        dropIndicator.style.width = `${rect.width}px`;
        dropIndicator.style.height = '2px';
        dropIndicator.style.left = `${rect.left + window.scrollX}px`;

        if (dropPosition === listItems.length) {
            const lastItem = listItems[listItems.length - 1];
            dropIndicator.style.top = lastItem ? `${lastItem.getBoundingClientRect().bottom}px` : `${rect.top}px`;
        } else {
            dropIndicator.style.top = `${listItems[dropPosition].getBoundingClientRect().top}px`;
        }
    } 
    else if (dropType === "column" && columnsContainer) {
        // Handle column drag over
        const rect = columnsContainer.getBoundingClientRect();
        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);

        dropIndicator.style.width = '2px';
        dropIndicator.style.height = `${rect.height}px`;
        dropIndicator.style.top = `${rect.top}px`;

        if (dropPosition === columns.length) {
            const lastColumn = columns[columns.length - 1];
            dropIndicator.style.left = lastColumn ? `${lastColumn.getBoundingClientRect().right + window.scrollX}px` : `${rect.left + window.scrollX}px`;
        } else {
            const targetColumn = columns[dropPosition];
            const targetRect = targetColumn.getBoundingClientRect();
            dropIndicator.style.left = `${targetRect.left + window.scrollX}px`;
        }
        newColumnIndicator.style.display = 'none';
    } 
    dropIndicator.style.display = 'block';
    event.dataTransfer.dropEffect = 'move';
}
function handleDrop(event) {
    event.preventDefault();
    
    // Check if it's a column drop
    const columnsContainer = document.getElementById('columns-container');
    const newColumnIndicator = columnsContainer.querySelector('.new-column-indicator');
    const columnDropData = event.dataTransfer.getData("text/plain");
    const droppedColumn = document.getElementById(columnDropData);

    if (droppedColumn && droppedColumn.classList.contains('column')) {
        if(event.target === deletionArea) {
            deleteColumn(droppedColumn);
            deletionArea.style.display = 'none';
            deletionArea.classList.remove('deletion-area-active');
            if (newColumnIndicator) newColumnIndicator.style.display = 'none';
            return;
        }
        deletionArea.style.display = 'none';
        deletionArea.classList.remove('deletion-area-active');

        // Handle column drop
        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);

        if (dropPosition === columns.length) {
            columnsContainer.appendChild(droppedColumn);
        } else {
            columnsContainer.insertBefore(droppedColumn, columns[dropPosition]);
        }
        // Ensure 'new-column-indicator' remains the last child
        if (newColumnIndicator) {
            columnsContainer.appendChild(newColumnIndicator);
        }

        if (dropIndicator) dropIndicator.style.display = 'none';
        if (newColumnIndicator) newColumnIndicator.style.display = 'none';

        saveColumnState();
        return; // Exit since we handled a column drop
    }
    deletionArea.style.display = 'none';
    deletionArea.classList.remove('deletion-area-active');

    // Continue with tab drop logic
    const column = event.target.closest('.column') || event.target.closest('#open-tabs-list');
    if (!column && event.target !== deletionArea && event.target !== newColumnIndicator) {
        if (dropIndicator) dropIndicator.style.display = 'none';
        if (newColumnIndicator) newColumnIndicator.style.display = 'none';
        return;
    }

    let tabId = event.dataTransfer.getData("text/plain");
    const tabItem = document.getElementById(tabId);
    if (!tabItem || !tabItem.classList.contains('tab-item')) return;

    // Check if the dragged item is selected and if there are multiple selected items
    const selectedItems = document.querySelectorAll('.selected');
    const isDraggedItemSelected = tabItem.classList.contains('selected');
    const itemsToProcess = isDraggedItemSelected && selectedItems.length > 1 ? selectedItems : [tabItem];

    const tabIdsToDelete = [];
    const itemIdsToSave = [];
    const itemsToInsert = [];

    if(event.target === deletionArea) {
        itemsToProcess.forEach(item => {
            const itemId = item.id;
            if (itemId.startsWith('tab-')) {
                tabIdsToDelete.push(parseInt(itemId.replace('tab-', '')));
            }
            else if (itemId.startsWith('opentab')) {
                browser.tabs.remove(parseInt(itemId.replace('opentab-', '')), () => {
                    console.log('Tab closed:', itemId);
                });
            }
            item.parentNode.removeChild(item);
        });
        deleteTab(tabIdsToDelete);
        saveColumnState();
        return;
    }
    else if(event.target === newColumnIndicator) {
        newColumnIndicator.style.display = 'none';
        const newColumn = createColumn("New Column");
        itemsToProcess.forEach(item => {
            if(item.id.startsWith('opentab-')) {
                itemIdsToSave.push(item.id.replace('opentab-', ''));
            }
            newColumn.appendChild(item);
        });
        if(itemIdsToSave.length > 0) {
            saveTab(itemIdsToSave);
        }
        saveColumnState();
        displaySavedTabs(tabs_in_storage);
        return;
    }

    let tabItems = Array.from(column.querySelectorAll('.tab-item'));
    let dropPosition = calculateDropPosition(event, tabItems);

    itemsToProcess.forEach(item => {
        tabItems = Array.from(column.querySelectorAll('.tab-item'));
        let itemId = item.id;

        if (column.id !== 'open-tabs-list' && itemId.startsWith('opentab')) {
            itemId = itemId.replace('opentab-', 'tab-');
            item.id = itemId;
            itemIdsToSave.push(itemId);
        }

        if (column.id === 'open-tabs-list' && itemId.startsWith('tab')) {
            window.open(item.dataset.url, '_blank');
            tabIdsToDelete.push(parseInt(itemId.replace('tab-', '')));
        }

        itemsToInsert.push({ item, dropPosition });

        if (column.id === 'open-tabs-list') {
            browser.tabs.move(parseInt(itemId.split('-')[1]), { index: dropPosition }, () => {
                console.log('Tab moved:', itemId, 'to index:', dropPosition);
            });
        }
    });

    if (itemIdsToSave.length > 0) {
        saveTab(itemIdsToSave);
    }
    if (tabIdsToDelete.length > 0) {
        deleteTab(tabIdsToDelete);
    }

    // Insert all items into the column at once
    itemsToInsert.forEach(({ item, dropPosition }) => {
        if (dropPosition === tabItems.length) {
            column.appendChild(item);
        } else {
            column.insertBefore(item, tabItems[dropPosition]);
        }
    });

    if (dropIndicator) dropIndicator.style.display = 'none';
    if (newColumnIndicator) newColumnIndicator.style.display = 'none';

    saveColumnState();
}

/* Column Drag and Drop */
function handleColumnDragStart(event) {
    closeAllMenus();
    if (event.target.closest('.tab-item')) {
        event.preventDefault();
        return;
    }
    const column = event.target.closest('.column');
    if(!column) return;
    event.dataTransfer.setData("text/plain", column.id);
    event.dataTransfer.setDragImage(column, 0, 0);
    dropType = "column";
    column.classList.add("dragging");
}
function handleColumnDragEnd(event) {
    event.target.closest('.column').classList.remove("dragging");
    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }
}
function calculateColumnDropPosition(event, columns) {
    let dropPosition = columns.length;
    for (let i = 0; i < columns.length; i++) {
        const columnRect = columns[i].getBoundingClientRect();
        if (event.clientX < columnRect.left + columnRect.width / 2) {
            dropPosition = i;
            break;
        }
    }
    return dropPosition;
}

/* Tab Display */
function displaySavedTabs(tabs) {
    const columnsContainer = document.getElementById("columns-container");
    columnsContainer.addEventListener('dragover', handleDragOver);
    columnsContainer.addEventListener('drop', handleDrop);
    columnsContainer.innerHTML = "";

    browser.storage.local.get('columnState', (result) => {
        const columnState = result.columnState || [];
        if(columnState.length === 0) {
            createColumn("New Column");
        } else {
            console.log(columnState);
            columnState.forEach(columnData => {
                const column = createColumn(columnData.title, columnData.id);
                column.setAttribute('draggable', 'true');
                column.addEventListener('dragstart', handleColumnDragStart);
                column.addEventListener('dragend', handleColumnDragEnd);
                columnData.tabIds.forEach(tabId => {
                    const tab = tabs.find(t => `${t.id}` === tabId.split('-')[1]);
                    if(tab){
                        const li = document.createElement("li");
                        li.style.userSelect = "none";
                        li.id = `tab-${tab.id}`;
                        li.style.backgroundColor = tab.color; 
                        li.classList.add("tab-item");
                        li.dataset.url = tab.url;
                        
                        li.draggable = true;
                        li.addEventListener("dragstart", handleDragStart);
                        li.addEventListener("dragend", handleDragEnd);
                
                        // Calculate the formatted date when displaying
                        let formattedDate = '';
                        let diffDays = -1;
                        if (tab.parsedDate) {
                            const parsedDate = new Date(tab.parsedDate);
                            diffDays = getToday(parsedDate);
                            if (diffDays === 0) {
                                formattedDate = 'Today';
                            } else if (diffDays === 1) {
                                formattedDate = 'Tomorrow';
                            } else if (diffDays >= 2 && diffDays <= 7) {
                                const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                formattedDate = weekdayNames[parsedDate.getDay()];
                            } else {
                                const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                                const day = String(parsedDate.getDate()).padStart(2, '0');
                                const year = String(parsedDate.getFullYear()).slice(-2);
                                formattedDate = `${month}/${day}/${year}`;
                            }
                        }
                        li.innerHTML += `
                            <div class="tab-info-container">
                                <div class="tab-info-left">
                                    <img src="${tab.favIconUrl}" width="24" height="24">
                                </div>
                                <div class="tab-info-right">
                                    <span class="tab-title" data-url="${tab.url}" id="title-display-${tab.id}">${tab.title}</span>
                                    <input type="text" class="hidden" id="title-input-${tab.id}" value="${tab.title}">
                                    <div class="note-display fixed-width" id="note-display-${tab.id}">${tab.note || ''}</div>
                                    <textarea class="tab-note hidden" id="note-input-${tab.id}" rows="1">${tab.note || ''}</textarea>
                                    <div class="date-display ${formattedDate ? '' : 'hidden'}" id="date-display-${tab.id}">${formattedDate || ''}</div>
                                </div>
                                <div class="tab-actions">
                                    <button class="more-options" data-index="${tab.id}">
                                        <img src="../icons/morevertical.svg" class="main-grid-item-icon" />
                                    </button>
                                </div>
                            </div>
                        `;

                        const dateDisplay = li.querySelector(`#date-display-${tab.id}`);
                        if (diffDays < 0) {
                            dateDisplay.style.color = '#e63c30';
                        } else if (formattedDate === 'Today') {
                            dateDisplay.style.color = 'green';
                        } else if (formattedDate === 'Tomorrow') {
                            dateDisplay.style.color = "#C76E00";
                        } else {
                            dateDisplay.style.color = 'grey';
                        }
                        
                        column.appendChild(li);

                        const favicon = li.querySelector(".tab-info-left");
                        favicon.addEventListener("click", (event) => {
                            event.stopPropagation();
                            const selectedItems = document.querySelectorAll('.selected');
                            const allItems = Array.from(document.querySelectorAll('li'));
                            const currentIndex = allItems.indexOf(li);
                        
                            if (event.ctrlKey || event.metaKey) {
                                // Toggle selection with Ctrl/Cmd click
                                li.classList.toggle('selected');
                            } else if (event.shiftKey && lastSelectedIndex !== null) {
                                // Select range with Shift click
                                const start = Math.min(lastSelectedIndex, currentIndex);
                                const end = Math.max(lastSelectedIndex, currentIndex);
                                for (let i = start; i <= end; i++) {
                                    allItems[i].classList.add('selected');
                                }
                            } else {
                                // Single selection
                                if (selectedItems.length === 1 && selectedItems[0] === li) {
                                    // Clear selection if the only selected item is clicked again
                                    li.classList.remove('selected');
                                } else {
                                    selectedItems.forEach(item => item.classList.remove('selected'));
                                    li.classList.add('selected');
                                }
                            }
                        
                            lastSelectedIndex = currentIndex;
                        });

                        const tabLink = li.querySelector('.tab-title');
                        tabLink.addEventListener('click', () => {
                            window.location.href = tabLink.dataset.url;
                        });
            
                        // Add event listener to the document to detect clicks outside of the li elements
                        document.addEventListener('click', (event) => {
                            const allItems = Array.from(document.querySelectorAll('li'));
                            const isClickInside = allItems.some(item => item.contains(event.target));
            
                            if (!isClickInside) {
                                allItems.forEach(item => item.classList.remove('selected'));
                            }
                        });
                        
                        const moreOptionsButton = li.querySelector('.more-options');
                        moreOptionsButton.addEventListener('click', (event) => {
                            event.stopPropagation();

                            // Close all menus if clicking on the same button
                            if (activeOptionsMenu && activeOptionsMenu.dataset.tabId === tab.id.toString()) {
                                closeAllMenus();
                                return;
                            }

                            closeAllMenus();

                            const optionsMenu = document.createElement('div');
                            optionsMenu.className = 'options-menu';
                            optionsMenu.dataset.tabId = tab.id.toString();
                            // Determine whether to show "Add Note" or "Edit Note" based on the note content
                            const noteButtonText = tab.note && tab.note.trim() !== '' ? 'Edit Note' : 'Add Note';
                            optionsMenu.innerHTML = `
                                <button class="menu-option rename-tab" data-index="${tab.id}">Rename</button>
                                <button class="menu-option add-note" data-index="${tab.id}">${noteButtonText}</button>
                                <button class="menu-option color-tab" data-index="${tab.id}">Color</button>
                                <button class="menu-option delete-tab" data-index="${tab.id}">Delete</button>
                            `;
                        
                            document.body.appendChild(optionsMenu);
                        
                            const rect = moreOptionsButton.getBoundingClientRect();
                            optionsMenu.style.top = `${rect.bottom + window.scrollY}px`;
                            optionsMenu.style.left = `${rect.left + window.scrollX}px`;
                            optionsMenu.style.display = 'flex';
                            activeOptionsMenu = optionsMenu;
                        
                            let colorMenu = null;
                        
                            const handleClickOutside = (e) => {
                                if (!optionsMenu.contains(e.target) && e.target !== moreOptionsButton) {
                                    closeAllMenus();
                                    document.removeEventListener('click', handleClickOutside);
                                }
                            };
                        
                            document.addEventListener('click', handleClickOutside);
                        
                            // Color Tab option
                            const colorTabOption = optionsMenu.querySelector('.color-tab');
                            colorTabOption.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const colorOptions = ['#FFFFFF', '#f7c2d6', '#f1ffc4', '#c6e2e9', '#e9c8fa'];
                                colorMenu = document.createElement('div');
                                colorMenu.classList.add('color-menu');
                            
                                colorOptions.forEach(color => {
                                    const colorOption = document.createElement('div');
                                    colorOption.classList.add('color-option');
                                    colorOption.style.backgroundColor = color;
                                    colorOption.addEventListener('click', () => {
                                        tab.color = color;
                                        li.style.backgroundColor = color;
                                        browser.storage.local.set({ savedTabs: tabs }, () => {
                                            console.log('Tab color saved:', tab.id, tab.color);
                                        });
                                        closeAllMenus();
                                        document.removeEventListener('click', handleClickOutside);
                                    });
                                    colorMenu.appendChild(colorOption);
                                });
                            
                                document.body.appendChild(colorMenu);
                                const rect = colorTabOption.getBoundingClientRect();
                                colorMenu.style.top = `${rect.top + window.scrollY}px`;
                                colorMenu.style.left = `${rect.right + window.scrollX}px`;
                                activeColorMenu = colorMenu;
                            });
                        
                            // Rename Tab option
                            const renameTabOption = optionsMenu.querySelector('.rename-tab');
                            renameTabOption.addEventListener('click', () => {
                                li.removeEventListener('dragstart', handleDragStart);
                                const titleDisplay = li.querySelector(`#title-display-${tab.id}`);
                                const titleInput = li.querySelector(`#title-input-${tab.id}`);
                                
                                titleInput.classList.remove("hidden");
                                titleDisplay.classList.add("hidden");
                                titleInput.focus();
                                
                                const length = titleInput.value.length;
                                titleInput.setSelectionRange(length, length);

                                titleInput.addEventListener('keydown', function handleKeydown(event) {
                                    if (event.key === 'Enter') {
                                        titleDisplay.textContent = titleInput.value;
                                        titleInput.classList.add("hidden");
                                        titleDisplay.classList.remove("hidden");
                                        titleInput.removeEventListener('keydown', handleKeydown);
                                    }
                                });
                                
                                closeAllMenus();
                            });

                            const titleDisplay = li.querySelector(`#title-display-${tab.id}`);
                            const titleInput = li.querySelector(`#title-input-${tab.id}`);

                            titleInput.addEventListener("focus", function () {
                                const parentTab = li.closest('.tab-item');
                                const parentColumn = li.closest('.column');
                                if (parentTab) parentTab.setAttribute("draggable", "false");
                                if (parentColumn) parentColumn.setAttribute("draggable", "false");
                            });

                            titleInput.addEventListener("blur", function () {
                                const newTitle = titleInput.value;
                                saveTabTitle(tab.id, newTitle);
                                titleDisplay.textContent = newTitle;
                                titleInput.classList.add("hidden");
                                titleDisplay.classList.remove("hidden");
                                li.addEventListener('dragstart', handleDragStart);
                                const parentTab = li.closest('.tab-item');
                                const parentColumn = li.closest('.column');
                                if (parentTab) parentTab.setAttribute("draggable", "true");
                                if (parentColumn) parentColumn.setAttribute("draggable", "true");
                            });

                            // Add Note option
                            const editTabOption = optionsMenu.querySelector('.add-note');
                            editTabOption.addEventListener('click', () => {
                                li.removeEventListener('dragstart', handleDragStart);
                                const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
                                const noteInput = li.querySelector(`#note-input-${tab.id}`);
                                
                                noteInput.classList.remove("hidden");
                                noteDisplay.classList.add("hidden");
                                noteInput.focus();
                                
                                const length = noteInput.value.length;
                                noteInput.setSelectionRange(length, length);
                                
                                closeAllMenus();
                            });
                        
                            // Delete Tab option
                            const deleteTabOption = optionsMenu.querySelector('.delete-tab');
                            deleteTabOption.addEventListener('click', () => {
                                deleteTab(tab.id);
                                closeAllMenus();
                            });
                        });
                        
                        const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
                        const noteInput = li.querySelector(`#note-input-${tab.id}`);
                        
                        noteDisplay.addEventListener("click", function () {
                            li.removeEventListener('dragstart', handleDragStart);
                            if (noteInput.classList.contains("hidden")) {
                                noteInput.classList.remove("hidden");
                                noteDisplay.classList.add("hidden");
                                noteInput.focus();
                                
                                const length = noteInput.value.length;
                                noteInput.setSelectionRange(length, length);
                            }
                        });

                        noteInput.addEventListener("focus", function () {
                            const parentTab = li.closest('.tab-item');
                            const parentColumn = li.closest('.column');
                            if (parentTab) parentTab.setAttribute("draggable", "false");
                            if (parentColumn) parentColumn.setAttribute("draggable", "false");
                        });
                        
                        noteInput.addEventListener("blur", function () {
                            const note = noteInput.value;
                            saveTabNote(tab.id, note);
                            noteDisplay.textContent = note || '';
                            noteInput.classList.add("hidden");
                            noteDisplay.classList.remove("hidden");
                            li.addEventListener('dragstart', handleDragStart);
                            const parentTab = li.closest('.tab-item');
                            const parentColumn = li.closest('.column');
                            if (parentTab) parentTab.setAttribute("draggable", "true");
                            if (parentColumn) parentColumn.setAttribute("draggable", "true");
                        });

                        noteInput.addEventListener("keydown", function (event) {
                            if (event.key === "Enter") {
                                noteInput.blur();
                            }
                        });
                    }
                });
            });
        }
        newColumnIndicator = document.createElement('div');
        newColumnIndicator.classList.add('new-column-indicator');
        const img = document.createElement('img');
        img.src = '../icons/newcolumn.svg';
        img.classList.add('new-column-icon');
        newColumnIndicator.appendChild(img);
        newColumnIndicator.addEventListener('dragleave', handleDragLeave);
        columnsContainer.appendChild(newColumnIndicator);
    });
}
function fetchOpenTabs() {
    browser.tabs.query({ currentWindow: true }, (tabs) => {
        tabs = tabs.filter(tab => 
            !tab.url.startsWith("chrome://") && 
            !tab.url.startsWith("edge://") &&
            !tab.url.startsWith("opera://") &&
            !tab.url.startsWith("vivaldi://") &&
            !tab.url.startsWith("brave://") &&
            !tab.url.startsWith("about:") && 
            !tab.url.startsWith("moz-extension://") &&
            !tab.url.startsWith("file://")
        );
        const openTabsList = document.getElementById("open-tabs-list");
        openTabsList.innerHTML = ""; // Clear the list before repopulating

        tabs.forEach((tab, index) => {
            const li = document.createElement("li");
            li.style.userSelect = "none";
            li.draggable = true;
            li.addEventListener("dragstart", handleDragStart);
            li.addEventListener("dragend", handleDragEnd);
            li.id = `opentab-${tab.id}`;
            li.classList.add("tab-item");

            li.innerHTML += `
                <div class="tab-info-container">
                    <div class="tab-info-left">
                        <img src="${tab.favIconUrl}" width="24" height="24">
                    </div>
                    <div class="tab-info-right">
                        <span class="tab-title">${tab.title}</span>
                    </div>
                    <div class="tab-actions">
                        <img src="../icons/close.svg" alt="Close" class="close-button">
                    </div>
                </div>
            `;
            
            const closeButton = li.querySelector(".close-button");
            closeButton.addEventListener("click", () => {
                browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    let activeTab = tabs[0];
                    
                    // Close the specified tab
                    browser.tabs.remove(tab.id, () => {
                        // Optionally, you can ensure the focus remains on the active tab
                        browser.tabs.update(activeTab.id, { active: true });
                    });
                });
            });

            li.setAttribute("data-tab-id", tab.id);
            li.setAttribute("data-index", index);

            const favicon = li.querySelector(".tab-info-left");
            favicon.addEventListener("click", (event) => {
                event.stopPropagation();
                const selectedItems = document.querySelectorAll('.selected');
                const allItems = Array.from(document.querySelectorAll('li'));
                const currentIndex = allItems.indexOf(li);
            
                if (event.ctrlKey || event.metaKey) {
                    // Toggle selection with Ctrl/Cmd click
                    li.classList.toggle('selected');
                } else if (event.shiftKey && lastSelectedIndex !== null) {
                    // Select range with Shift click
                    const start = Math.min(lastSelectedIndex, currentIndex);
                    const end = Math.max(lastSelectedIndex, currentIndex);
                    for (let i = start; i <= end; i++) {
                        allItems[i].classList.add('selected');
                    }
                } else {
                    // Single selection
                    if (selectedItems.length === 1 && selectedItems[0] === li) {
                        // Clear selection if the only selected item is clicked again
                        li.classList.remove('selected');
                    } else {
                        selectedItems.forEach(item => item.classList.remove('selected'));
                        li.classList.add('selected');
                    }
                }
            
                lastSelectedIndex = currentIndex;
            });

            // Add event listener to the document to detect clicks outside of the li elements
            document.addEventListener('click', (event) => {
                const allItems = Array.from(document.querySelectorAll('li'));
                const isClickInside = allItems.some(item => item.contains(event.target));

                if (!isClickInside) {
                    allItems.forEach(item => item.classList.remove('selected'));
                }
            });

            // Add click event listener to switch to the tab
            const tabTitle = li.querySelector(".tab-title");
            tabTitle.addEventListener("click", () => {
                const allItems = document.querySelectorAll('li');
                allItems.forEach(item => item.classList.remove('selected'));

                browser.tabs.update(tab.id, { active: true });
            });

            openTabsList.appendChild(li);
        });
        openTabsList.addEventListener('dragover', handleDragOver);
        openTabsList.addEventListener('drop', handleDrop);
    });
}

browser.tabs.onUpdated.addListener(fetchOpenTabs);
browser.tabs.onRemoved.addListener(fetchOpenTabs);
browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.savedTabs) {
        tabs_in_storage = changes.savedTabs.newValue.filter(tab => !('temp' in tab));
        browser.storage.local.get('columnState', (data) => {
            if(data.columnState.length > 0){
                displaySavedTabs(tabs_in_storage);
            }
        });
    }
});
browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.bgTabs) {
        const oldBgTabs = changes.bgTabs.oldValue || [];
        const newBgTabs = changes.bgTabs.newValue || [];

        // Check if bgTabs has actually changed
        if (JSON.stringify(oldBgTabs) !== JSON.stringify(newBgTabs)) {
            browser.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
                let columnState = data.columnState || [];
                const bgTabs = data.bgTabs || [];
                let savedTabs = data.savedTabs || [];
                const tabIds = bgTabs.map(tab => tab.id);

                if (columnState.length === 0) {
                    columnState.push({ id: "defaultColumn", tabIds: [], title: "New Column" });
                }
                const firstColumn = columnState[0];
                const formattedIds = tabIds.map(id => `tab-${id}`);
                firstColumn.tabIds = firstColumn.tabIds.concat(formattedIds);
                savedTabs = savedTabs.concat(bgTabs);

                browser.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
                    console.log("Migrated bgTabs");
                });
            });
        }
    }
});

fetchOpenTabs();
browser.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
    let columnState = data.columnState || [];
    const bgTabs = data.bgTabs || [];
    let savedTabs = data.savedTabs || [];
    const tabIds = bgTabs.map(tab => tab.id);

    if (columnState.length === 0) {
        columnState.push({ id: "defaultColumn", tabIds: [], title: "New Column" });
    }
    const firstColumn = columnState[0];
    const formattedIds = tabIds.map(id => `tab-${id}`);
    firstColumn.tabIds = firstColumn.tabIds.concat(formattedIds);
    savedTabs = savedTabs.concat(bgTabs);
    savedTabs = savedTabs.filter(tab => !('temp' in tab));
    savedTabs.push({"temp": Date.now()});

    browser.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
        console.log("Migrated bgTabs");
    });
});
displaySavedTabs(tabs_in_storage);
