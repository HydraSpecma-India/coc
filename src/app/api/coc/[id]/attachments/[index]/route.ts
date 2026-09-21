import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { getCocDocumentById, getGeneratedPdfBytes } from "@/lib/db/repositories/coc";
import type { StoredAttachment } from "@/lib/coc-inputs/types";

/** Download one captured supplier document of a COC (stored as PDF). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  await requireSession();
  const { id, index } = await params;
  const result = await getCocDocumentById(id);
  const list = (result?.values.find((v) => v.field_name === "__attachments")?.value_json ?? []) as StoredAttachment[];
  const att = Array.isArray(list) ? list.find((a) => String(a.index) === index) : undefined;
  if (!result || !att?.storagePath) return new NextResponse("Attachment not found", { status: 404 });
  try {
    const bytes = await getGeneratedPdfBytes(att.storagePath);
    const fileName = `${result.doc.coc_number || "coc"}-attachment-${att.index + 1}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return new NextResponse(`Failed to fetch attachment: ${(err as Error).message}`, { status: 500 });
  }
}
