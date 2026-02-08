import { useCallback } from "react";

interface Props {
  onUpload: (file: File) => void;
  disabled: boolean;
}

export function PdfUploader({ onUpload, disabled }: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
    },
    [onUpload],
  );

  return (
    <label
      className={`group relative block w-full overflow-hidden rounded-2xl border border-white/65 bg-white/55 p-8 text-center shadow-[0_12px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:border-slate-300/80 hover:bg-white/75"
      }`}
    >
      <input
        type="file"
        accept=".pdf"
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-slate-600 shadow-lg shadow-slate-300/40 transition group-hover:scale-105 group-hover:border-slate-300/80">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-6 w-6"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16V4m0 0 4 4m-4-4L8 8M6 12h-.5A2.5 2.5 0 0 0 3 14.5v2A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5v-2A2.5 2.5 0 0 0 18.5 12H18"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-900">
        Click or drag a scanned PDF here
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Secure upload | Optimized up to 25MB
      </p>
    </label>
  );
}
