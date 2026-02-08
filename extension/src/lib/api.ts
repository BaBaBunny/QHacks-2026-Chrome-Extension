const API_BASE = "http://localhost:3001/api";

export async function cleanPdf(
  file: File,
): Promise<{ pdf: string; text: string; pageCount: number }> {
  const formData = new FormData();
  formData.append("pdf", file);

  const res = await fetch(`${API_BASE}/clean`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error || "Clean failed");
  return res.json();
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sourceLang, targetLang }),
  });
  if (!res.ok)
    throw new Error((await res.json()).error || "Translation failed");
  const data = await res.json();
  return data.translated;
}

export async function textToSpeech(
  text: string,
  voiceId?: string,
  language?: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId, language, format: "mp3" }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "TTS failed");
  return res.blob();
}

export async function speechToText(
  audioBlob: Blob,
  language?: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  if (language) formData.append("language", language);

  const res = await fetch(`${API_BASE}/stt`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error || "STT failed");
  const data = await res.json();
  return data.transcript;
}
