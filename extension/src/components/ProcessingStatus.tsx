interface Props {
  status: string;
  error: string;
  isProcessing: boolean;
}

export function ProcessingStatus({ status, error, isProcessing }: Props) {
  if (!status && !error) return null;

  if (error) {
    return (
      <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div
      className={`p-3 rounded-lg text-sm ${
        isProcessing ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
      }`}
    >
      {isProcessing && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
      )}
      {status}
    </div>
  );
}
