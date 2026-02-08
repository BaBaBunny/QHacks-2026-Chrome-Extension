import { Router } from "express";

export const ttsRouter = Router();

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3002";

ttsRouter.post("/", async (req, res) => {
  try {
    const { text, voiceId, language, format } = req.body;

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const workerRes = await fetch(`${WORKER_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_id: voiceId || null,
        language: language || "en",
        format: format || "mp3",
      }),
    });

    if (!workerRes.ok) {
      const err = await workerRes.text();
      throw new Error(`Worker error: ${err}`);
    }

    const audioBuffer = Buffer.from(await workerRes.arrayBuffer());
    const contentType = format === "wav" ? "audio/wav" : "audio/mpeg";

    res.set({ "Content-Type": contentType });
    res.send(audioBuffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "TTS failed" });
  }
});
