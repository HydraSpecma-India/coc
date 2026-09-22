import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getCocDocumentById } from "@/lib/db/repositories/coc";
import { CocDetailClient } from "./detail-client";
import { workflowOf } from "@/lib/workflow/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "COC Document Detail" };

export default async function CocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const result = await getCocDocumentById(id);

  if (!result) notFound();
  // COCs still in (or stopped in) the quality inspection workflow have no certificate yet
  const wf = workflowOf(result.doc);
  if (wf && wf.state !== "ISSUED" && !result.doc.generated_pdf_path) redirect(`/coc/inspection/${id}`);
  // payload prepared by production is internal – never send the raw photos to the detail page
  const values = result.values.filter((v) => v.field_name !== "__workflow_payload");

  return <CocDetailClient doc={result.doc} steps={result.steps} values={values} />;
}
