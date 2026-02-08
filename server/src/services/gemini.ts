import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;
const MODEL = "gemini-2.0-flash";

function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

/**
 * OCR a single page image using Gemini's vision capability.
 */
export async function ocrPageImage(
  imageBuffer: Buffer,
  mimeType = "image/png",
): Promise<string> {
  const base64Image = imageBuffer.toString("base64");

  const response = await getAI().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          {
            text: `You are a precise OCR engine. Extract ALL text from this scanned document page.
Rules:
- Preserve paragraph breaks as double newlines
- Preserve headings, bullet points, and numbered lists
- Do NOT add any commentary, explanation, or markdown formatting
- If text is unclear, make your best guess and mark uncertain words with [?]
- Return ONLY the extracted text, nothing else`,
          },
        ],
      },
    ],
  });

  return response.text?.trim() || "";
}

/**
 * Translate text from source language to target language using Gemini.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const response = await getAI().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Translate the following text from ${sourceLang} to ${targetLang}.
Rules:
- Preserve all formatting (paragraphs, lists, headings)
- Translate naturally, not word-for-word
- Do NOT add any commentary or explanation
- Return ONLY the translated text

Text to translate:
${text}`,
          },
        ],
      },
    ],
  });

  return response.text?.trim() || "";
}
