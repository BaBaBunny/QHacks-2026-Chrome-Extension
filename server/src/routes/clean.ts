import { Router, Request, Response } from "express";
import { uploadPdf } from "../middleware/upload.js";
import { cleanPdf } from "../services/pdf.js";
import fs from "fs/promises";

export const cleanRouter = Router();

cleanRouter.post("/", (req: Request, res: Response) => {
  uploadPdf(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No PDF file uploaded" });
      return;
    }

    try {
      console.log(`[CLEAN] Processing PDF: ${req.file.path}`);
      const result = await cleanPdf(req.file.path);

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        pdf: result.pdfBuffer.toString("base64"),
        text: result.extractedText,
        pageCount: result.pageCount,
      });
    } catch (error: any) {
      console.error('[CLEAN] Error processing PDF:', error);
      console.error('[CLEAN] Error stack:', error.stack);
      // Clean up on error too
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      res.status(500).json({ error: error.message || "PDF cleaning failed" });
    }
  });
});
