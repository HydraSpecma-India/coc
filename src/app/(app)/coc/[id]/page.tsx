import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getCocDocumentById } from "@/lib/db/repositories/coc";
import { CocDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "COC Document Detail" };

export default async function CocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const result = await getCocDocumentById(id);

  if (!result) notFound();

  return <CocDetailClient doc={result.doc} steps={result.steps} values={result.values} />;
}
