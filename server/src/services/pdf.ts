import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { existsSync } from "fs";
import fs from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CleanResult {
  pdfBuffer: Buffer;
  extractedText: string;
  pageCount: number;
}

const LETTER_PAGE_WIDTH = 612;
const LETTER_PAGE_HEIGHT = 792;
const DEFAULT_MARGIN = 50;
const DEFAULT_FONT_SIZE = 11;

export async function textToPdf(text: string): Promise<Buffer> {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const pdfBytes = await buildTextPdf(normalizedText || " ");
  return Buffer.from(pdfBytes);
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

  // Extract text from each page (no canvas rendering)
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

  return {
    pdfBuffer: await textToPdf(extractedText),
    extractedText,
    pageCount: numPages,
  };
}

async function buildTextPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const font = await loadPdfFont(pdf);
  const fontSize = DEFAULT_FONT_SIZE;
  const margin = DEFAULT_MARGIN;
  const lineHeight = fontSize * 1.4;
  const linesPerPage = Math.floor((LETTER_PAGE_HEIGHT - 2 * margin) / lineHeight);
  const maxWidth = LETTER_PAGE_WIDTH - 2 * margin;
  const paragraphs = text.split("\n");

  let currentPageLines: string[] = [];

  const pushLine = (line: string) => {
    currentPageLines.push(line);
    if (currentPageLines.length === linesPerPage) {
      createPage(pdf, currentPageLines, font, fontSize, margin, lineHeight);
      currentPageLines = [];
    }
  };

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      pushLine("");
      continue;
    }

    const wrapped = wrapText(paragraph, font, fontSize, maxWidth);
    for (const line of wrapped) {
      pushLine(line);
    }
  }

  if (currentPageLines.length > 0 || pdf.getPageCount() === 0) {
    createPage(
      pdf,
      currentPageLines.length > 0 ? currentPageLines : [""],
      font,
      fontSize,
      margin,
      lineHeight,
    );
  }

  return pdf.save();
}

async function loadPdfFont(pdf: PDFDocument): Promise<PDFFont> {
  const fontPath = resolve(
    __dirname,
    "../../assets/fonts/Noto Sans Regular.ttf",
  );

  if (existsSync(fontPath)) {
    console.log(`[PDF] Using Unicode font: ${fontPath}`);
    return pdf.embedFont(await fs.readFile(fontPath), { subset: true });
  }

  console.warn("[PDF] Unicode font not found, falling back to Helvetica");
  return pdf.embedFont(StandardFonts.Helvetica);
}

function createPage(
  pdf: PDFDocument,
  lines: string[],
  font: PDFFont,
  fontSize: number,
  margin: number,
  lineHeight: number,
) {
  const page = pdf.addPage([LETTER_PAGE_WIDTH, LETTER_PAGE_HEIGHT]); // US Letter
  const { height } = page.getSize();

  let y = height - margin;

  for (const line of lines) {
    if (y < margin) break;

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
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const paragraphs = sanitizeForFont(text, font).split("\n");
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

function sanitizeForFont(text: string, font: PDFFont): string {
  let result = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    // Skip null and combining diacritical marks (U+0300-U+036F)
    // These include strikethrough, underline, overlay marks that don't render in PDFs
    if (char === "\u0000" || (code >= 0x0300 && code <= 0x036f)) {
      continue;
    }
    try {
      font.encodeText(char);
      result += char;
    } catch {
      result += "?";
    }
  }

  return result;
}
