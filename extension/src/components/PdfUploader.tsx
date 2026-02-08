import { useCallback, useRef } from "react";

interface Props {
  onUpload: (file: File) => void;
  disabled: boolean;
}

export function PdfUploader({ onUpload, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(file);
        // Reset the input so the same file can be selected again
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
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
        ref={inputRef}
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
