import { Router } from "express";
import { uploadAudio } from "../middleware/upload.js";
import { execSync, spawnSync } from "child_process";
import fs from "fs/promises";

export const sttRouter = Router();

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3002";

// Check if ffmpeg is available
function checkFfmpeg(): boolean {
  try {
    const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

const HAS_FFMPEG = checkFfmpeg();

sttRouter.post("/", (req, res) => {
  uploadAudio(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No audio file uploaded" });
      return;
    }

    const language = (req.body?.language as string) || "en";

    try {
      let wavBuffer: Buffer;

      if (HAS_FFMPEG) {
        // Convert to PCM WAV 24kHz mono using ffmpeg
        const wavPath = req.file.path + ".wav";
        execSync(
          `ffmpeg -y -i "${req.file.path}" -ar 24000 -ac 1 -f wav "${wavPath}"`,
          { stdio: "pipe" },
        );
        wavBuffer = await fs.readFile(wavPath);
        await fs.unlink(wavPath).catch(() => {});
      } else {
        // No ffmpeg: let worker attempt conversion (requires ffmpeg on worker)
        console.warn("[STT] ffmpeg not found, sending original audio");
        wavBuffer = await fs.readFile(req.file.path);
      }

      // Forward to Python worker as multipart
      const formData = new FormData();
      const mimeType = HAS_FFMPEG ? "audio/wav" : req.file.mimetype || "application/octet-stream";
      const fileName = HAS_FFMPEG ? "audio.wav" : req.file.originalname || "audio.bin";
      formData.append("audio", new Blob([wavBuffer], { type: mimeType }), fileName);
      formData.append("language", language);

      const workerRes = await fetch(`${WORKER_URL}/stt`, {
        method: "POST",
        body: formData,
      });

      if (!workerRes.ok) {
        throw new Error(`Worker error: ${await workerRes.text()}`);
      }

      const result = await workerRes.json();

      // Clean up temp files
      await fs.unlink(req.file.path).catch(() => {});

      res.json(result);
    } catch (error: any) {
      // Clean up on error
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      res.status(500).json({ error: error.message || "STT failed" });
    }
  });
});
