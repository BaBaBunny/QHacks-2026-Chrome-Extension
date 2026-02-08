import { LANGUAGES } from "../lib/constants";

interface Props {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (lang: string) => void;
  onTargetChange: (lang: string) => void;
}

export function LanguageSelector({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
}: Props) {
  return (
    <div className="glass-card flex items-center gap-2.5 rounded-2xl border-white/65 p-2.5">
      <select
        value={sourceLang}
        onChange={(e) => onSourceChange(e.target.value)}
        className="glass-input flex-1"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <span className="px-1 text-slate-500 text-base">-&gt;</span>
      <select
        value={targetLang}
        onChange={(e) => onTargetChange(e.target.value)}
        className="glass-input flex-1"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
