interface Props {
  label: string;
  text: string;
}

export function TranscriptViewer({ label, text }: Props) {
  const handleCopy = () => navigator.clipboard.writeText(text);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gray-100 px-3 py-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-blue-600 hover:underline cursor-pointer"
        >
          Copy
        </button>
      </div>
      <pre className="p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto bg-white">
        {text}
      </pre>
    </div>
  );
}
