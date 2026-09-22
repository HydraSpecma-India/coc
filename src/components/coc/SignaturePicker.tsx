"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { api } from "@/lib/utils/fetcher";
import { SignatureDesigner } from "./SignatureDesigner";

interface StoredSignature {
  id: string;
  label: string | null;
  is_default: boolean;
  dataUrl?: string | null;
}

type Mode = "stored" | "auto" | "draw";

/** Stored signature, personal auto-signature or hand-drawn – returns a PNG data URL ("" = none). */
export function SignaturePicker({ userName, onChange }: { userName: string; onChange: (dataUrl: string) => void }) {
  const [mode, setModeState] = useState<Mode>("auto");
  const modeRef = useRef<Mode>("auto");
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const [stored, setStored] = useState<StoredSignature[]>([]);
  const [storedId, setStoredId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const autoUrl = useRef("");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let active = true;
    api<{ ok: boolean; signatures: StoredSignature[] }>("/api/signatures")
      .then((res) => {
        const list = (res.signatures || []).filter((s) => s.dataUrl);
        if (!active || !list.length) return;
        setStored(list);
        const def = list.find((s) => s.is_default) || list[0];
        setStoredId(def.id);
        setMode("stored");
        onChangeRef.current(def.dataUrl || "");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const pick = (m: Mode) => {
    setMode(m);
    if (m === "stored") onChange(stored.find((s) => s.id === storedId)?.dataUrl || "");
    if (m === "auto") onChange(autoUrl.current);
    if (m === "draw") {
      onChange("");
      window.setTimeout(clear, 0);
    }
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b2a6f";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current?.toDataURL("image/png") || "");
  };
  function clear() {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    onChange("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {stored.length > 0 && (
          <Button size="sm" variant={mode === "stored" ? "primary" : "outline"} onClick={() => pick("stored")} className="gap-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" /> Stored signature
          </Button>
        )}
        <Button size="sm" variant={mode === "auto" ? "primary" : "outline"} onClick={() => pick("auto")} className="gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" /> Auto-sign
        </Button>
        <Button size="sm" variant={mode === "draw" ? "primary" : "outline"} onClick={() => pick("draw")} className="gap-1.5 text-xs">
          <PenTool className="h-3.5 w-3.5" /> Draw
        </Button>
      </div>

      {mode === "stored" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {stored.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStoredId(s.id);
                onChange(s.dataUrl || "");
              }}
              className={`rounded-lg border-2 bg-white p-2 text-left ${storedId === s.id ? "border-brand-500" : "border-ink-200"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.dataUrl || ""} alt={s.label || "Signature"} className="h-16 w-full object-contain" />
              <div className="mt-1 text-[11px] text-ink-600">{s.label || "Signature"}{s.is_default ? " · default" : ""}</div>
            </button>
          ))}
        </div>
      )}

      {mode === "auto" && (
        <SignatureDesigner
          userName={userName}
          onChange={(url) => {
            autoUrl.current = url;
            if (modeRef.current === "auto") onChange(url);
          }}
        />
      )}

      {mode === "draw" && (
        <div className="rounded-lg border-2 border-dashed border-ink-300 bg-ink-50/50 p-3">
          <canvas
            ref={canvasRef}
            width={480}
            height={160}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            style={{ width: "100%", maxWidth: 480, height: "auto", aspectRatio: "3 / 1" }}
            className="mx-auto block cursor-crosshair touch-none rounded border border-ink-200 bg-white"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
            <span>Sign with mouse, pen or finger.</span>
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-ink-600 hover:text-red-600">
              <Eraser className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
