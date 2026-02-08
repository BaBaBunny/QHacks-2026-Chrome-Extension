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
  
  // Extract text from each page, filtering out off-page items and sorting by position
  const pageTexts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    // page.view gives [x1, y1, x2, y2] in PDF user-space coordinates
    // This matches the coordinate space of text item transforms
    const [viewX1, viewY1, viewX2, viewY2] = page.view;
    const textContent = await page.getTextContent();

    // Filter to only items within the visible page bounds
    const visibleItems = textContent.items.filter((item: any) => {
      if (!item.transform || !item.str) return false;
      const tx = item.transform[4];
      const ty = item.transform[5];
      return tx >= viewX1 && tx <= viewX2 && ty >= viewY1 && ty <= viewY2;
    });

    // Sort by position: top-to-bottom (descending ty), then left-to-right (ascending tx)
    visibleItems.sort((a: any, b: any) => {
      const ay = a.transform[5];
      const by = b.transform[5];
      // Group items into the same "line" if their y-coords are within 5 units
      if (Math.abs(ay - by) > 5) return by - ay; // higher y = earlier (top of page)
      return a.transform[4] - b.transform[4]; // left to right within same line
    });

    // Group items into lines based on y-proximity, then join
    const lines: string[] = [];
    let currentLineY = -Infinity;
    let currentLine: string[] = [];

    for (const item of visibleItems) {
      const ty = (item as any).transform[5];
      const str = (item as any).str;
      if (!str) continue;

      if (Math.abs(ty - currentLineY) > 5) {
        // New line
        if (currentLine.length > 0) {
          lines.push(currentLine.join(" "));
        }
        currentLine = [str];
        currentLineY = ty;
      } else {
        currentLine.push(str);
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.join(" "));
    }

    const pageText = lines.join("\n");
    pageTexts.push(pageText);
    console.log(`[PDF] Page ${i}: extracted ${pageText.length} chars (${lines.length} lines)`);
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
