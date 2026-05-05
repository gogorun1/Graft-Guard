chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId === undefined) {
    return;
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
});
