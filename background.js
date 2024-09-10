chrome.runtime.onInstalled.addListener(() => {
  // Create a context menu item for saving the selected tab
  chrome.contextMenus.create({
      id: "saveTab",
      title: "Save to Tab Manager",
      contexts: ["page"]
  });
});

// Listen for the context menu item click event
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveTab") {
      saveSelectedTab(tab.id);
  }
});

// Function to save the selected tab
function saveSelectedTab(tabId) {
  chrome.tabs.get(tabId, (tab) => {
      const tabToSave = {
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl || '',
          id: tab.id,
          color: '#FFFFFF'
      };

      // Retrieve the previously saved tabs and add the new tab
      chrome.storage.local.get(["bgTabs"], (data) => {
          const existingBgTabs = data.bgtabs || [];
          const updatedBgTabs = [...existingBgTabs, tabToSave];

          // Save the updated list of tabs
          chrome.storage.local.set({ bgTabs: updatedBgTabs }, () => {
              console.log(`Tab "${tab.title}" saved.`);
          });
          chrome.tabs.remove(tabId);
      });
  });
}