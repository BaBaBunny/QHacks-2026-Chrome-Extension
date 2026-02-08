export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
] as const;

export const VOICES = [
  { id: "YTpq7expH9539ERJ", name: "Emma", language: "en", accent: "US" },
  { id: "LFZvm12tW_z0xfGo", name: "Kent", language: "en", accent: "US" },
  { id: "jtEKaLYNn6iif5PR", name: "Sydney", language: "en", accent: "US" },
  { id: "ubuXFxVQwVYnZQhy", name: "Eva", language: "en", accent: "GB" },
  { id: "b35yykvVppLXyw_l", name: "Elise", language: "fr", accent: "FR" },
  { id: "-uP9MuGtBqAvEyxI", name: "Mia", language: "de", accent: "DE" },
  { id: "B36pbz5_UoWn4BDl", name: "Valentina", language: "es", accent: "MX" },
  { id: "pYcGZz9VOo4n2ynh", name: "Alice", language: "pt", accent: "BR" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
