export function Popup() {
  const openSidePanel = () => {
    chrome.windows.getCurrent((window) => {
      chrome.runtime.sendMessage({
        action: "openSidePanel",
        windowId: window.id,
      });
    });
    globalThis.close();
  };

  return (
    <div className="w-[320px] p-4 bg-white">
      <h1 className="text-lg font-bold text-gray-900 mb-1">ClearScan</h1>
      <p className="text-sm text-gray-600 mb-4">
        Clean scanned PDFs, translate, listen, and dictate.
      </p>
      <button
        onClick={openSidePanel}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer"
      >
        Open Full Panel
      </button>
    </div>
  );
}
