import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { getCocDocumentById, getGeneratedPdfBytes } from "@/lib/db/repositories/coc";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const result = await getCocDocumentById(id);
  if (!result || !result.doc.generated_pdf_path) {
    return new NextResponse("PDF not found", { status: 404 });
  }

  try {
    const bytes = await getGeneratedPdfBytes(result.doc.generated_pdf_path);
    const fileName = `${result.doc.coc_number || "certificate"}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return new NextResponse(`Failed to fetch PDF: ${(err as Error).message}`, { status: 500 });
  }
}
