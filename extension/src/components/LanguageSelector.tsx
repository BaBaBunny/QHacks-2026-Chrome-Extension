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
    <div className="flex gap-2 items-center">
      <select
        value={sourceLang}
        onChange={(e) => onSourceChange(e.target.value)}
        className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <span className="text-gray-400 text-sm">&rarr;</span>
      <select
        value={targetLang}
        onChange={(e) => onTargetChange(e.target.value)}
        className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
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
