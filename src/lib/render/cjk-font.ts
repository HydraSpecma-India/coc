import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * Chinese (and other non-Latin) text in PDFs.
 *
 * The COC templates use the standard Helvetica font, which can only draw Western characters
 * (English, Swedish, Danish …). When a COC contains Chinese text – e.g. a Chinese inspector's
 * name or initials – Noto Sans SC (GB2312 character set) is embedded with only the characters
 * the COC uses, and every text Helvetica cannot draw is drawn with it automatically.
 */

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "NotoSansSC-GB2312.ttf");
const SUBSET_WASM = path.join(process.cwd(), "assets", "wasm", "harfbuzz-subset.wasm");
let fontBytes: Promise<Uint8Array> | null = null;
let hb: Promise<HbExports> | null = null;

/* ── font subsetting with HarfBuzz (WebAssembly) ─────────────────────────────────
 * The Chinese font is 2.5 MB; a COC only needs the few characters it uses. pdf-lib's own
 * subsetting drops CJK glyphs, so the subset is made here and embedded as a complete font. */
type HbExports = {
  memory: WebAssembly.Memory;
  malloc(n: number): number;
  free(p: number): void;
  hb_blob_create(data: number, len: number, mode: number, user: number, destroy: number): number;
  hb_blob_destroy(b: number): void;
  hb_blob_get_data(b: number, len: number): number;
  hb_blob_get_length(b: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(f: number): void;
  hb_face_reference_blob(f: number): number;
  hb_set_add(set: number, cp: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(i: number): void;
  hb_subset_input_unicode_set(i: number): number;
  hb_subset_input_set(i: number, which: number): number;
  hb_subset_or_fail(face: number, input: number): number;
};

async function harfbuzz(): Promise<HbExports> {
  hb ??= readFile(SUBSET_WASM).then(async (buf) => (await WebAssembly.instantiate(buf, {})).instance.exports as unknown as HbExports);
  return hb;
}

/** A font containing only the code points of `chars` (plus basic Latin). */
async function subsetFont(font: Uint8Array, chars: Set<number>): Promise<Uint8Array> {
  const x = await harfbuzz();
  const ptr = x.malloc(font.byteLength);
  new Uint8Array(x.memory.buffer).set(font, ptr);
  const blob = x.hb_blob_create(ptr, font.byteLength, 2 /* writable */, 0, 0);
  const face = x.hb_face_create(blob, 0);
  x.hb_blob_destroy(blob);
  const input = x.hb_subset_input_create_or_fail();
  if (!input) throw new Error("HarfBuzz subset input failed");
  const set = x.hb_subset_input_unicode_set(input);
  for (let cp = 0x20; cp < 0x7f; cp++) x.hb_set_add(set, cp);
  for (const cp of chars) x.hb_set_add(set, cp);
  // drop OpenType layout / vertical tables: pdf-lib lays out plain horizontal text itself and
  // mixes up the advance widths of Latin digits when these tables are present
  const drop = x.hb_subset_input_set(input, 3 /* HB_SUBSET_SETS_DROP_TABLE_TAG */);
  for (const tag of ["GSUB", "GPOS", "GDEF", "BASE", "vhea", "vmtx", "VORG", "STAT"]) {
    x.hb_set_add(drop, ((tag.charCodeAt(0) << 24) | (tag.charCodeAt(1) << 16) | (tag.charCodeAt(2) << 8) | tag.charCodeAt(3)) >>> 0);
  }
  const sub = x.hb_subset_or_fail(face, input);
  x.hb_subset_input_destroy(input);
  if (!sub) {
    x.hb_face_destroy(face);
    x.free(ptr);
    throw new Error("HarfBuzz subset failed");
  }
  const outBlob = x.hb_face_reference_blob(sub);
  const off = x.hb_blob_get_data(outBlob, 0);
  const len = x.hb_blob_get_length(outBlob);
  const out = new Uint8Array(x.memory.buffer, off, len).slice(); // copy out of wasm memory
  x.hb_blob_destroy(outBlob);
  x.hb_face_destroy(sub);
  x.hb_face_destroy(face);
  x.free(ptr);
  return out;
}

function collectChars(value: unknown, into: Set<number>, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    if (value.length < 20000) for (const ch of value) into.add(ch.codePointAt(0)!);
  } else if (Array.isArray(value)) value.forEach((v) => collectChars(v, into, depth + 1));
  else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (k !== "dataBase64" && k !== "signatureBase64") collectChars(v, into, depth + 1);
  }
}
const fallbackByDoc = new WeakMap<PDFDocument, PDFFont>();

/** Characters Helvetica (WinAnsi) can draw: ASCII, Latin-1 and a few typographic signs. */
const WESTERN = /^[\u0000-ÿ–—‘’‚“”„†‡•…‰‹›€™ŒœŠšŸŽžƒˆ˜]*$/;

export function needsFallbackFont(text: string): boolean {
  return !WESTERN.test(text);
}

/** Does any string inside `value` (object, array, string) need the Chinese font? */
export function containsNonWestern(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false;
  if (typeof value === "string") return value.length < 20000 && needsFallbackFont(value);
  if (Array.isArray(value)) return value.some((v) => containsNonWestern(v, depth + 1));
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "dataBase64" || k === "signatureBase64") continue; // images
      if (containsNonWestern(v, depth + 1)) return true;
    }
  }
  return false;
}

/** Embeds the Chinese font into `doc` when `content` has characters Helvetica cannot draw. */
export async function ensureFallbackFont(doc: PDFDocument, content: unknown): Promise<boolean> {
  if (fallbackByDoc.has(doc)) return true;
  if (!containsNonWestern(content)) return false;
  installPatches();
  fontBytes ??= readFile(FONT_FILE).then((b) => new Uint8Array(b));
  doc.registerFontkit(fontkit);
  const full = await fontBytes;
  const chars = new Set<number>();
  collectChars(content, chars);
  let bytes = full;
  try {
    bytes = await subsetFont(full, chars);
  } catch {
    bytes = full; // still correct, only a bigger PDF
  }
  const font = await doc.embedFont(bytes, { subset: false });
  fallbackByDoc.set(doc, font);
  return true;
}

export function fallbackFontFor(font: PDFFont): PDFFont | undefined {
  return fallbackByDoc.get(font.doc);
}

/* pdf-lib draws with one font per call. The patches swap in the Chinese font for a text that
 * Helvetica cannot encode – only for documents that registered it, so nothing else changes. */
let patched = false;
function installPatches() {
  if (patched) return;
  patched = true;
  const cannotDraw = (font: PDFFont | undefined, text: string) => {
    if (!font || !needsFallbackFont(text)) return false;
    return !fallbackByDoc.has(font.doc) ? false : fallbackByDoc.get(font.doc) !== font;
  };

  const origDraw = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (this: PDFPage, text: string, options: Parameters<PDFPage["drawText"]>[1] = {}) {
    const font = options.font;
    if (font && cannotDraw(font, String(text ?? ""))) {
      return origDraw.call(this, text, { ...options, font: fallbackByDoc.get(font.doc)! });
    }
    return origDraw.call(this, text, options);
  };

  const origWidth = PDFFont.prototype.widthOfTextAtSize;
  PDFFont.prototype.widthOfTextAtSize = function (this: PDFFont, text: string, size: number) {
    if (cannotDraw(this, String(text ?? ""))) return origWidth.call(fallbackByDoc.get(this.doc)!, text, size);
    return origWidth.call(this, text, size);
  };
}
