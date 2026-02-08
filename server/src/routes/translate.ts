import { Router } from "express";
import { translateText } from "../services/gemini.js";

export const translateRouter = Router();

translateRouter.post("/", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;

    if (!text || !targetLang) {
      res.status(400).json({ error: "text and targetLang are required" });
      return;
    }

    const translated = await translateText(
      text,
      sourceLang || "auto",
      targetLang,
    );
    res.json({ translated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Translation failed" });
  }
});
