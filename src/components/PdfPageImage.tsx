"use client";

// One PDF page rendered to a canvas thumbnail, for comparing an extracted
// question against the uploaded paper. Rendered on demand from the uploaded
// bytes (never uploaded anywhere); the parent owns page navigation.

import { useEffect, useRef, useState } from "react";

export function PdfPageImage({ bytes, page, className }: { bytes: ArrayBuffer; page: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
        if (cancelled) { await doc.destroy().catch(() => undefined); return; }
        const safePage = Math.min(Math.max(1, page), doc.numPages);
        const pdfPage = await doc.getPage(safePage);
        if (cancelled) { await doc.destroy().catch(() => undefined); return; }
        const viewport = pdfPage.getViewport({ scale: 1.0 });
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (ctx) await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        }
        pdfPage.cleanup();
        await doc.destroy().catch(() => undefined);
      } catch {
        if (!cancelled) setError("That page could not be rendered.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, page]);

  if (error) return <p className="text-xs text-ink3" role="status">{error}</p>;
  return <canvas ref={canvasRef} className={className ?? "w-full rounded-lg border border-line"} aria-label={`Paper page ${page}`} />;
}
