browser.runtime.onInstalled.addListener(() => {
  // Create a context menu item for saving the selected tab
  browser.contextMenus.create({
      id: "saveTab",
      title: "Save to Tab Manager",
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

function getFaviconUrl(tabUrl) {
  try {
      const url = new URL(tabUrl);
      return `${url.origin}/favicon.ico`;
  } catch (error) {
      console.error("Invalid URL:", tabUrl, error);
      return '';
  }
}
// Function to save the selected tab
function saveSelectedTab(tabId, selectionText) {
  browser.tabs.get(tabId, (tab) => {
      const tabToSave = {
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
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