interface Props {
  src: string;
}

export function AudioPlayer({ src }: Props) {
  return (
    <div className="glass-card space-y-4 rounded-2xl border-white/65 p-5">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.14)]" />
        <span>Audio preview</span>
      </div>
      <audio controls src={src} className="w-full accent-sky-500" />
      <a
        href={src}
        download="clearscan-audio.mp3"
        className="ghost-button w-full justify-center"
      >
        Download audio
      </a>
    </div>
  );
}
