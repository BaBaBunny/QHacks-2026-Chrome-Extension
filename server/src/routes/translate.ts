import { Router } from "express";
import { translateText } from "../services/gemini.js";
import { textToPdf } from "../services/pdf.js";

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

translateRouter.post("/pdf", async (req, res) => {
  try {
    const { text, targetLang } = req.body;

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const pdfBuffer = await textToPdf(String(text));
    const safeTargetLang = String(targetLang || "translated")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"translated-${safeTargetLang || "text"}.pdf\"`,
    );
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "PDF generation failed" });
  }
});
