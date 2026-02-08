import { Router } from "express";
import { getWorkerEndpointUrls } from "../services/workerProxy.js";

export const ttsRouter = Router();

ttsRouter.post("/", async (req, res) => {
  try {
    const { text, voiceId, voice_id, language, format } = req.body;

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const workerUrls = getWorkerEndpointUrls("/tts");
    const workerErrors: string[] = [];

    for (const workerUrl of workerUrls) {
      try {
        const workerRes = await fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice_id: voice_id || voiceId || null,
            language: language || "en",
            format: format || "mp3",
          }),
        });

        if (!workerRes.ok) {
          const err = await workerRes.text();
          workerErrors.push(`${workerUrl}: ${err || `HTTP ${workerRes.status}`}`);
          continue;
        }

        const audioBuffer = Buffer.from(await workerRes.arrayBuffer());
        const contentType = workerRes.headers.get("content-type") || "audio/wav";

        res.set({ "Content-Type": contentType });
        res.send(audioBuffer);
        return;
      } catch (error: any) {
        workerErrors.push(`${workerUrl}: ${error?.message || "fetch failed"}`);
      }
    }

    throw new Error(`Unable to reach worker TTS endpoint. Tried: ${workerErrors.join(" | ")}`);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "TTS failed" });
  }
});
