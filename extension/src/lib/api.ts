const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE as string | undefined) || "http://localhost:3001";
const WORKER_BASE = (import.meta.env.VITE_WORKER_BASE as string | undefined) || "http://localhost:3002";

function buildUrls(path: string): string[] {
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  const server = SERVER_BASE.replace(/\/+$/, "");
  const worker = WORKER_BASE.replace(/\/+$/, "");

  if (trimmedPath === "/clean" || trimmedPath === "/translate") {
    return [`${server}/api${trimmedPath}`, `${server}${trimmedPath}`];
  }

  if (trimmedPath === "/stt") {
    return [`${server}/api${trimmedPath}`, `${server}${trimmedPath}`];
  }

  if (trimmedPath === "/tts") {
    return [
      `${server}/api${trimmedPath}`,
      `${server}${trimmedPath}`,
      `${worker}${trimmedPath}`,
      `${worker}/api${trimmedPath}`,
    ];
  }

  return [`${server}/api${trimmedPath}`, `${server}${trimmedPath}`];
}

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await res.json().catch(() => ({}));
    const message =
      payload?.error ||
      payload?.detail ||
      payload?.message ||
      `Request failed (${res.status})`;
    return String(message);
  }

  const text = await res.text().catch(() => "");
  return text || `Request failed (${res.status})`;
}

async function requestWithFallback(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const urls = buildUrls(path);
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;

      if (res.status === 404) {
        errors.push(`404 at ${url}`);
        continue;
      }

      const message = await parseErrorMessage(res);
      // 4xx (except 404) is a user/input issue, not a fallback/retry issue.
      if (res.status >= 400 && res.status < 500) {
        const nonRetryableError = new Error(message);
        nonRetryableError.name = "NonRetryableError";
        throw nonRetryableError;
      }

      throw new Error(`${message} (${res.status})`);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (error?.name === "NonRetryableError") {
        throw new Error(message);
      }
      errors.push(`${url}: ${message}`);
    }
  }

  throw new Error(
    [
      `Unable to reach backend. Tried: ${errors.join(" | ")}`,
      "Start services: server (port 3001) and worker (port 3002).",
    ].join(" "),
  );
}

export async function cleanPdf(
  file: File,
): Promise<{ pdf: string; text: string; pageCount: number }> {
  const formData = new FormData();
  formData.append("pdf", file);

  const res = await requestWithFallback("/clean", {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const res = await requestWithFallback("/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sourceLang, targetLang }),
  });
  const data = await res.json();
  return data.translated;
}

export async function translatedTextToPdf(
  text: string,
  targetLang: string,
): Promise<Blob> {
  const res = await requestWithFallback("/translate/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });
  return res.blob();
}

export async function textToSpeech(
  text: string,
  voiceId?: string,
  language?: string,
): Promise<Blob> {
  const res = await requestWithFallback("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId, language, format: "mp3" }),
  });
  return res.blob();
}

export async function speechToText(
  audioBlob: Blob,
  sourceLang?: string,
  targetLang?: string,
): Promise<{ transcript: string; translated: string }> {
  const formData = new FormData();
  const fileName = audioBlob.type === "audio/wav" ? "recording.wav" : "recording.webm";
  formData.append("audio", audioBlob, fileName);
  if (sourceLang) {
    formData.append("language", sourceLang);
    formData.append("sourceLang", sourceLang);
  }
  if (targetLang) formData.append("targetLang", targetLang);

  const res = await requestWithFallback("/stt", {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  return {
    transcript: String(data?.transcript || ""),
    translated: String(data?.translated || data?.transcript || ""),
  };
}
