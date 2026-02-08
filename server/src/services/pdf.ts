import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs/promises";

interface CleanResult {
  pdfBuffer: Buffer;
  extractedText: string;
  pageCount: number;
}

export async function cleanPdf(pdfPath: string): Promise<CleanResult> {
  console.log(`[PDF] Starting cleanPdf for: ${pdfPath}`);
  
  // Stage 1: Extract text from PDF using pdfjs (text-only, no rendering)
  const pdfBuffer = await fs.readFile(pdfPath);
  console.log(`[PDF] Loaded PDF data: ${pdfBuffer.length} bytes`);
  
  const pdfDoc = await getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  
  const numPages = pdfDoc.numPages;
  console.log(`[PDF] Document has ${numPages} pages`);
  
  // Extract text from each page (no canvas rendering!)
  const pageTexts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    pageTexts.push(pageText);
    console.log(`[PDF] Page ${i}: extracted ${pageText.length} chars`);
  }
  
  const extractedText = pageTexts.join("\n\n");
  console.log(`[PDF] Total extracted: ${extractedText.length} chars`);

  // Stage 2: Create a clean, searchable PDF from the extracted text
  const newPdf = await PDFDocument.create();
  const font = await newPdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const margin = 50;
  const lineHeight = fontSize * 1.4;

  // Split text into pages (roughly)
  const linesPerPage = Math.floor((792 - 2 * margin) / lineHeight);
  const paragraphs = extractedText.split("\n");
  
  let currentPageLines: string[] = [];
  
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      currentPageLines.push("");
      continue;
    }
    
    const wrapped = wrapText(paragraph, font, fontSize, 612 - 2 * margin);
    currentPageLines.push(...wrapped);
    
    // Create new page if we have enough lines
    if (currentPageLines.length >= linesPerPage) {
      createPage(newPdf, currentPageLines, font, fontSize, margin, lineHeight);
      currentPageLines = [];
    }
  }
  
  // Add remaining lines
  if (currentPageLines.length > 0) {
    createPage(newPdf, currentPageLines, font, fontSize, margin, lineHeight);
  }

  const pdfBytes = await newPdf.save();

  return {
    pdfBuffer: Buffer.from(pdfBytes),
    extractedText: extractedText,
    pageCount: numPages,
  };
}

function createPage(
  pdf: PDFDocument,
  lines: string[],
  font: any,
  fontSize: number,
  margin: number,
  lineHeight: number
) {
  const page = pdf.addPage([612, 792]); // US Letter
  const { height } = page.getSize();
  
  let y = height - margin;
  
  for (const line of lines) {
    if (y < margin) break; // Stop if we run out of space
    
    page.drawText(line, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
  }
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
