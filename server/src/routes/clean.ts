import { Router, Request, Response } from "express";
import { uploadPdf } from "../middleware/upload.js";
import fs from "fs/promises";

export const cleanRouter = Router();

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3002";

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
      
      // Read the uploaded PDF file
      const pdfBuffer = await fs.readFile(req.file.path);
      
      // Forward to Python worker as multipart
      const formData = new FormData();
      formData.append(
        "pdf",
        new Blob([pdfBuffer], { type: "application/pdf" }),
        req.file.originalname || "document.pdf"
      );

      console.log(`[CLEAN] Forwarding to worker: ${WORKER_URL}/pdf/clean`);
      const workerRes = await fetch(`${WORKER_URL}/pdf/clean`, {
        method: "POST",
        body: formData,
      });

      if (!workerRes.ok) {
        const errorText = await workerRes.text();
        throw new Error(`Worker error: ${errorText}`);
      }

      const result = await workerRes.json();

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        pdf: result.pdf,
        text: result.text,
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
