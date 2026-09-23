/**
 * PDF feature boundary. The normal revision route never imports the PDF
 * parser; the parser is loaded only after a student selects a PDF.
 */

export function chunkNotes(...args: Parameters<(typeof import("./pdf"))["chunkNotes"]>) {
  // Keep the small text splitter available without loading pdf.js itself.
  return import("./pdf").then(({ chunkNotes: split }) => split(...args));
}

export async function extractPdfText(...args: Parameters<(typeof import("./pdf"))["extractPdfText"]>) {
  const { extractPdfText: extract } = await import("./pdf");
  return extract(...args);
}
