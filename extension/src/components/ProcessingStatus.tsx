interface Props {
  status: string;
  error: string;
  isProcessing: boolean;
}

export function ProcessingStatus({ status, error, isProcessing }: Props) {
  if (!status && !error) return null;

  const tone = error
    ? "border-red-200 bg-red-50/80 text-red-700"
    : isProcessing
      ? "border-sky-200 bg-sky-50/80 text-sky-700"
      : "border-emerald-200 bg-emerald-50/80 text-emerald-700";

  const icon = error ? "!" : isProcessing ? "..." : "OK";

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 text-sm shadow-[0_10px_20px_rgba(15,23,42,0.08)] backdrop-blur-xl ${tone}`}
      role="status"
    >
      {isProcessing ? (
        <span className="relative inline-flex h-9 w-9 items-center justify-center">
          <span className="absolute h-9 w-9 rounded-full border-2 border-sky-300 border-t-transparent animate-spin" />
          <span className="h-2 w-2 rounded-full bg-sky-500" />
        </span>
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/75 text-base text-slate-600">
          {icon}
        </span>
      )}
      <div className="leading-snug">
        <p className="font-semibold">{error ? "Something went wrong" : status}</p>
        {error && (
          <p className="text-xs text-red-600/80">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
