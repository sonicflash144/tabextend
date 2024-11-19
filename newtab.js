import { Chrono } from 'chrono-node';
import 'emoji-picker-element';
chrome.storage.local.get("sidebarCollapsed", (data) => {
    const sidebar = document.getElementById('sidebar');
    if (data.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        sidebar.classList.add('no-transition');
        setTimeout(() => {
            sidebar.classList.remove('no-transition');
        }, 100);
    }
});
let scrollAnimation = {
    isScrolling: false,
    scrollX: 0,
    scrollY: 0,
    animationFrameId: null
};
let dropIndicator = null;
let dropType = null;
let deletionArea;
let newColumnIndicator;
let lastSelectedIndex = null;
let activeColumnMenu = null;
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
    if (activeColumnMenu) {
        activeColumnMenu.remove();
        activeColumnMenu = null;
    }
}

function deleteTab(id, column = null) {
    if (!Array.isArray(id)) {
        id = [id];
    }

    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        id.forEach(tabId => {
            const index = tabs.findIndex(tab => tab.id === tabId);
            if (index !== -1) {
                tabs.splice(index, 1); // Remove the tab at the specified index
                console.log('Tab deleted:', tabId);
            }
        });

        if(column){
            column.remove();
            chrome.storage.local.set({ savedTabs: tabs, columnState: saveColumnState(true) }, () => {
                console.log('Updated storage with remaining columns');
            });
        }
        else{
            chrome.storage.local.set({ savedTabs: tabs }, () => {
                console.log('Updated storage with remaining tabs');
            });
        }
    });
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
                    chrome.storage.local.set({ savedTabs: updatedTabs, columnState: saveColumnState(true) }, () => {
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
function saveTabNote(id, note) {
    chrome.storage.local.get("savedTabs", (data) => {
        const tabs = data.savedTabs || [];
        const index = tabs.findIndex(tab => tab.id === id);

        // Parse the date but do not format it yet
        const { parsedDate, remainingNote } = parseAndSaveDate(note);
        tabs[index].note = remainingNote.replace(/\n/g, '<br>'); // Update the note for the tab

        if (parsedDate) {
            tabs[index].parsedDate = parsedDate.getTime(); // Save the timestamp of the date
        }

        chrome.storage.local.set({ savedTabs: tabs }, () => {
            console.log('Tab note saved:', id, remainingNote);
        });
    });
}
function parseAndSaveDate(note) {
    const chrono = new Chrono();
    const parsedNote = note.replace(/\\\w+/g, '');
    const parsedDate = chrono.parseDate(parsedNote);
    const detectedDateText = parsedDate ? chrono.parse(note)[0].text : '';
    
    // Remove the parsed date from the note
    const remainingNote = parsedDate ? note.replace(detectedDateText, '').trim() : note;
    
    return { parsedDate, remainingNote, detectedDateText };
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

function saveColumnState(returnState = false) {
    const columnsContainer = document.getElementById('columns-container');
    const columns = columnsContainer.querySelectorAll('.column');
    const columnState = [];

    columns.forEach(column => {
        const columnId = column.id;
        const tabItems = column.querySelectorAll('.tab-item');
        const tabIds = Array.from(tabItems).map(tabItem => tabItem.id);
        const columnTitle = column.querySelector('.column-title-text').textContent;
        const isMinimized = column.classList.contains('minimized');
        const emoji = column.dataset.emoji;
        
        columnState.push({
            id: columnId,
            tabIds: tabIds,
            title: columnTitle,
            minimized: isMinimized,
            emoji: emoji
        });
    });

    if(returnState) {
        return columnState;
    }
    else{
        chrome.storage.local.set({ columnState }, () => {
            //console.log('Column state saved:', columnState);
        });
    }
}
const getRandomEmoji = () => {
    const range = [0x1F34F, 0x1F37F]; // Food and Drink        
    const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    return String.fromCodePoint(codePoint);
};
function createColumn(title, id, minimized = false, emoji = null) {
    const columnsContainer = document.getElementById("columns-container");
    const column = document.createElement("div");
    column.classList.add("column");
    if (minimized) column.classList.add("minimized");
    if(id) column.id = id;
    else column.id = `column-${Date.now()}`;

    // Create a container for the title and buttons
    const headerContainer = document.createElement("div");
    headerContainer.classList.add("header-container");

    // Add minimize button to the column
    const minimizeButton = document.createElement("button");
    minimizeButton.classList.add("minimize-column");
    minimizeButton.title = "Minimize Column";
    minimizeButton.innerHTML = `<img src="../icons/minimize.svg" width="24" height="24" class="main-grid-item-icon" />`;
    minimizeButton.addEventListener("click", () => {
        minimizeColumn(column);
        chrome.storage.local.set({ columnState: saveColumnState(true), animation: {columnId: column.id, minimized: true} }, () => {
            console.log(`${column.id} minimized`);
        });
    });

    // Add maximize button to the column
    const maximizeButton = document.createElement("button");
    maximizeButton.classList.add("maximize-column");
    maximizeButton.title = "Maximize Column";
    maximizeButton.innerHTML = `<img src="../icons/maximize.svg" width="24" height="24" class="main-grid-item-icon" />`;
    maximizeButton.addEventListener("click", () => {
        maximizeColumn(column);
        chrome.storage.local.set({ columnState: saveColumnState(true), animation: {columnId: column.id, minimized: false} }, () => {
            console.log(`${column.id} maximized`);
        });
    });
    maximizeButton.style.display = minimized ? "inline" : "none"; // Initially hidden if not minimized

    // Add title input to the column
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.classList.add("column-title");
    titleInput.placeholder = "Enter column title";

    // Create a span to display the title in read mode
    const titleSpan = document.createElement("h2");
    titleSpan.classList.add("column-title-text");

    // If a title is provided, display it in read mode
    if (title) {
        titleSpan.textContent = title;
        titleSpan.style.display = "inline";
        titleInput.style.display = "none";
        column.dataset.title = title;
    }

    // Create three-dot menu container
    const menuContainer = document.createElement("div");
    menuContainer.classList.add("menu-container");
    
    // Create three-dot menu button
    const menuButton = document.createElement("button");
    menuButton.classList.add("more-options");
    menuButton.innerHTML = `<img src="../icons/morevertical.svg" width="24" height="24" class="main-grid-item-icon" />`;
    menuContainer.appendChild(menuButton);
    
    // Toggle menu on button click with dynamic positioning
    menuButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if(activeColumnMenu){
            closeAllMenus();
            return;
        }
        closeAllMenus();

        // Create menu dropdown
        const menuDropdown = document.createElement("div");
        menuDropdown.className = "options-menu";
        const menuItems = [
            { text: "Open All", icon: "../icons/openall.svg", action: () => openAllInColumn(column) },
            { text: "Delete Column", icon: "../icons/delete-icon.svg", action: () => deleteColumn(column) }
        ];
        menuItems.forEach(item => {
            const menuItem = document.createElement("button");
            menuItem.classList.add("menu-option");
            menuItem.innerHTML = `
                <img src="${item.icon}" width="16" height="16" class="menu-item-icon" />
                <span>${item.text}</span>
            `;
            menuItem.addEventListener("click", (e) => {
                e.stopPropagation();
                item.action(e);
                menuDropdown.style.display = "none";
            });
            menuDropdown.appendChild(menuItem);
        });
    
        // Position the dropdown relative to the button
        const buttonRect = menuButton.getBoundingClientRect();
        menuDropdown.style.position = "fixed";
        menuDropdown.style.top = `${buttonRect.bottom + 5}px`; // 5px gap below button
        menuDropdown.style.right = `${window.innerWidth - buttonRect.right}px`; // Align right edges

        document.body.appendChild(menuDropdown);
        activeColumnMenu = menuDropdown;
    });

    // Event listener to switch to read mode
    titleInput.addEventListener("blur", () => {
        if (titleInput.value.trim() !== "") {
            titleSpan.textContent = titleInput.value;
            titleInput.style.display = "none";
            titleSpan.style.display = "inline";
        }
        column.setAttribute("draggable", "true");
        column.dataset.title = titleInput.value;
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
        if(column.classList.contains('minimized')){
            titleInput.classList.add("vertical-text");
        }
        else{
            titleInput.classList.remove("vertical-text");
        }
    });

    // Event listener to save on Enter key press
    titleInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            titleInput.blur();
        }
    });

    // Create emoji button and span
    const emojiButton = document.createElement("button");
    emojiButton.classList.add("emoji-button");
    emojiButton.textContent = emoji || getRandomEmoji();

    // Store the emoji as a data attribute on the column
    column.dataset.emoji = emojiButton.textContent;

    // Create and configure the emoji picker element
    const emojiPicker = document.createElement('emoji-picker');
    emojiPicker.classList.add('emoji-picker-on-top');
    emojiPicker.style.display = 'none';
    emojiPicker.addEventListener('emoji-click', (event) => {
        const newEmoji = event.detail.unicode;
        emojiButton.textContent = newEmoji;
        column.dataset.emoji = newEmoji;
        emojiPicker.style.display = 'none';
        saveColumnState();
    });

    // Toggle emoji picker when clicking the emoji button
    emojiButton.addEventListener('click', () => {
        if (emojiPicker.style.display === 'none') {
            const rect = emojiButton.getBoundingClientRect();
            emojiPicker.style.top = `${rect.bottom + 4}px`;
            emojiPicker.style.left = `${rect.left}px`;
            emojiPicker.style.display = 'block';
        } else {
            emojiPicker.style.display = 'none';
        }
    });
    // Hide emoji picker when clicking outside
    document.addEventListener('click', (event) => {
        if (!emojiButton.contains(event.target) && !emojiPicker.contains(event.target)) {
            emojiPicker.style.display = 'none';
        }
    });

    // Append open all button, title, and delete button to the header container
    const titleGroup = document.createElement("div");
    titleGroup.classList.add("title-group");

    headerContainer.appendChild(minimizeButton);
    headerContainer.appendChild(maximizeButton);
    titleGroup.appendChild(emojiPicker);
    titleGroup.appendChild(emojiButton);
    titleGroup.appendChild(titleInput);
    titleGroup.appendChild(titleSpan);
    headerContainer.appendChild(titleGroup);
    headerContainer.appendChild(menuContainer);

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
    closeAllMenus();
    let column = event;
    if(event instanceof Event){
        column = event.target.closest(".column");
    }
    const tabItems = column.querySelectorAll('.tab-item');
    const tabIds = Array.from(tabItems).map(tabItem => tabItem.id);
    deleteTab(tabIds.map(id => parseInt(id.replace('tab-', ''))), column);
}
function openAllInColumn(column) {
    closeAllMenus();
    const tabItems = column.querySelectorAll('.tab-item');
    const urls = Array.from(tabItems).map(tabItem => tabItem.dataset.url);
    // Open all tabs
    const createTabs = urls.map(url => 
        new Promise(resolve => {
            chrome.tabs.create({ url: url, active: false }, resolve);
        })
    );
    // After all tabs are created, group them
    Promise.all(createTabs).then(tabs => {
        const tabIds = tabs.map(tab => tab.id); // Extract tab IDs
        chrome.tabs.group({ tabIds: tabIds }, groupId => {
            // Set the title of the group
            chrome.tabGroups.update(groupId, { title: column.querySelector('.column-title-text').textContent });
        });
    });
}
function minimizeColumn(column) {
    const titleSpan = column.querySelector(".column-title-text");
    const maximizeButton = column.querySelector(".maximize-column");
    const minimizeButton = column.querySelector(".minimize-column");
    const titleGroup = column.querySelector(".title-group");
    const menuContainer = column.querySelector(".menu-container");
    const menuButton = column.querySelector(".more-options");
    const headerContainer = column.querySelector(".header-container");

    column.classList.add("minimized");
    titleSpan.classList.add("vertical-text");
    titleGroup.classList.add("vertical");
    maximizeButton.style.display = "inline";
    minimizeButton.style.display = "none";
    menuContainer.classList.add("vertical");
    menuButton.classList.add("vertical");
    headerContainer.classList.add("vertical");

    // Hide all tab items in the column
    const tabItems = column.querySelectorAll('.tab-item');
    tabItems.forEach(tabItem => {
        tabItem.style.display = "none";
    });
}
function maximizeColumn(column) {
    const titleSpan = column.querySelector(".column-title-text");
    const titleGroup = column.querySelector(".title-group");
    const maximizeButton = column.querySelector(".maximize-column");
    const minimizeButton = column.querySelector(".minimize-column");
    const menuContainer = column.querySelector(".menu-container");
    const menuButton = column.querySelector(".more-options");
    const headerContainer = column.querySelector(".header-container");

    column.classList.remove("minimized");
    titleSpan.classList.remove("vertical-text");
    titleGroup.classList.remove("vertical");
    maximizeButton.style.display = "none";
    minimizeButton.style.display = "inline";
    menuContainer.classList.remove("vertical");
    menuButton.classList.remove("vertical");
    headerContainer.classList.remove("vertical");

    // Show all tab items in the column
    const tabItems = column.querySelectorAll('.tab-item');
    tabItems.forEach(tabItem => {
        tabItem.style.display = "flex";
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
function calculateDropPosition(event, tabItems, isMinimized = false) {
    if(isMinimized){
        return tabItems.length;
    } 
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
function startScrollAnimation(container) {
    function animate() {
        if (!scrollAnimation.isScrolling) return;

        if (scrollAnimation.scrollX !== 0 || scrollAnimation.scrollY !== 0) {
            container.scrollBy(scrollAnimation.scrollX, scrollAnimation.scrollY);
            scrollAnimation.animationFrameId = requestAnimationFrame(animate);
        } else {
            stopScrollAnimation();
        }
    }

    scrollAnimation.animationFrameId = requestAnimationFrame(animate);
}
function stopScrollAnimation() {
    scrollAnimation.isScrolling = false;
    scrollAnimation.scrollX = 0;
    scrollAnimation.scrollY = 0;
    if (scrollAnimation.animationFrameId) {
        cancelAnimationFrame(scrollAnimation.animationFrameId);
        scrollAnimation.animationFrameId = null;
    }
}
function handleDragOver(event) {
    event.preventDefault();
    const scrollThreshold = 240;
    const maxScrollSpeed = 15;
    const columnsContainer = document.getElementById('columns-container');
    const containerRect = columnsContainer.getBoundingClientRect();
    const spaceContainer = document.getElementById('space-container');
    const spaceContainerRect = spaceContainer.getBoundingClientRect();
    const sidebar = document.getElementById('sidebar');
    const sidebarRect = sidebar.getBoundingClientRect();

    function calculateScrollSpeed(distance) {
        if (distance <= 0) return 0;
        if (distance >= scrollThreshold) return 0;
        
        // Create a smooth acceleration curve
        const scrollProgress = 1 - (distance / scrollThreshold);
        return maxScrollSpeed * Math.pow(scrollProgress, 2);
    }

    // Calculate scroll speeds for each direction
    const leftSpeed = calculateScrollSpeed(event.clientX - containerRect.left);
    const rightSpeed = calculateScrollSpeed(containerRect.right - event.clientX);
    const topSpeed = calculateScrollSpeed(event.clientY - containerRect.top);
    const bottomSpeed = calculateScrollSpeed(containerRect.bottom - event.clientY);
    scrollAnimation.scrollX = -leftSpeed + rightSpeed;
    scrollAnimation.scrollY = -topSpeed + bottomSpeed;

    // Start the animation if we're not already scrolling and there's movement needed
    if (!scrollAnimation.isScrolling && (scrollAnimation.scrollX !== 0 || scrollAnimation.scrollY !== 0)) {
        scrollAnimation.isScrolling = true;
        startScrollAnimation(columnsContainer);
    } else if (scrollAnimation.scrollX === 0 && scrollAnimation.scrollY === 0) {
        // Stop scrolling if we're outside the scroll zones
        stopScrollAnimation();
    }

    deletionArea.style.display = 'flex';
    if (deletionArea.contains(event.target)) {
        deletionArea.classList.add('deletion-area-active');
        dropIndicator.style.display = 'none';
        event.dataTransfer.dropEffect = 'move';
        return;
    } else if (newColumnIndicator.contains(event.target)) {
        newColumnIndicator.classList.add('new-column-indicator-active');
        dropIndicator.style.display = 'none';
        event.dataTransfer.dropEffect = 'move';
        return;
    }
    
    const column = event.target.closest('.column');
    const openTabsList = event.target.closest('#open-tabs-list');
    const element = openTabsList || column;
    const isMinimized = column && column.classList.contains('minimized');

    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        const dropIndicatorContainer = document.createElement('div');
        dropIndicatorContainer.className = 'drop-indicator-container';
        document.body.appendChild(dropIndicatorContainer);
        dropIndicatorContainer.appendChild(dropIndicator);
    }

    // Get the appropriate scroll position based on container
    const containerScrollTop = openTabsList ? sidebar.scrollTop : columnsContainer.scrollTop;

    if (dropType === "list-item" && element) {
        // Handle list item drag over
        newColumnIndicator.style.display = 'flex';
        const rect = element.getBoundingClientRect();
        const listItems = Array.from(element.querySelectorAll('.tab-item'));
        const dropPosition = calculateDropPosition(event, listItems, isMinimized);

        const spaceContainerLeft = spaceContainerRect.left;
        const spaceContainerRight = spaceContainerRect.right;

        let indicatorLeft = rect.left;
        let width = rect.width;
        if(openTabsList){
            indicatorLeft = sidebarRect.left;
            width = sidebarRect.width;
        }
        else{
            // Left boundary
            if (indicatorLeft < spaceContainerLeft) {
                const difference = spaceContainerLeft - indicatorLeft;
                indicatorLeft = spaceContainerLeft;
                width = width - difference;
            }
            // Right boundary 
            if (indicatorLeft + width > spaceContainerRight) {
                width = spaceContainerRight - indicatorLeft;
            }
        }
        dropIndicator.style.width = `${width}px`;
        dropIndicator.style.height = '2px';
        dropIndicator.style.left = `${indicatorLeft}px`;

        // Calculate and constrain top position
        let indicatorTop;
        if (dropPosition === listItems.length) {
            const lastItem = listItems[listItems.length - 1];
            if (isMinimized) {
                indicatorTop = rect.top + containerScrollTop;
            } else {
                indicatorTop = lastItem 
                    ? lastItem.getBoundingClientRect().bottom + containerScrollTop
                    : rect.top + containerScrollTop;
            }
        } else {
            indicatorTop = listItems[dropPosition].getBoundingClientRect().top + containerScrollTop;
        }
        
        // Handle vertical boundaries based on container
        if (openTabsList) {
            const sidebarRect = sidebar.getBoundingClientRect();
            if (indicatorTop < sidebarRect.top) {
                indicatorTop = sidebarRect.top;
            }
            if (indicatorTop + 2 > sidebarRect.bottom) {
                indicatorTop = sidebarRect.bottom - 2;
            }
        } else {
            if (indicatorTop < spaceContainerRect.top) {
                indicatorTop = spaceContainerRect.top;
            }
            if (indicatorTop + 2 > spaceContainerRect.bottom) {
                indicatorTop = spaceContainerRect.bottom - 2;
            }
        }
        
        dropIndicator.style.top = `${indicatorTop}px`;
        
    } 
    else if (dropType === "column" && columnsContainer) {
        const rect = columnsContainer.getBoundingClientRect();
        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);

        const spaceContainerLeft = spaceContainerRect.left;
        const spaceContainerRight = spaceContainerRect.right;

        let indicatorLeft;
        const width = 2;
        let height = rect.height;

        // Left boundary
        if (indicatorLeft < spaceContainerLeft) {
            indicatorLeft = spaceContainerLeft;
        }
        
        // Right boundary
        if (indicatorLeft > spaceContainerRight - width) {
            indicatorLeft = spaceContainerRight - width;
        }

        if (dropPosition === columns.length) {
            const lastColumn = columns[columns.length - 1];
            indicatorLeft = lastColumn 
                ? lastColumn.getBoundingClientRect().right
                : rect.left;
        } else {
            const targetColumn = columns[dropPosition];
            indicatorLeft = targetColumn.getBoundingClientRect().left;
        }

        dropIndicator.style.width = `${width}px`;
        dropIndicator.style.height = `${height}px`;
        dropIndicator.style.left = `${indicatorLeft}px`;
        dropIndicator.style.top = `${rect.top + containerScrollTop}px`;
        
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
        if(deletionArea.contains(event.target)) {
            deleteColumn(droppedColumn);
            return;
        }

        // Handle column drop
        const columns = Array.from(columnsContainer.querySelectorAll('.column'));
        const dropPosition = calculateColumnDropPosition(event, columns);

        if (dropPosition === columns.length) {
            columnsContainer.appendChild(droppedColumn);
        } 
        else {
            columnsContainer.insertBefore(droppedColumn, columns[dropPosition]);
        }
        // Ensure 'new-column-indicator' remains the last child
        if (newColumnIndicator) {
            columnsContainer.appendChild(newColumnIndicator);
        }

        saveColumnState();
        return; // Exit since we handled a column drop
    }

    // Continue with tab drop logic
    const column = event.target.closest('.column') || event.target.closest('#open-tabs-list');
    const isMinimized = column && column.classList.contains('minimized');
    if (!column && !deletionArea.contains(event.target) && !newColumnIndicator.contains(event.target)) {
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

    if(deletionArea.contains(event.target)) {
        itemsToProcess.forEach(item => {
            const itemId = item.id;
            if (itemId.startsWith('tab-')) {
                tabIdsToDelete.push(parseInt(itemId.replace('tab-', '')));
            }
            else if (itemId.startsWith('opentab')) {
                chrome.tabs.remove(parseInt(itemId.replace('opentab-', '')), () => {
                    console.log('Tab closed:', itemId);
                });
            }
            item.parentNode.removeChild(item);
        });
        deleteTab(tabIdsToDelete);
        return;
    }
    else if(newColumnIndicator.contains(event.target)) {
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
        else{
            saveColumnState();
        }
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
            chrome.tabs.move(parseInt(itemId.split('-')[1]), { index: dropPosition }, () => {
                console.log('Tab moved:', itemId, 'to index:', dropPosition);
            });
        }
    });

    // Insert all items into the column at once
    itemsToInsert.forEach(({ item, dropPosition }) => {
        if (dropPosition === tabItems.length) {
            column.appendChild(item);
        } else {
            column.insertBefore(item, tabItems[dropPosition]);
        }
    });

    if (itemIdsToSave.length > 0) {
        saveTab(itemIdsToSave);
    }
    if (tabIdsToDelete.length > 0) {
        deleteTab(tabIdsToDelete);
    }
    if (itemIdsToSave.length === 0 && tabIdsToDelete.length === 0) {
        saveColumnState();
    }

    if(isMinimized){
        const updatedTabs = column.querySelectorAll('.tab-item');
        updatedTabs.forEach(tabItem => {
            tabItem.style.display = "none";
        });
    }
}
function handleDragEnd(event) {
    stopScrollAnimation();
    event.target.closest('.tab-item')?.classList.remove("dragging");
    event.target.closest('.column')?.classList.remove("dragging");
    if (deletionArea) deletionArea.style.display = 'none';
    if (dropIndicator) dropIndicator.style.display = 'none';
    if (newColumnIndicator) newColumnIndicator.style.display = 'none';
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

function calculateFormattedDate(parsedDate) {
    let formattedDate = '';
    let diffDays = -1;
    let dateDisplayColor = null;
    if (parsedDate) {
        parsedDate = new Date(parsedDate);
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
    if (diffDays < 0) {
        dateDisplayColor = '#e63c30';
    } else if (formattedDate === 'Today') {
        dateDisplayColor = '#058527';
    } else if (formattedDate === 'Tomorrow') {
        dateDisplayColor = '#C76E00';
    } else {
        dateDisplayColor = '#ababab';
    }
    return { formattedDate, dateDisplayColor };
}

/* Tab Display */
function displaySavedTabs(tabs) {
    const columnsContainer = document.getElementById("columns-container");
    const mainContent = document.getElementById("main-content");
    mainContent.addEventListener('dragover', handleDragOver);
    mainContent.addEventListener('drop', handleDrop);
    columnsContainer.innerHTML = "";

    chrome.storage.local.get('columnState', (result) => {
        const columnState = result.columnState || [];
        if(columnState.length > 0) {
            console.log(columnState);
            columnState.forEach(columnData => {
                const column = createColumn(columnData.title, columnData.id, columnData.minimized, columnData.emoji);
                column.setAttribute('draggable', 'true');
                column.addEventListener('dragstart', handleColumnDragStart);
                column.addEventListener('dragend', handleDragEnd);
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
                        const { formattedDate, dateDisplayColor } = calculateFormattedDate(tab.parsedDate);
                        const savedFormattedDate = formattedDate;
                        const savedDateDisplayColor = dateDisplayColor;
                        li.innerHTML += `
                            <div class="tab-info-container">
                                <div class="tab-info-left">
                                    <img src="${tab.favIconUrl}" width="24" height="24">
                                </div>
                                <div class="tab-info-right">
                                    <span class="tab-title" data-url="${tab.url}" id="title-display-${tab.id}">${tab.title}</span>
                                    <input type="text" class="hidden" id="title-input-${tab.id}" value="${tab.title}">
                                    <div class="note-display fixed-width" id="note-display-${tab.id}">${tab.note ? tab.note.replace(/\\/g, '').replace(/\n/g, '<br>') : ''}</div>
                                    <textarea class="tab-note hidden" id="note-input-${tab.id}" rows="1">${tab.note ? tab.note.replace(/<br>/g, '\n') : ''}</textarea>
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
                        dateDisplay.style.backgroundColor = savedDateDisplayColor;
                        
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
                                <button class="menu-option remove-date ${formattedDate ? '' : 'hidden'}" data-index="${tab.id}">Clear Date</button>
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
                      
                            // Color Tab option
                            const colorTabOption = optionsMenu.querySelector('.color-tab');
                            colorTabOption.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (activeColorMenu) {
                                    activeColorMenu.remove();
                                    activeColorMenu = null;
                                    return;
                                }
                                const colorOptions = ['#FFFFFF', '#f7c2d6', '#f9ffc4', '#c6e2e9', '#e9c8fa'];
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
                                        closeAllMenus();
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

                            titleInput.addEventListener("blur", function () {
                                const newTitle = titleInput.value;
                                saveTabTitle(tab.id, newTitle);
                                titleDisplay.textContent = newTitle;
                                titleInput.classList.add("hidden");
                                titleDisplay.classList.remove("hidden");
                                li.addEventListener('dragstart', handleDragStart);
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

                             // Remove Date option
                             const removeDateOption = optionsMenu.querySelector('.remove-date');
                             removeDateOption.addEventListener('click', () => {
                                 tab.parsedDate = null;
                                 dateDisplay.textContent = '';
                                 dateDisplay.classList.add('hidden');
                                 chrome.storage.local.set({ savedTabs: tabs }, () => {
                                     console.log('Tab date removed:', tab.id);
                                 });
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
                        
                        noteInput.addEventListener("blur", function () {
                            const note = noteInput.value;
                            saveTabNote(tab.id, note);
                            noteDisplay.innerHTML = note ? note.replace(/\\/g, '').replace(/\n/g, '<br>') : '';
                            noteInput.classList.add("hidden");
                            noteDisplay.classList.remove("hidden");
                            li.addEventListener('dragstart', handleDragStart);
                        });

                        noteInput.addEventListener("keydown", function (event) {
                            if (event.key === "Enter" && !event.shiftKey) {
                                noteInput.blur();
                            }
                            else if (event.key === "Enter" && event.shiftKey) {
                                const start = noteInput.selectionStart;
                                const end = noteInput.selectionEnd;
                                noteInput.value = noteInput.value.substring(0, start) + "\n" + noteInput.value.substring(end);
                                noteInput.selectionStart = noteInput.selectionEnd = start + 1;
                                event.preventDefault();
                            }
                        });

                        noteInput.addEventListener("input", function () {
                            const note = noteInput.value;
                            // Update the date display in real-time
                            const dateDisplay = li.querySelector(`#date-display-${tab.id}`);
                            const chrono = new Chrono();
                            const parsedNote = note.replace(/\\\w+/g, '');
                            const parsedDate = chrono.parseDate(parsedNote);
                            if (parsedDate) {
                                const { formattedDate, dateDisplayColor } = calculateFormattedDate(parsedDate);
                                dateDisplay.textContent = formattedDate;
                                dateDisplay.classList.remove('hidden');
                                dateDisplay.style.backgroundColor = dateDisplayColor;
                            } 
                            else if(savedFormattedDate) {
                                dateDisplay.textContent = savedFormattedDate;
                                dateDisplay.classList.remove('hidden');
                                dateDisplay.style.backgroundColor = savedDateDisplayColor;
                            }
                            else {
                                dateDisplay.classList.add('hidden');
                            }
                        });
                    }
                });
                if(columnData.minimized) {
                    minimizeColumn(column);
                }
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
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        tabs = tabs.filter(tab => 
            !tab.url.startsWith("chrome://") && 
            !tab.url.startsWith("edge://") &&
            !tab.url.startsWith("opera://") &&
            !tab.url.startsWith("vivaldi://") &&
            !tab.url.startsWith("brave://") &&
            !tab.url.startsWith("about:") && 
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
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    let activeTab = tabs[0];
                    
                    // Close the specified tab
                    chrome.tabs.remove(tab.id, () => {
                        // Optionally, you can ensure the focus remains on the active tab
                        chrome.tabs.update(activeTab.id, { active: true });
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
    if (areaName === 'local' && (changes.savedTabs || changes.columnState)) {
        console.log(changes);
        if(changes.savedTabs){
            tabs_in_storage = changes.savedTabs.newValue.filter(tab => !('temp' in tab));
        }
        if(changes.columnState && changes.animation){
            const column = document.getElementById(changes.animation.newValue.columnId);
            if(changes.animation.newValue.minimized === true){
                minimizeColumn(column);
            }
            else{
                maximizeColumn(column);
            }
            return;
        }
        displaySavedTabs(tabs_in_storage);
    }
    else if (areaName === 'local' && changes.bgTabs) {
        chrome.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
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

            chrome.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
                console.log("Migrated bgTabs");
            });
        });
    }
    else if (areaName === 'local' && changes.sidebarCollapsed) {
        if(changes.sidebarCollapsed.newValue) {
            document.getElementById('sidebar').classList.add('collapsed');
        } else {
            document.getElementById('sidebar').classList.remove('collapsed');
        }
    }
});

fetchOpenTabs();

chrome.storage.local.get(["columnState", "bgTabs", "savedTabs"], (data) => {
    let columnState = data.columnState || [];
    const bgTabs = data.bgTabs || [];
    let savedTabs = data.savedTabs || [];

    if(bgTabs.length > 0) {
        const tabIds = bgTabs.map(tab => tab.id);
        if (columnState.length === 0) {
            columnState.push({ id: "defaultColumn", tabIds: [], title: "New Column", emoji: getRandomEmoji() });
        }
        const firstColumn = columnState[0];
        const formattedIds = tabIds.map(id => `tab-${id}`);
        firstColumn.tabIds = firstColumn.tabIds.concat(formattedIds);
        savedTabs = savedTabs.concat(bgTabs);
    }

    savedTabs = savedTabs.filter(tab => !('temp' in tab));
    savedTabs.push({"temp": Date.now()});

    chrome.storage.local.set({ columnState: columnState, bgTabs: [], savedTabs: savedTabs }, () => {
        console.log("Migrated bgTabs");
    });
});

document.querySelector('.minimize-sidebar').addEventListener('click', () => {
    chrome.storage.local.set({ sidebarCollapsed: true }, () => {
        console.log("Sidebar collapsed state saved");
    });
});
document.querySelector('.maximize-sidebar').addEventListener('click', () => {
    chrome.storage.local.set({ sidebarCollapsed: false }, () => {
        console.log("Sidebar expanded state saved");
    });
});
document.addEventListener('dragover', function(event) {
    event.preventDefault();
});
const handleClickOutside = (e) => {
    const moreOptionsButtons = document.querySelectorAll('.more-options, .menu-option');
    const isMoreOptionsButton = Array.from(moreOptionsButtons).some(button => button === e.target);
    if (!isMoreOptionsButton) {
        closeAllMenus();
    }
};
document.addEventListener('click', handleClickOutside);