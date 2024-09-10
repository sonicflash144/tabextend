document.getElementById("create-column").addEventListener("click", () => {
    createColumn("New Column");
    saveColumnState();
});
document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);
let dropIndicator = null;
let lastSelectedIndex = null;
let activeOptionsMenu = null;
let activeColorMenu = null;

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
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const isCollapsed = sidebar.classList.toggle("collapsed");
    chrome.storage.local.set({ sidebarCollapsed: isCollapsed });
}
function applySidebarState() {
    chrome.storage.local.get("sidebarCollapsed", (data) => {
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
    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const index = tabs.findIndex(tab => tab.id === id);
        if (index !== -1) {
            tabs.splice(index, 1); // Remove the tab at the specified index
            chrome.storage.local.set({ savedTabs: tabs }), () => {
                console.log('Tab deleted:', id);
            }
        }
    });
}
function saveTabNote(id, note) {
    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const index = tabs.findIndex(tab => tab.id === id);
        tabs[index].note = note; // Update the note for the tab

        chrome.storage.local.set({ savedTabs: tabs }, () => {
            console.log('Tab note saved:', id, note);
        });
    });
}
function saveTabTitle(id, newTitle) {
    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const tabIndex = tabs.findIndex(tab => tab.id === id);
        tabs[tabIndex].title = newTitle;
        chrome.storage.local.set({ savedTabs: tabs }, () => {
            console.log('Tab title saved:', id, newTitle);
        });
    });
}

function saveColumnState() {
    const columns = document.querySelectorAll('.column');
    const columnState = {};

    columns.forEach(column => {
        const columnId = column.id;
        const tabItems = column.querySelectorAll('.tab-item');
        const tabIds = Array.from(tabItems).map(tabItem => tabItem.id);
        const columnTitle = column.querySelector('.column-title-text').textContent;
        columnState[columnId] = {
            tabIds: tabIds,
            title: columnTitle,
        };
    });

    chrome.storage.local.set({ columnState }, () => {
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

    // Create a container for the title and delete button
    const headerContainer = document.createElement("div");
    headerContainer.classList.add("header-container");

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
        saveColumnState();
    });

    // Event listener to switch to edit mode
    titleSpan.addEventListener("click", () => {
        titleInput.style.display = "inline";
        titleSpan.style.display = "none";
        titleInput.focus();
    });

    // Append title and delete button to the header container
    headerContainer.appendChild(titleInput);
    headerContainer.appendChild(titleSpan);
    headerContainer.appendChild(deleteButton);

    // Append header container to the column
    column.appendChild(headerContainer);
    columnsContainer.appendChild(column);
    return column;
}
function deleteColumn(event) {
    const column = event.target.closest(".column");
    column.remove();
    saveColumnState();
}

