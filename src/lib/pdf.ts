"use client";

// PDF text extraction, in the browser. Notes arrive as PDFs far more often
// than as plain text, and shipping them to a server to be parsed would break
// the offline-first promise for the one feature students reach for most.
//
// pdf.js only extracts text that is *in* the file. A scanned or photographed
// PDF has none, so the caller is told so explicitly and can fall back to OCR
// rather than silently generating cards from an empty string.

export interface PdfExtraction {
  text: string;
  pages: number;
  /** True when the PDF carries no extractable text — almost always a scan. */
  looksScanned: boolean;
}

/** Below this many characters per page, treat the document as a scan. */
const SCAN_THRESHOLD = 40;
const MAX_PAGES = 60;

export async function extractPdfText(file: File | ArrayBuffer): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist");
  // Served from our own origin: the app's CSP blocks CDNs, and an installed
  // PWA has no network to fetch one from.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  const chunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) chunks.push(text);
    page.cleanup();
  }

  await loadingTask.destroy();

  const joined = chunks.join("\n\n");
  return {
    text: joined,
    pages: doc.numPages,
    looksScanned: joined.length < SCAN_THRESHOLD * pageCount,
  };
}

/** Rough token-ish budget per AI request, so long notes are split sensibly. */
const CHUNK_CHARS = 6000;

/**
 * Split notes for generation, cutting at paragraph boundaries so a definition
 * is never severed halfway through and turned into two useless cards.
 */
export function chunkNotes(text: string, size = CHUNK_CHARS): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > size && current) {
      chunks.push(current.trim());
      current = "";
    }
    // A single paragraph longer than a whole chunk is split on sentences.
    if (paragraph.length > size) {
      for (const sentence of paragraph.match(/[^.!?]+[.!?]+|\S+$/g) ?? [paragraph]) {
        if (current.length + sentence.length > size && current) {
          chunks.push(current.trim());
          current = "";
        }
        current += sentence;
      }
      continue;
    }
    current += (current ? "\n\n" : "") + paragraph;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
