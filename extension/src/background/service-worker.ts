chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "openSidePanel") {
    chrome.sidePanel.open({ windowId: message.windowId });
    sendResponse({ ok: true });
  }
});
