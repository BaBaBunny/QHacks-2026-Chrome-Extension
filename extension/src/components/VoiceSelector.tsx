import { LANGUAGES, VOICES } from "../lib/constants";

interface Props {
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  language: string;
}

export function VoiceSelector({
  selectedVoice,
  onVoiceChange,
  language,
}: Props) {
  void language;
  const languageNames = new Map(LANGUAGES.map((l) => [l.code, l.name]));

  return (
    <select
      value={selectedVoice}
      onChange={(e) => onVoiceChange(e.target.value)}
      className="glass-input py-2.5"
    >
      {VOICES.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name} ({languageNames.get(v.language) ?? v.language} - {v.accent})
        </option>
      ))}
    </select>
  );
}
