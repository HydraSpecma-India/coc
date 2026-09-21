"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flashlight, ImageUp, Loader2, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui";

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

async function getNativeDetector(): Promise<Detector | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: DetectorCtor & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
    if (!formats.includes("qr_code")) return null;
    return new BD({ formats: ["qr_code", "data_matrix", "code_128"].filter((f) => formats.includes(f)) });
  } catch {
    return null;
  }
}

/** Decode a QR code from a canvas using jsQR (fallback when BarcodeDetector is unavailable, e.g. iOS Safari). */
async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { default: jsQR } = await import("jsqr");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  return res?.data || null;
}

async function decodeImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const native = await getNativeDetector();
    if (native) {
      const r = await native.detect(img).catch(() => []);
      if (r[0]?.rawValue) return r[0].rawValue;
    }
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await decodeCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full-screen QR scanner (phone) / dialog (desktop).
 * Uses the rear camera via getUserMedia; decodes with the native BarcodeDetector
 * where available (Android Chrome, Edge) and falls back to jsQR (iOS Safari, Firefox).
 * If the camera cannot be opened (no HTTPS, permission denied) the user can take a photo instead.
 */
export function QrScanner(props: {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  // Mount the scanner only while open so each opening starts with fresh state and a fresh camera stream
  return props.open ? <QrScannerDialog {...props} /> : null;
}

function QrScannerDialog({
  title = "Scan QR code",
  subtitle,
  onClose,
  onResult,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [decodingPhoto, setDecodingPhoto] = useState(false);

  // keep the latest callback without restarting the camera when the parent re-renders
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const finish = useCallback(
    (text: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      try {
        navigator.vibrate?.(60);
      } catch {
        /* ignore */
      }
      stop();
      onResultRef.current(text);
    },
    [stop],
  );

  useEffect(() => {
    doneRef.current = false;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError(
          window.isSecureContext
            ? "This browser cannot open the camera. Use “Take photo of QR” below."
            : "Camera access needs a secure (https) connection. Use “Take photo of QR” below.",
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchAvailable(Boolean(caps.torch));
        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);
        setStatus("scanning");

        const native = await getNativeDetector();
        let last = 0;
        const tick = async (ts: number) => {
          if (cancelled || doneRef.current) return;
          if (ts - last > 220 && video.readyState >= 2) {
            last = ts;
            try {
              if (native) {
                const r = await native.detect(video);
                if (r[0]?.rawValue) return finish(r[0].rawValue);
              } else {
                const canvas = canvasRef.current!;
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                // Decode the central square (where the frame guide is) at reduced size for speed
                const side = Math.min(vw, vh) * 0.8;
                const size = Math.min(640, Math.round(side));
                canvas.width = size;
                canvas.height = size;
                canvas.getContext("2d", { willReadFrequently: true })?.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
                const text = await decodeCanvas(canvas);
                if (text) return finish(text);
              }
            } catch {
              /* keep scanning */
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const err = e as DOMException;
        setStatus("error");
        setError(
          err?.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in the browser settings, or take a photo of the QR code."
            : err?.name === "NotFoundError"
              ? "No camera was found on this device. Take or upload a photo of the QR code instead."
              : `Could not start the camera (${err?.message || err}). Take a photo of the QR code instead.`,
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [finish, stop]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      setTorchAvailable(false);
    }
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setDecodingPhoto(true);
    try {
      const text = await decodeImageFile(file);
      if (text) finish(text);
      else setError("No QR code was found in that photo. Hold the phone closer and make sure the code is sharp and well lit.");
    } finally {
      setDecodingPhoto(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/80 sm:items-center sm:p-6" role="dialog" aria-modal>
      <div className="relative flex w-full flex-col overflow-hidden bg-ink-900 text-white sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <QrCode className="h-5 w-5 text-brand-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-white/60">{subtitle}</div>}
          </div>
          <button
            onClick={() => {
              stop();
              onClose();
            }}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex-1 bg-black sm:aspect-square sm:flex-none">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative aspect-square w-[70%] max-w-[320px] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-brand-400" />
              </div>
            </div>
          )}
          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
              <Loader2 className="h-6 w-6 animate-spin" /> Opening camera…
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Camera className="h-10 w-10 text-white/40" />
              <p className="max-w-xs text-sm text-white/80">{error}</p>
            </div>
          )}
        </div>

        {status === "scanning" && error && <div className="bg-amber-500/20 px-4 py-2 text-xs text-amber-100">{error}</div>}

        <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {torchAvailable && (
            <Button variant="outline" size="md" onClick={toggleTorch} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Flashlight className="h-4 w-4" /> {torchOn ? "Light off" : "Light on"}
            </Button>
          )}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3.5 text-sm font-medium hover:bg-white/20">
            {decodingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            Take photo of QR
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>
        <p className="px-4 pb-4 text-center text-[11px] text-white/50">Point the camera at the QR code – it is read automatically.</p>
      </div>
    </div>
  );
}
