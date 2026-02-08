import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import { existsSync, mkdirSync } from "fs";
import { cleanRouter } from "./routes/clean.js";
import { translateRouter } from "./routes/translate.js";
import { ttsRouter } from "./routes/tts.js";
import { sttRouter } from "./routes/stt.js";
import { errorHandler } from "./middleware/errorHandler.js";

const uploadsDir = resolve(__dirname, "../uploads");
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

app.use("/api/clean", cleanRouter);
app.use("/api/translate", translateRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/stt", sttRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`ClearScan server running on http://localhost:${PORT}`);
});
