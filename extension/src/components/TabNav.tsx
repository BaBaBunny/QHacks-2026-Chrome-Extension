type Tab = "clean" | "translate" | "tts" | "stt";

const TABS: { id: Tab; label: string }[] = [
  { id: "clean", label: "Clean PDF" },
  { id: "translate", label: "Translate" },
  { id: "tts", label: "Listen" },
  { id: "stt", label: "Dictate" },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function TabNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="flex border-b border-gray-200 bg-white">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition cursor-pointer ${
            activeTab === tab.id
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
