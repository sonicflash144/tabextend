browser.runtime.onInstalled.addListener(() => {
  // Create a context menu item for saving the selected tab
  browser.contextMenus.create({
      id: "saveTab",
      title: "Save to Tabs Magic",
      contexts: ["page", "selection"]
  });
});

browser.action.onClicked.addListener((tab) => {
  browser.tabs.create({ url: "newtab.html" });
});

// Listen for the context menu item click event
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveTab") {
      saveSelectedTab(tab.id, info.selectionText);
  }
});

// Function to save the selected tab
function saveSelectedTab(tabId, selectionText) {
  browser.tabs.get(tabId, (tab) => {
      const tabToSave = {
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl || '',
          id: tab.id,
          color: '#FFFFFF',
          note: selectionText || null
      };

      // Retrieve the previously saved tabs and add the new tab
      browser.storage.local.get(["bgTabs"], (data) => {
          let existingBgTabs = data.bgTabs || [];
          const updatedBgTabs = [...existingBgTabs, tabToSave];

          // Save the updated list of tabs
          browser.storage.local.set({ bgTabs: updatedBgTabs }, () => {
              console.log("Tab saved.", tabToSave);
          });
          browser.tabs.remove(tabId);
      });
  });
}