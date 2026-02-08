import { useState } from "react";

export function Popup() {
  const [isOpening, setIsOpening] = useState(false);

  const openSidePanel = () => {
    if (isOpening) return;
    setIsOpening(true);

    chrome.windows.getCurrent((window) => {
      chrome.runtime.sendMessage({
        action: "openSidePanel",
        windowId: window.id,
      }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          setIsOpening(false);
          return;
        }
        globalThis.close();
      });
    });
  };

  return (
    <div className="popup-shell relative min-w-[340px] max-w-[380px] overflow-hidden px-5 py-6 text-slate-800">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-8 -right-8 h-36 w-36 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-indigo-200/25 blur-3xl" />
      </div>

      <div className="relative p-4">
        <div className="mb-5 flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500/90">
              ClearScan
            </p>
            <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.02em] text-slate-900">
              Capture. Clean. Communicate.
            </h1>
          </div>
        </div>

        <p className="mb-7 max-w-[29ch] text-sm leading-[1.55] text-slate-600">
          AI-assisted tools to declutter scanned PDFs, translate content, listen
          on the go, or dictate back seamlessly.
        </p>

        <button
          onClick={openSidePanel}
          disabled={isOpening}
          className="popup-open-button w-full py-3.5 text-[15px]"
        >
          {isOpening ? "Opening..." : "Open Full Panel"}
        </button>
      </div>
    </div>
  );
}
