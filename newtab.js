document.getElementById("create-column").addEventListener("click", () => {
    createColumn("New Column");
    saveColumnState();
});
document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);
let dropIndicator = null;

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const isCollapsed = sidebar.classList.toggle("collapsed");

    // Save the collapsed/expanded state to Chrome storage
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
        console.log('Index:', index);
        if (index !== -1) {
            tabs.splice(index, 1); // Remove the tab at the specified index
            chrome.storage.local.set({ savedTabs: tabs }), () => {
                console.log('Tab deleted:', id);
            }
        }
    });
    refreshTabDisplay();
}
function saveTabNote(index, note) {
    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        tabs[index].note = note; // Update the note for the tab

        // Save the updated tabs back to storage
        chrome.storage.local.set({ savedTabs: tabs }, () => {
            displaySavedTabs(tabs); // Refresh the displayed tabs
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
    if(id){
        column.id = id;
    }
    else{
        column.id = `column-${Date.now()}`;
    }
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
    deleteButton.innerHTML = `<img src="delete-icon.svg" width="24" height="24" class="main-grid-item-icon" />`;
    deleteButton.addEventListener("click", deleteColumn);

    // Create a span to display the title in read mode
    const titleSpan = document.createElement("h2");
    titleSpan.classList.add("column-title-text");
    titleSpan.style.display = "none";
    titleSpan.style.userSelect = "none";

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
    tabId = parseInt(tabId.replace('tab-', ''));
    chrome.tabs.get(tabId, (tab) => {
        const newTab = {
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl || '',
            id: tabId
        };

        chrome.storage.local.get("savedTabs", (data) => {
            const existingTabs = data.savedTabs || [];
            const updatedTabs = [...existingTabs, newTab];
            chrome.storage.local.set({ savedTabs: updatedTabs }, () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    let activeTab = tabs[0];
                    
                    // Close the specified tab
                    chrome.tabs.remove(tabId, () => {
                        // Optionally, you can ensure the focus remains on the active tab
                        chrome.tabs.update(activeTab.id, { active: true });
                    });
                });
            });
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

    let dropPosition = tabItems.length;
    for (let i = 0; i < tabItems.length; i++) {
        const tabRect = tabItems[i].getBoundingClientRect();
        if (event.clientY < tabRect.top + tabRect.height / 2) {
            dropPosition = i;
            break;
        }
    }

    if (dropPosition === tabItems.length) {
        dropIndicator.style.top = `${rect.bottom}px`;
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

    // Check if the tab is an open tab
    if (column.id !== 'open-tabs-list' && tabId.startsWith('opentab')) {
        tabId = tabId.replace('opentab-', 'tab-');
        event.dataTransfer.setData("text/plain", tabId);
        tabItem.id = tabId;
        saveTab(tabId);
    }
    const tabItems = Array.from(column.querySelectorAll('.tab-item'));

    let dropPosition = tabItems.length;
    for (let i = 0; i < tabItems.length; i++) {
        const tabRect = tabItems[i].getBoundingClientRect();
        if (event.clientY < tabRect.top + tabRect.height / 2) {
            dropPosition = i;
            break;
        }
    }

    if (dropPosition === tabItems.length) {
        column.appendChild(tabItem);
    } else {
        column.insertBefore(tabItem, tabItems[dropPosition]);
    }

    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }

    if(column.id === 'open-tabs-list') {
        rearrangeBrowserTabs(tabId, dropPosition);
        return;
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
            for(const columnId in columnState){
                const column = createColumn(columnState[columnId].title, columnId);

                columnState[columnId].tabIds.forEach(tabId => {
                    const tab = tabs.find(t => `${t.id}` === tabId.split('-')[1]);
                    if(tab){
                        const li = document.createElement("li");
                        li.style.userSelect = "none";
                        li.id = `tab-${tab.id}`;
                        li.classList.add("tab-item");
                
                        const dragHandle = document.createElement("div");
                        dragHandle.classList.add("drag-handle");
                        dragHandle.innerHTML = `<img src="drag.svg" width="24" height="24" class="main-grid-item-icon" />`;
                        
                        li.draggable = true;
                        li.addEventListener("dragstart", handleDragStart);
                        li.addEventListener("dragend", handleDragEnd);
                
                        li.appendChild(dragHandle);
                
                        li.innerHTML += `
                            <div class="tab-info">
                                <a href="${tab.url}" target="_self">
                                    <img src="${tab.favIconUrl}" width="16" height="16"> ${tab.title}
                                </a>
                                <div class="note-display fixed-width" id="note-display-${tab.id}">${tab.note || ''}</div>
                                <textarea class="tab-note hidden" id="note-input-${tab.id}" rows="1">${tab.note || ''}</textarea>
                            </div>
                            <div class="tab-actions">
                                <button class="edit-tab" data-index="${tab.id}" title="Edit Tab">
                                    <img src="edit.svg" width="24" height="24" class="main-grid-item-icon" />
                                </button>
                                <button class="delete-tab" id="delete-btn-${tab.id}" data-index="${tab.id}" title="Delete Tab">
                                    <img src="delete-icon.svg" width="24" height="24" class="main-grid-item-icon" />
                                </button>
                            </div>
                        `;
                
                        column.appendChild(li);
                
                        const noteDisplay = li.querySelector(`#note-display-${tab.id}`);
                        const noteInput = li.querySelector(`#note-input-${tab.id}`);
                        const editButton = li.querySelector(`.edit-tab`);
                        noteDisplay.addEventListener("click", function () {
                            if (noteInput.classList.contains("hidden")) {
                                // Switch to edit mode
                                noteInput.classList.remove("hidden");
                                noteDisplay.classList.add("hidden");
                                noteInput.focus();
                                
                                // Position the cursor at the end of the input
                                const length = noteInput.value.length;
                                noteInput.setSelectionRange(length, length);
                            }
                        });
                        // Handle toggling between read and edit mode
                        editButton.addEventListener("click", function () {
                            if (noteInput.classList.contains("hidden")) {
                                // Switch to edit mode
                                noteInput.classList.remove("hidden");
                                noteDisplay.classList.add("hidden");
                                noteInput.focus();
                                
                                // Position the cursor at the end of the input
                                const length = noteInput.value.length;
                                noteInput.setSelectionRange(length, length);
                            } else {
                                // Save the note and switch to read mode
                                const note = noteInput.value;
                                saveTabNote(index, note);
                                noteDisplay.textContent = note || ''; // Update the displayed note
                                noteInput.classList.add("hidden");
                                noteDisplay.classList.remove("hidden");
                            }
                        });
                
                        // Toggle back to read mode when the input loses focus (blur)
                        noteInput.addEventListener("blur", function () {
                            const note = noteInput.value;
                            saveTabNote(tab.id, note);
                            noteDisplay.textContent = note || ''; // Update the displayed note
                            noteInput.classList.add("hidden");
                            noteDisplay.classList.remove("hidden");
                        });

                        const deleteButton = li.querySelector(`#delete-btn-${tab.id}`);
                        deleteButton.addEventListener("click", () => deleteTab(tab.id));
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
            
            dragHandle.innerHTML = `<img src="drag.svg" width="24" height="24" class="main-grid-item-icon" />`;
            
            li.draggable = true;
            li.style.userSelect = "none";
            li.addEventListener("dragstart", handleDragStart);
            li.addEventListener("dragend", handleDragEnd);
            li.id = `opentab-${tab.id}`;
            li.classList.add("tab-item");

            li.appendChild(dragHandle);

            const closeButton = document.createElement("img");
            closeButton.src = "close.svg";
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

            // Add click event listener to switch to the tab
            li.addEventListener("click", () => {
                chrome.tabs.update(tab.id, { active: true });
            });

            openTabsList.appendChild(li);
        });
        openTabsList.addEventListener('dragover', handleDragOver);
        openTabsList.addEventListener('drop', handleDrop);
    });
}

function rearrangeBrowserTabs(tabId, newIndex) {
    chrome.tabs.move(parseInt(tabId.replace('opentab-', '')), { index: newIndex }, () => {
        fetchOpenTabs();
    });
}
function refreshTabDisplay() {
    chrome.storage.local.get("savedTabs", (data) => {
        console.log('Saved tabs:', data.savedTabs);
        if (data.savedTabs) {
            displaySavedTabs(data.savedTabs);
        }
    });
}

chrome.tabs.onUpdated.addListener(fetchOpenTabs);
chrome.tabs.onRemoved.addListener(fetchOpenTabs);
fetchOpenTabs();
refreshTabDisplay();
