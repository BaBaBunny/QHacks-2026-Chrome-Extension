import { useState } from "react";

interface Props {
  label: string;
  text: string;
  variant?: "default" | "extracted";
  onDownload?: () => Promise<void> | void;
  downloading?: boolean;
}

function fallbackCopy(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export function TranscriptViewer({
  label,
  text,
  variant = "default",
  onDownload,
  downloading = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleCopy = async () => {
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      } else {
        success = fallbackCopy(text);
      }
    } catch {
      success = fallbackCopy(text);
    }

    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };

  const handleDownload = async () => {
    if (!onDownload || downloading) return;

    try {
      await onDownload();
      setDownloaded(true);
      window.setTimeout(() => setDownloaded(false), 1400);
    } catch {
      setDownloaded(false);
    }
  };

  const contentClass =
    variant === "extracted"
      ? "max-h-[28rem] overflow-y-auto bg-white/45 px-5 py-4 text-lg leading-relaxed text-slate-700 whitespace-pre-wrap break-words select-text"
      : "max-h-64 overflow-y-auto bg-white/45 px-5 py-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap";

  return (
    <div className="glass-card overflow-hidden rounded-2xl border-white/65">
      <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" />
          {label}
        </span>
        <div className="flex items-center gap-2">
          {onDownload && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="ghost-button text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Saving..." : downloaded ? "Saved" : "Download"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="ghost-button text-xs font-semibold"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className={contentClass}>
        {text}
      </pre>
    </div>
  );
}
