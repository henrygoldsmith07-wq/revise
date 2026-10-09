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
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Cleared inside the async path (once a render actually succeeds), not
        // synchronously in the effect body, so a page change re-renders rather
        // than cascading.
        if (!cancelled) setError(null);
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
        const doc = await loadingTask.promise;
        if (cancelled) { await loadingTask.destroy().catch(() => undefined); return; }
        const safePage = Math.min(Math.max(1, page), doc.numPages);
        const pdfPage = await doc.getPage(safePage);
        if (cancelled) { await loadingTask.destroy().catch(() => undefined); return; }
        const viewport = pdfPage.getViewport({ scale: 1.0 });
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          // The canvas element itself is part of the render contract in this
          // pdfjs version: it sizes the backing store.
          if (ctx) await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        pdfPage.cleanup();
        await loadingTask.destroy().catch(() => undefined);
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
