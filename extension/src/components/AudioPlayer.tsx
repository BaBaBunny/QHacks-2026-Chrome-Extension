interface Props {
  src: string;
}

export function AudioPlayer({ src }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <audio controls src={src} className="w-full" />
      <a
        href={src}
        download="clearscan-audio.mp3"
        className="block text-center text-sm text-blue-600 hover:underline mt-2"
      >
        Download Audio
      </a>
    </div>
  );
}
