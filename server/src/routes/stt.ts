import { Router } from "express";
import { uploadAudio } from "../middleware/upload.js";
import { spawnSync } from "child_process";
import fs from "fs/promises";
import { getWorkerEndpointUrls } from "../services/workerProxy.js";
import { translateText } from "../services/gemini.js";

export const sttRouter = Router();

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

function parseWorkerErrorPayload(payloadText: string): string {
  const trimmed = payloadText.trim();
  if (!trimmed) return "Worker request failed";
  try {
    const parsed = JSON.parse(trimmed);
    const message = parsed?.detail || parsed?.error || parsed?.message;
    return typeof message === "string" && message.trim() ? message.trim() : trimmed;
  } catch {
    return trimmed;
  }
}

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
    if (req.file.size === 0) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: "Uploaded audio is empty. Record at least 1 second and try again." });
      return;
    }

    const sourceLang = (req.body?.sourceLang as string) || (req.body?.language as string) || "en";
    const targetLang = (req.body?.targetLang as string) || sourceLang;

    try {
      const rawAudio = await fs.readFile(req.file.path);
      if (rawAudio.length < 256) {
        throw new Error("Recorded audio is too short or invalid. Please record for at least 1 second.");
      }
      let wavBuffer = rawAudio;

      if (HAS_FFMPEG) {
        // Convert from bytes via stdin so ffmpeg probes true content, not filename extension.
        const ffmpeg = spawnSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-y",
            "-i",
            "pipe:0",
            "-af",
            "highpass=f=80,lowpass=f=7600,dynaudnorm=f=150:g=15",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-f",
            "wav",
            "pipe:1",
          ],
          {
            input: rawAudio,
            maxBuffer: 50 * 1024 * 1024,
          },
        );

        if (ffmpeg.status !== 0 || !ffmpeg.stdout || ffmpeg.stdout.length === 0) {
          const stderr = ffmpeg.stderr?.toString("utf8").trim() || "Unknown ffmpeg error";
          throw new Error(`Audio conversion failed: ${stderr}`);
        }

        wavBuffer = Buffer.from(ffmpeg.stdout);
      } else {
        // No ffmpeg on server: let worker attempt conversion.
        console.warn("[STT] ffmpeg not found on server, forwarding original audio");
      }

      // Forward to Python worker as multipart
      const formData = new FormData();
      const mimeType = HAS_FFMPEG ? "audio/wav" : req.file.mimetype || "application/octet-stream";
      const fileName = HAS_FFMPEG ? "audio.wav" : req.file.originalname || "audio.bin";
      formData.append("audio", new Blob([wavBuffer], { type: mimeType }), fileName);
      formData.append("language", sourceLang);

      const workerUrls = getWorkerEndpointUrls("/stt");
      const workerErrors: string[] = [];
      let result: any = null;

      for (const workerUrl of workerUrls) {
        try {
          const workerRes = await fetch(workerUrl, {
            method: "POST",
            body: formData,
          });

          if (!workerRes.ok) {
            const workerMessage = parseWorkerErrorPayload(await workerRes.text());
            if (workerRes.status >= 400 && workerRes.status < 500 && workerRes.status !== 404) {
              throw new Error(workerMessage);
            }
            workerErrors.push(`${workerUrl}: ${workerMessage} (${workerRes.status})`);
            continue;
          }

          result = await workerRes.json();
          break;
        } catch (error: any) {
          workerErrors.push(`${workerUrl}: ${error?.message || "fetch failed"}`);
        }
      }

      if (!result) {
        throw new Error(`Unable to reach worker STT endpoint. Tried: ${workerErrors.join(" | ")}`);
      }

      // Clean up temp files
      await fs.unlink(req.file.path).catch(() => {});

      const transcript = String(result?.transcript || "").trim();
      if (!transcript) {
        res.json({
          transcript: "",
          translated: "",
          sourceLang,
          targetLang,
        });
        return;
      }

      if (targetLang !== sourceLang) {
        try {
          const translated = await translateText(transcript, sourceLang, targetLang);
          res.json({
            transcript,
            translated: translated.trim(),
            sourceLang,
            targetLang,
          });
          return;
        } catch (translationError) {
          console.warn("[STT] translation failed, returning transcript", translationError);
        }
      }

      res.json({
        transcript,
        translated: transcript,
        sourceLang,
        targetLang,
      });
    } catch (error: any) {
      // Clean up on error
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      const message = error?.message || "STT failed";
      const isClientInputError =
        message.includes("too short") ||
        message.includes("empty") ||
        message.includes("invalid") ||
        message.includes("Unsupported audio codec");
      res.status(isClientInputError ? 400 : 500).json({ error: message });
    }
  });
});
