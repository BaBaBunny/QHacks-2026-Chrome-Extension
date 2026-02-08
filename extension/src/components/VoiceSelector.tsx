import { VOICES } from "../lib/constants";

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
  const filtered = VOICES.filter((v) => v.language === language);
  const options = filtered.length > 0 ? filtered : VOICES;

  return (
    <select
      value={selectedVoice}
      onChange={(e) => onVoiceChange(e.target.value)}
      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
    >
      {options.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name} ({v.accent})
        </option>
      ))}
    </select>
  );
}
