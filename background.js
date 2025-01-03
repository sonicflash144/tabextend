const CHROME_STRING = 'chrome';
const excludedPrefixes = [
    `${CHROME_STRING}://`,
    'edge://',
    'opera://',
    'vivaldi://',
    'brave://',
    'moz-extension://',
    'about:',
    'file://',
    'safari-web-extension://'
];

function isValidUrl(url) {
    return !excludedPrefixes.some(prefix => url.toLowerCase().startsWith(prefix));
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "saveTab",
        title: "Save to Tabs Magic",
        contexts: ["page", "selection"],
        visible: false // Start hidden
    });
});

// Update context menu visibility when tabs are updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url) {
        chrome.contextMenus.update("saveTab", {
            visible: isValidUrl(tab.url)
        });
    }
});

chrome.tabs.onActivated.addListener(({tabId}) => {
    chrome.tabs.get(tabId, (tab) => {
        if (tab.url) {
            chrome.contextMenus.update("saveTab", {
                visible: isValidUrl(tab.url)
            });
        }
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

function getFaviconUrl(tabUrl) {
  try {
      const url = new URL(tabUrl);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
  } catch (error) {
      console.error("Invalid favicon URL:", tabUrl, error);
      return '';
  }
}
// Function to save the selected tab
function saveSelectedTab(tabId, selectionText) {
  chrome.tabs.get(tabId, (tab) => {
      const tabToSave = {
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
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