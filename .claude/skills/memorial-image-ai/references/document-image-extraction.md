# Extracting Images From Documents (PDF/DOCX) & Locating Sub-Images on a Scanned Page

Two related but distinct capabilities from two source files.

## A. Pull embedded images out of a PDF or DOCX

Source: `website/services/documentImageExtractionService.ts`.

**Depends on:** `sharp` (validate/measure extracted images), `pdf-parse` v2 (`PDFParse` class, for PDF text), `mammoth` (DOCX text), `jszip` (DOCX is a zip — images live under `word/media/`). No AI/LLM call in this file at all — it's binary parsing, not generative.

```ts
/** Scan raw PDF bytes for JPEG start/end markers — a PDF's embedded images aren't in one place, this brute-forces it. */
function extractJpegFromPdfBuffer(pdfBuffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  const jpegStart = Buffer.from([0xFF, 0xD8, 0xFF]);
  const jpegEnd = Buffer.from([0xFF, 0xD9]);
  let searchStart = 0;
  while (searchStart < pdfBuffer.length) {
    const startIndex = pdfBuffer.indexOf(jpegStart, searchStart);
    if (startIndex === -1) break;
    const endIndex = pdfBuffer.indexOf(jpegEnd, startIndex + 3);
    if (endIndex === -1) { searchStart = startIndex + 3; continue; }
    const jpegData = pdfBuffer.slice(startIndex, endIndex + 2);
    if (jpegData.length > 1024 && jpegData.length < 50 * 1024 * 1024) images.push(jpegData); // filter icons & corrupt fragments
    searchStart = endIndex + 2;
  }
  return images;
}
// extractPngFromPdfBuffer is the same shape, keyed on the PNG signature (0x89 'PNG'...) and IEND chunk.

export async function extractImagesFromPdf(pdfBuffer: Buffer) {
  const sharp = (await import('sharp')).default;
  const images = [];
  for (const jpegData of extractJpegFromPdfBuffer(pdfBuffer)) {
    const meta = await sharp(jpegData).metadata();
    if ((meta.width || 0) < 50 || (meta.height || 0) < 50) continue; // skip icons/artifacts
    images.push({ data: jpegData, mimeType: 'image/jpeg', width: meta.width, height: meta.height });
  }
  // ...same loop for extractPngFromPdfBuffer(pdfBuffer)
  return images;
}

export async function extractImagesFromDocx(docxBuffer: Buffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(docxBuffer);
  const mediaFiles = Object.keys(zip.files).filter(n => n.startsWith('word/media/') && /\.(png|jpg|jpeg|gif|bmp|tiff?)$/i.test(n));
  const images = [];
  for (const mediaFile of mediaFiles) {
    const buffer = await zip.files[mediaFile].async('nodebuffer');
    images.push({ data: buffer, mimeType: 'image/jpeg' /* or map from extension */ });
  }
  return images;
}
```

This "binary marker scanning" approach is a pragmatic hack, not a real PDF-object-model parser — it works because JPEG/PNG have unambiguous byte signatures, but it will miss images stored in other formats inside the PDF (e.g. re-encoded JBIG2/CCITT scans) and can't tell you *where on the page* an image sits. For page position, use part B below.

## B. Find numbered photos/documents on a scanned memoir page + match captions (Gemini Vision)

Source: `website/services/survivorStoryImageService.ts`.

**Depends on:** `@google/genai` only, applied to a full-page screenshot/scan (not the raw PDF bytes from part A — this operates on a rendered page image).

```ts
import { GoogleGenAI, Type } from '@google/genai';

export async function analyzePageImages(pageImagePath: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { Referer: 'http://localhost:5173/' } } });
  const base64Data = require('fs').readFileSync(pageImagePath).toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ parts: [
      { inlineData: { mimeType: 'image/png', data: base64Data } },
      { text: `This page has numbered photographs/documents with captions at the bottom, numbered to match.
Identify each distinct photo/document (not the page itself), give its pixel bounding box, match it to its numbered caption, and extract people/location/date from that caption.` },
    ] }],
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          images: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
            imageNumber: { type: Type.NUMBER },
            description: { type: Type.STRING, description: 'Full caption text for this image' },
            boundingBox: { type: Type.OBJECT, properties: {
              x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, width: { type: Type.NUMBER }, height: { type: Type.NUMBER },
            }, required: ['x', 'y', 'width', 'height'] },
            imageType: { type: Type.STRING, description: 'photograph, document, certificate, map, etc.' },
            people: { type: Type.ARRAY, items: { type: Type.STRING } },
          } } },
        },
      },
    },
  });

  return JSON.parse(response.text);
}
```

**Why this beats manual cropping:** one Gemini call returns pixel bounding boxes *and* the matched caption *and* extracted entities in a single structured pass — no separate OCR step, no manual caption-to-photo matching. This is the pattern to reach for any "page has N sub-items with labels" layout (yearbook pages, contact sheets, multi-photo scans).

## Portability checklist

1. Bounding boxes from `analyzePageImages` are in pixels against the *input image's* resolution — if you resize the page image before sending it to Gemini, you must scale the returned box back up, or use the sibling `boundingBoxPercent` (0–100 of page dimensions) field the real type defines for resolution-independent cropping.
2. Both extraction paths (A and B) are complementary, not redundant: A gets you raw image bytes fast with no AI cost; B gets you page position + caption semantics at the cost of one Gemini call per page. Use A when you just need "all photos in this PDF" and B when you need "which photo goes with which caption."
