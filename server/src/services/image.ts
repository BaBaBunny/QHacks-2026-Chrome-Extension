import sharp from "sharp";

/**
 * Preprocess a scanned page image for OCR:
 * grayscale → normalize contrast → sharpen → cap width at 2048px
 */
export async function preprocessPageImage(pngBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(pngBuffer).metadata();

  let pipeline = sharp(pngBuffer)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .png({ quality: 90 });

  if (metadata.width && metadata.width > 2048) {
    pipeline = pipeline.resize({ width: 2048, withoutEnlargement: true });
  }

  return pipeline.toBuffer();
}
