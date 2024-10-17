chrome.runtime.onInstalled.addListener(() => {
  // Create a context menu item for saving the selected tab
  chrome.contextMenus.create({
      id: "saveTab",
      title: "Save to Tab Manager",
      contexts: ["page", "selection"]
  });
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: "newtab.html" });
});

// Listen for the context menu item click event
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveTab") {
      saveSelectedTab(tab.id, info.selectionText);
  }
});

// Function to save the selected tab
function saveSelectedTab(tabId, selectionText) {
  chrome.tabs.get(tabId, (tab) => {
      const tabToSave = {
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl || '',
          id: tab.id,
          color: '#FFFFFF',
          note: selectionText || null
      };

      // Retrieve the previously saved tabs and add the new tab
      chrome.storage.local.get(["bgTabs"], (data) => {
          let existingBgTabs = data.bgTabs || [];
          const updatedBgTabs = [...existingBgTabs, tabToSave];

          // Save the updated list of tabs
          chrome.storage.local.set({ bgTabs: updatedBgTabs }, () => {
              console.log("Tab saved.", tabToSave);
          });
          chrome.tabs.remove(tabId);
      });
  });
}