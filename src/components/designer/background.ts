"use client";

/**
 * Renders a page of an uploaded background asset (PDF or image) to an
 * HTMLImageElement for the designer. PDF pages are rasterised with PDF.js at
 * 2× the page size for crisp zooming. Results are cached per asset/page.
 */
const cache = new Map<string, Promise<HTMLImageElement>>();

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
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
    const url = `/api/assets/${assetId}`;
    if (mimeType !== "application/pdf") return imageFromUrl(url);

    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ url }).promise;
    const page = await doc.getPage(Math.min(pageIndex + 1, doc.numPages));
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return imageFromUrl(canvas.toDataURL("image/png"));
  })();

  cache.set(key, p);
  p.catch(() => cache.delete(key));
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
