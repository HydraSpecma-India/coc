"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, FileText, Loader2, Paperclip, RotateCw, Trash2, Wand2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Input } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import {
  MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES,
  type AttachmentSettings, type AttachmentUpload,
} from "@/lib/coc-inputs/types";

export interface CapturedDoc {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  /** data URL for images (preview); undefined for PDFs */
  previewUrl?: string;
  /** base64 payload without data: prefix */
  dataBase64: string;
  sizeBytes: number;
  caption: string;
}

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.82;

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

const b64Size = (b64: string) => Math.floor((b64.length * 3) / 4);

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // honours EXIF orientation of phone photos
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  return img;
}

/** Resize to ≤2000px, re-encode as JPEG, optionally boost contrast for paper documents. */
export async function processImage(src: Blob, opts: { enhance: boolean; rotate?: number }): Promise<string> {
  const bmp = await loadBitmap(src);
  const w0 = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
  const h0 = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const rot = ((opts.rotate ?? 0) % 360 + 360) % 360;
  const canvas = document.createElement("canvas");
  canvas.width = rot === 90 || rot === 270 ? h : w;
  canvas.height = rot === 90 || rot === 270 ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  if (opts.enhance) ctx.filter = "grayscale(1) contrast(1.35) brightness(1.08)";
  ctx.drawImage(bmp as CanvasImageSource, -w / 2, -h / 2, w, h);
  if ("close" in bmp && typeof bmp.close === "function") bmp.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function toAttachmentUploads(docs: CapturedDoc[]): AttachmentUpload[] {
  return docs.map((d) => ({ name: d.name, mimeType: d.mimeType, caption: d.caption || undefined, dataBase64: d.dataBase64 }));
}

/**
 * Capture paper quality documents / supplier test reports with the phone camera
 * (or pick images / PDFs on desktop). Images are compressed on the device before upload.
 */
export function DocumentCapture({
  settings,
  docs,
  onChange,
  showErrors,
}: {
  settings: AttachmentSettings;
  docs: CapturedDoc[];
  onChange: (docs: CapturedDoc[]) => void;
  showErrors?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhance, setEnhance] = useState(true);

  const total = docs.reduce((n, d) => n + d.sizeBytes, 0);
  const needed = settings.required ? Math.max(1, settings.minCount) : settings.minCount;
  const missing = Math.max(0, needed - docs.length);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: CapturedDoc[] = [];
    let running = total;
    try {
      for (const file of Array.from(files)) {
        if (docs.length + added.length >= MAX_ATTACHMENTS) {
          toast.error(`Maximum ${MAX_ATTACHMENTS} documents per COC`);
          break;
        }
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
        if (!isPdf && !isImage) {
          toast.error("Unsupported file", `${file.name} – use a photo or a PDF.`);
          continue;
        }
        let doc: CapturedDoc;
        if (isPdf) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            toast.error("PDF too large", `${file.name} is over ${Math.round(MAX_ATTACHMENT_BYTES / 1048576)} MB.`);
            continue;
          }
          const dataUrl = await readAsDataUrl(file);
          const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          doc = { id: uid(), name: file.name, mimeType: "application/pdf", dataBase64: b64, sizeBytes: b64Size(b64), caption: "" };
        } else {
          let dataUrl: string;
          try {
            dataUrl = await processImage(file, { enhance });
          } catch {
            toast.error("Could not read image", `${file.name} – try taking the photo again (HEIC photos need a recent browser).`);
            continue;
          }
          const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          const stamp = new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
          doc = {
            id: uid(),
            name: file.name && file.name !== "image.jpg" ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : `Document ${docs.length + added.length + 1}.jpg`,
            mimeType: "image/jpeg",
            previewUrl: dataUrl,
            dataBase64: b64,
            sizeBytes: b64Size(b64),
            caption: `Captured ${stamp}`,
          };
        }
        if (running + doc.sizeBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          toast.error("Attachments too large", `Total size would exceed ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / 1048576)} MB.`);
          break;
        }
        running += doc.sizeBytes;
        added.push(doc);
      }
      if (added.length) {
        onChange([...docs, ...added]);
        toast.success(added.length === 1 ? "Document added" : `${added.length} documents added`);
      }
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rotate = async (d: CapturedDoc) => {
    if (!d.previewUrl) return;
    const blob = await (await fetch(d.previewUrl)).blob();
    const dataUrl = await processImage(blob, { enhance: false, rotate: 90 });
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    onChange(docs.map((x) => (x.id === d.id ? { ...x, previewUrl: dataUrl, dataBase64: b64, sizeBytes: b64Size(b64) } : x)));
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= docs.length) return;
    const next = [...docs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div data-missing={showErrors && missing > 0 ? "true" : undefined}>
    <Card>
      <CardHeader
        title={settings.label || "Supplier documents"}
        description={settings.hint || "Photograph paper quality documents and supplier test reports. They are saved with the COC and merged into the certificate PDF."}
        actions={
          <Badge tone={missing ? (showErrors ? "danger" : "warning") : docs.length ? "success" : "neutral"}>
            {docs.length} document{docs.length === 1 ? "" : "s"}
            {needed ? ` · min ${needed}` : ""}
          </Badge>
        }
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60 sm:h-10"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Take photo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60 sm:h-10"
          >
            <Paperclip className="h-4 w-4" /> Upload file
          </button>
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs text-ink-600 sm:col-span-1 sm:ml-2">
            <input type="checkbox" className="h-4 w-4 accent-ink-900" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
            <Wand2 className="h-3.5 w-3.5 text-brand-600" /> Document mode (sharpen text, black &amp; white)
          </label>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>

        {showErrors && missing > 0 && (
          <p className="text-xs font-semibold text-red-600">
            Please capture at least {needed} document{needed === 1 ? "" : "s"} ({missing} more).
          </p>
        )}

        {docs.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {docs.map((d, i) => (
              <li key={d.id} className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <div className="relative flex h-40 items-center justify-center bg-ink-100">
                  {d.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.previewUrl} alt={d.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-ink-500">
                      <FileText className="h-10 w-10" />
                      <span className="text-[11px] font-semibold">PDF</span>
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-ink-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">#{i + 1}</span>
                </div>
                <div className="space-y-2 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-ink-500">
                    <span className="truncate font-medium text-ink-700" title={d.name}>{d.name}</span>
                    <span className="shrink-0">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
                  </div>
                  <Input
                    value={d.caption}
                    placeholder="Caption, e.g. Supplier material certificate"
                    onChange={(e) => onChange(docs.map((x) => (x.id === d.id ? { ...x, caption: e.target.value } : x)))}
                    className="h-9 text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <IconBtn title="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Move down" onClick={() => move(i, 1)} disabled={i === docs.length - 1}><ArrowDown className="h-4 w-4" /></IconBtn>
                    {d.previewUrl && <IconBtn title="Rotate" onClick={() => rotate(d)}><RotateCw className="h-4 w-4" /></IconBtn>}
                    <IconBtn title="Remove" className="ml-auto text-red-600" onClick={() => onChange(docs.filter((x) => x.id !== d.id))}>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {docs.length > 0 && (
          <p className="text-[11px] text-ink-400">
            Total {(total / 1048576).toFixed(1)} MB · documents are appended to the certificate PDF in this order.
          </p>
        )}
      </CardBody>
    </Card>
    </div>
  );
}

function IconBtn({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn("flex h-9 w-9 items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 disabled:opacity-30", className)}
      {...props}
    >
      {children}
    </button>
  );
}
