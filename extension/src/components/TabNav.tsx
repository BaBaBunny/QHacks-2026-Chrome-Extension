type Tab = "clean" | "translate" | "tts" | "stt";

const TABS: { id: Tab; label: string }[] = [
  { id: "clean", label: "Clean PDF" },
  { id: "translate", label: "Translate" },
  { id: "tts", label: "Listen" },
  { id: "stt", label: "Transcribe" },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function TabNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="mx-5 mt-1 glass-card grid grid-cols-4 gap-1 rounded-2xl border-white/55 px-1 py-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`min-w-0 w-full overflow-hidden rounded-xl px-1.5 py-2.5 text-[clamp(0.72rem,1.7vw,0.95rem)] leading-tight font-semibold tracking-[-0.01em] text-center transition-all cursor-pointer ${
            activeTab === tab.id
              ? "glass-strong border border-white/70 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/45"
          }`}
        >
          <span className="block truncate whitespace-nowrap">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
