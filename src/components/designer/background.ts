"use client";

/**
 * Renders a page of an uploaded background asset (PDF or image) to an
 * HTMLImageElement for the designer. PDF pages are rasterised with PDF.js at
 * 2× the page size for crisp zooming. Results are cached per asset/page.
 */
const cache = new Map<string, Promise<HTMLImageElement>>();

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded"));
    img.src = url;
  });
}

export function loadBackgroundImage(assetId: string, mimeType: string, pageIndex: number): Promise<HTMLImageElement> {
  const key = `${assetId}:${pageIndex}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const p = (async () => {
    let url = `/api/assets/${assetId}`;
    if (
      assetId === "00000000-0000-0000-0000-000000000001" ||
      assetId === "builtin-hydraspecma" ||
      assetId === "default"
    ) {
      url = "/templates/hydraspecma-coc-template.pdf";
    }

    if (mimeType !== "application/pdf" && !url.endsWith(".pdf")) {
      return imageFromUrl(url);
    }

    const pdfjs = await loadPdfjs();

    // Fetch array buffer to guarantee cross-browser compatibility and avoid range request failures
    let arrayBuffer: ArrayBuffer;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } catch {
      // Fallback to bundled HydraSpecma template PDF
      const fallbackRes = await fetch("/templates/hydraspecma-coc-template.pdf");
      if (!fallbackRes.ok) throw new Error("Could not load background template PDF");
      arrayBuffer = await fallbackRes.arrayBuffer();
    }

    const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const targetPage = Math.min(Math.max(1, pageIndex + 1), doc.numPages);
    const page = await doc.getPage(targetPage);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return imageFromUrl(canvas.toDataURL("image/png"));
  })();

  cache.set(key, p);
  p.catch((err) => {
    console.error("loadBackgroundImage error:", err);
    cache.delete(key);
  });
  return p;
}

/** Generic asset (logo/image) loader with cache. */
export function loadAssetImage(assetId: string): Promise<HTMLImageElement> {
  const key = `img:${assetId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = imageFromUrl(`/api/assets/${assetId}`);
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
