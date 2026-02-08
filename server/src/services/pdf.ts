import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Canvas, createCanvas } from "canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { preprocessPageImage } from "./image.js";
import { ocrPageImage } from "./gemini.js";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Point to the actual worker file in node_modules
const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(__dirname, "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
GlobalWorkerOptions.workerSrc = workerPath;

// Create a NodeCanvasFactory for pdfjs to use with node-canvas
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas,
      context,
    };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

interface CleanResult {
  pdfBuffer: Buffer;
  extractedText: string;
  pageCount: number;
}

export async function cleanPdf(pdfPath: string): Promise<CleanResult> {
  console.log(`[PDF] Starting cleanPdf for: ${pdfPath}`);
  
  // Stage 1: Extract pages as images
  const pdfData = new Uint8Array(await fs.readFile(pdfPath));
  console.log(`[PDF] Loaded PDF data: ${pdfData.length} bytes`);
  
  const pdfDoc = await getDocument({ 
    data: pdfData,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  }).promise;
  const numPages = pdfDoc.numPages;
  console.log(`[PDF] Document has ${numPages} pages`);
  
  const SCALE = 2.0;

  const pageImages: Buffer[] = [];
  const canvasFactory = new NodeCanvasFactory();
  
  for (let i = 1; i <= numPages; i++) {
    console.log(`[PDF] Processing page ${i}/${numPages}`);
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });
    console.log(`[PDF] Viewport size: ${viewport.width}x${viewport.height}`);
    
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
    console.log(`[PDF] Canvas created, rendering...`);
    
    const renderContext = {
      canvasContext: canvasAndContext.context,
      viewport: viewport,
      canvasFactory: canvasFactory as any,
    };

    try {
      await page.render(renderContext).promise;
      console.log(`[PDF] Page ${i} rendered successfully`);
    } catch (renderError: any) {
      console.error(`[PDF] Render error on page ${i}:`, renderError.message);
      console.error(`[PDF] Render error stack:`, renderError.stack);
      throw renderError;
    }
    
    pageImages.push(canvasAndContext.canvas.toBuffer("image/png"));
    canvasFactory.destroy(canvasAndContext);
  }

  // Stage 2: Preprocess + OCR each page
  const pageTexts: string[] = [];
  for (let i = 0; i < pageImages.length; i++) {
    const preprocessed = await preprocessPageImage(pageImages[i]);
    const text = await ocrPageImage(preprocessed);
    pageTexts.push(text);
    console.log(`[PDF] OCR page ${i + 1}/${numPages}: ${text.length} chars`);
  }

  // Stage 3: Reconstruct clean PDF
  const newPdf = await PDFDocument.create();
  const font = await newPdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await newPdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 11;
  const margin = 50;
  const lineHeight = fontSize * 1.4;

  for (const pageText of pageTexts) {
    const page = newPdf.addPage([612, 792]); // US Letter
    const { width, height } = page.getSize();
    const maxWidth = width - 2 * margin;
    const lines = wrapText(pageText, font, fontSize, maxWidth);

    let y = height - margin;
    let currentPage = page;

    for (const line of lines) {
      if (y < margin) {
        currentPage = newPdf.addPage([612, 792]);
        y = currentPage.getSize().height - margin;
      }

      currentPage.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });

      y -= lineHeight;
    }
  }

  const pdfBytes = await newPdf.save();

  return {
    pdfBuffer: Buffer.from(pdfBytes),
    extractedText: pageTexts.join("\n\n--- Page Break ---\n\n"),
    pageCount: numPages,
  };
}

function wrapText(
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number,
): string[] {
  const paragraphs = text.split("\n");
  const allLines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim() === "") {
      allLines.push("");
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) allLines.push(currentLine);
  }

  return allLines;
}
