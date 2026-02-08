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
      className={`block w-full p-8 border-2 border-dashed rounded-lg text-center transition ${
        disabled
          ? "opacity-50 cursor-not-allowed border-gray-300"
          : "cursor-pointer border-blue-400 hover:border-blue-600 hover:bg-blue-50"
      }`}
    >
      <input
        type="file"
        accept=".pdf"
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <p className="text-gray-600 text-sm">
        Click or drag a scanned PDF here
      </p>
    </label>
  );
}