function saveTab(tabId) {
    const tabIds = Array.isArray(tabId) ? tabId : [tabId];
    const newTabs = [];

    tabIds.forEach(id => {
        const numericId = parseInt(id.replace('tab-', ''));
        chrome.tabs.get(numericId, (tab) => {
            const newTab = {
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl || '',
                id: numericId,
                color: '#FFFFFF'
            };
            newTabs.push(newTab);

            if (newTabs.length === tabIds.length) {
                chrome.storage.local.get("savedTabs", (data) => {
                    const existingTabs = data.savedTabs || [];
                    const updatedTabs = [...existingTabs, ...newTabs];
                    chrome.storage.local.set({ savedTabs: updatedTabs }, () => {
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            let activeTab = tabs[0];
                            
                            // Close the specified tabs
                            chrome.tabs.remove(tabIds.map(id => parseInt(id.replace('tab-', ''))), () => {
                                // Optionally, you can ensure the focus remains on the active tab
                                chrome.tabs.update(activeTab.id, { active: true });
                            });
                        });
                    });
                });
            }
        });
    });
}
function handleDragStart(event) {
    if (event.target.closest('.drag-handle')) {
        const tabItem = event.target.closest('.tab-item');
        event.dataTransfer.setData("text/plain", tabItem.id);
        event.dataTransfer.setDragImage(tabItem, 0, 0);
        tabItem.classList.add("dragging");
    } else {
        event.preventDefault();
    }
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
function handleDragOver(event) {
    event.preventDefault();
    const column = event.target.closest('.column') || event.target.closest('#open-tabs-list');
    if (!column) return;

    const rect = column.getBoundingClientRect();
    const tabItems = Array.from(column.querySelectorAll('.tab-item'));

    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        document.body.appendChild(dropIndicator);
    }

    dropIndicator.style.width = `${rect.width}px`;
    dropIndicator.style.left = `${rect.left}px`;

    const dropPosition = calculateDropPosition(event, tabItems);

    if (dropPosition === tabItems.length) {
        if (tabItems.length > 0) {
            const lastTabRect = tabItems[tabItems.length - 1].getBoundingClientRect();
            dropIndicator.style.top = `${lastTabRect.bottom}px`;
        } else {
            dropIndicator.style.top = `${rect.bottom}px`;
        }
    } else {
        dropIndicator.style.top = `${tabItems[dropPosition].getBoundingClientRect().top}px`;
    }

    dropIndicator.style.display = 'block';
    event.dataTransfer.dropEffect = 'move';
}
function handleDrop(event) {
    event.preventDefault();
    const column = event.target.closest('.column') || event.target.closest('#open-tabs-list');
    if (!column) return;

    let tabId = event.dataTransfer.getData("text/plain");
    const tabItem = document.getElementById(tabId);

    // Check if the dragged item is selected and if there are multiple selected items
    const selectedItems = document.querySelectorAll('.selected');
    const isDraggedItemSelected = tabItem.classList.contains('selected');
    const itemsToProcess = isDraggedItemSelected && selectedItems.length > 1 ? selectedItems : [tabItem];
    let tabItems = Array.from(column.querySelectorAll('.tab-item'));
    let dropPosition = calculateDropPosition(event, tabItems);
    
    const itemIdsToSave = [];
    const itemsToInsert = [];
    
    itemsToProcess.forEach(item => {
        tabItems = Array.from(column.querySelectorAll('.tab-item'));
        let itemId = item.id;
    
        if (column.id !== 'open-tabs-list' && itemId.startsWith('opentab')) {
            itemId = itemId.replace('opentab-', 'tab-');
            item.id = itemId;
            itemIdsToSave.push(itemId);
        }
    
        if (column.id === 'open-tabs-list' && itemId.startsWith('tab')) {
            window.open(item.querySelector('a').href, '_blank');
            deleteTab(parseInt(itemId.replace('tab-', '')));
        }
    
        itemsToInsert.push({ item, dropPosition });
    
        if (column.id === 'open-tabs-list') {
            chrome.tabs.move(parseInt(itemId.split('-')[1]), { index: dropPosition }, () => {
                console.log('Tab moved:', itemId, 'to index:', dropPosition);
            });
        }
        dropPosition++;
    });
    
    // Save all tabs at once
    if (itemIdsToSave.length > 0) {
        saveTab(itemIdsToSave);
    }
    
    // Insert all items into the column at once
    itemsToInsert.forEach(({ item, dropPosition }) => {
        if (dropPosition === tabItems.length) {
            column.appendChild(item);
        } else {
            column.insertBefore(item, tabItems[dropPosition]);
        }
    });

    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }

    saveColumnState();
}
function displaySavedTabs(tabs) {
    const columnsContainer = document.getElementById("columns-container");
    columnsContainer.innerHTML = "";

    chrome.storage.local.get('columnState', (result) => {
        const columnState = result.columnState || {};
        if(Object.keys(columnState).length === 0) {
            createColumn("New Column");
        } else {
            console.log(columnState);
            for(const columnId in columnState){
                const column = createColumn(columnState[columnId].title, columnId);
                columnState[columnId].tabIds.forEach(tabId => {
                    const tab = tabs.find(t => `${t.id}` === tabId.split('-')[1]);
                    if(tab){
                        const li = document.createElement("li");
                        li.style.userSelect = "none";
                        li.id = `tab-${tab.id}`;
                        li.style.backgroundColor = tab.color; 
                        li.classList.add("tab-item");
                
                        const dragHandle = document.createElement("div");
                        dragHandle.classList.add("drag-handle");
                        dragHandle.innerHTML = `<img src="../icons/drag.svg" width="24" height="24" class="main-grid-item-icon" />`;
                        
                        li.draggable = true;
                        li.addEventListener("dragstart", handleDragStart);
                        li.addEventListener("dragend", handleDragEnd);
                
                        li.appendChild(dragHandle);
                
                        li.innerHTML += `
                            <div class="tab-info">
                                <a href="${tab.url}" target="_self">
                                    <img src="${tab.favIconUrl}" width="16" height="16"> 
                                    <span class="tab-title-display" id="title-display-${tab.id}">${tab.title}</span>
                                    <input type="text" class="tab-title-input hidden" id="title-input-${tab.id}" value="${tab.title}">
                                </a>
                                <div class="note-display fixed-width" id="note-display-${tab.id}">${tab.note || ''}</div>
                                <textarea class="tab-note hidden" id="note-input-${tab.id}" rows="1">${tab.note || ''}</textarea>
                            </div>
                            <div class="tab-actions">
                                <button class="more-options" data-index="${tab.id}">
                                    <img src="../icons/morevertical.svg" width="24" height="24" class="main-grid-item-icon" />
                                </button>
                            </div>
                        `;
                        
                        column.appendChild(li);
                        
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
                            optionsMenu.innerHTML = `
                                <button class="menu-option rename-tab" data-index="${tab.id}">Rename</button>
                                <button class="menu-option add-note" data-index="${tab.id}">Add Note</button>
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
                                        chrome.storage.local.set({ savedTabs: tabs }, () => {
                                            console.log('Tab color saved:', tab.id, tab.color);
                                        });
                                        colorMenu.remove();
                                        optionsMenu.remove();
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
                                const titleDisplay = li.querySelector(`#title-display-${tab.id}`);
                                const titleInput = li.querySelector(`#title-input-${tab.id}`);
                                
                                titleInput.classList.remove("hidden");
                                titleDisplay.classList.add("hidden");
                                titleInput.focus();
                                
                                const length = titleInput.value.length;
                                titleInput.setSelectionRange(length, length);
                                
                                optionsMenu.remove();
                            });

                            const titleDisplay = li.querySelector(`#title-display-${tab.id}`);
                            const titleInput = li.querySelector(`#title-input-${tab.id}`);

                            titleInput.addEventListener("blur", function () {
                                const newTitle = titleInput.value;
                                saveTabTitle(tab.id, newTitle);
                                titleDisplay.textContent = newTitle;
                                titleInput.classList.add("hidden");
                                titleDisplay.classList.remove("hidden");
                            });

                            // Add Note option
                            const editTabOption = optionsMenu.querySelector('.add-note');
                            editTabOption.addEventListener('click', () => {
                                const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
                                const noteInput = li.querySelector(`#note-input-${tab.id}`);
                                
                                noteInput.classList.remove("hidden");
                                noteDisplay.classList.add("hidden");
                                noteInput.focus();
                                
                                const length = noteInput.value.length;
                                noteInput.setSelectionRange(length, length);
                                
                                optionsMenu.remove();
                            });
                        
                            // Delete Tab option
                            const deleteTabOption = optionsMenu.querySelector('.delete-tab');
                            deleteTabOption.addEventListener('click', () => {
                                deleteTab(tab.id);
                                optionsMenu.remove();
                            });
                        });
                        
                        const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
                        const noteInput = li.querySelector(`#note-input-${tab.id}`);
                        
                        noteDisplay.addEventListener("click", function () {
                            if (noteInput.classList.contains("hidden")) {
                                noteInput.classList.remove("hidden");
                                noteDisplay.classList.add("hidden");
                                noteInput.focus();
                                
                                const length = noteInput.value.length;
                                noteInput.setSelectionRange(length, length);
                            }
                        });
                        
                        noteInput.addEventListener("blur", function () {
                            const note = noteInput.value;
                            saveTabNote(tab.id, note);
                            noteDisplay.textContent = note || '';
                            noteInput.classList.add("hidden");
                            noteDisplay.classList.remove("hidden");
                        });
                    }
                });
            }
        }
    });
}
function fetchOpenTabs() {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        tabs = tabs.filter(tab => 
            !tab.url.startsWith("chrome://") && 
            !tab.url.startsWith("about:") && 
            !tab.url.startsWith("file://")
        );
        const openTabsList = document.getElementById("open-tabs-list");
        openTabsList.innerHTML = ""; // Clear the list before repopulating

        tabs.forEach((tab, index) => {
            const li = document.createElement("li");
            const dragHandle = document.createElement("div");
            dragHandle.classList.add("drag-handle");
            
            dragHandle.innerHTML = `<img src="../icons/drag.svg" width="24" height="24" class="main-grid-item-icon" />`;
            
            li.draggable = true;
            li.style.userSelect = "none";
            li.addEventListener("dragstart", handleDragStart);
            li.addEventListener("dragend", handleDragEnd);
            li.id = `opentab-${tab.id}`;
            li.classList.add("tab-item");

            li.appendChild(dragHandle);

            const closeButton = document.createElement("img");
            closeButton.src = "../icons/close.svg";
            closeButton.alt = "Close";
            closeButton.classList.add("close-button");                
            closeButton.addEventListener("click", () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    let activeTab = tabs[0];
                    
                    // Close the specified tab
                    chrome.tabs.remove(tab.id, () => {
                        // Optionally, you can ensure the focus remains on the active tab
                        chrome.tabs.update(activeTab.id, { active: true });
                    });
                });
            });

            li.innerHTML += `
                <div style="display: flex; align-items: center;">
                    <div style="flex-grow: 1; display: flex; align-items: center;">
                        <img src="${tab.favIconUrl || ''}" width="16" height="16"> ${tab.title}
                    </div>
                    <div style="width: 5%; display: flex; align-items: center; justify-content: center;">
                    </div>
                </div>
            `;

            li.querySelector("div > div:last-child").appendChild(closeButton);

            li.setAttribute("data-tab-id", tab.id);
            li.setAttribute("data-index", index);
            
            li.addEventListener("click", (event) => {
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
            li.addEventListener("dblclick", () => {
                chrome.tabs.update(tab.id, { active: true });
            });

            openTabsList.appendChild(li);
        });
        openTabsList.addEventListener('dragover', handleDragOver);
        openTabsList.addEventListener('drop', handleDrop);
    });
}

chrome.tabs.onUpdated.addListener(fetchOpenTabs);
chrome.tabs.onRemoved.addListener(fetchOpenTabs);
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.savedTabs) {
        displaySavedTabs(changes.savedTabs.newValue);
    }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.bgTabs) {
        chrome.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
            let columnState = data.columnState || {};
            const bgTabs = data.bgTabs || [];
            let savedTabs = data.savedTabs || [];
            const tabIds = bgTabs.map(tab => tab.id);

            if (Object.keys(columnState).length === 0) {
                columnState["defaultColumn"] = { tabIds: [], title: "New Column" };
            }
            const firstColumnId = Object.keys(columnState)[0];
            const formattedIds = tabIds.map(id => `tab-${id}`);
            columnState[firstColumnId].tabIds = columnState[firstColumnId].tabIds.concat(formattedIds);
            savedTabs = savedTabs.concat(bgTabs);

            chrome.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
                console.log("Migrated bgTabs");
            });
        });
    }
});

fetchOpenTabs();
chrome.storage.local.get("savedTabs", (data) => {
    displaySavedTabs(data.savedTabs || []);
});