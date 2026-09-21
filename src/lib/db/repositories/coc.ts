import "server-only";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { getActiveConfig } from "@/lib/config";
import { logger } from "@/lib/logging/logger";

export interface COCDocumentRow {
  id: string;
  coc_number: string | null;
  template_id: string;
  template_version_id: string;
  template_version_number: number;
  production_order: string;
  item_number: string | null;
  item_description: string | null;
  serial_number: string | null;
  customer_po: string | null;
  sales_order: string | null;
  sales_line: string | null;
  customer_account: string | null;
  quantity: number | null;
  status: string;
  d365_context_json: Record<string, unknown> | null;
  generated_pdf_path: string | null;
  pdf_sha256: string | null;
  sharepoint_url: string | null;
  sharepoint_item_id: string | null;
  d365_record_key: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_by: string | null;
  completed_at: string | null;
}

export interface COCProcessStepRow {
  id: string;
  coc_document_id: string;
  step: "D365_FETCH" | "VALIDATE" | "RENDER" | "SP_UPLOAD" | "D365_UPDATE" | "TEAMS_WEBHOOK";
  status: "STARTED" | "OK" | "FAILED";
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  details: Record<string, unknown> | null;
}

export async function reserveNextCocNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const config = await getActiveConfig();
  const pattern = config.app.numberFormat || "COC-{yyyy}-{seq:4}";

  const sb = supabaseAdmin();
  // Fetch and increment sequence in coc_number_sequences
  const { data: existing } = await sb
    .from("coc_number_sequences")
    .select("last_value")
    .eq("year", year)
    .maybeSingle();

  const nextVal = (existing?.last_value || 0) + 1;

  const { error } = await sb.from("coc_number_sequences").upsert({
    year,
    last_value: nextVal,
  });

  if (error) {
    logger.error("Failed to increment coc_number_sequences", { error: error.message });
  }

  // Format pattern
  return pattern
    .replace("{yyyy}", String(year))
    .replace(/\{seq:(\d+)\}/, (_, len) => String(nextVal).padStart(Number(len), "0"));
}

export async function createCocDocument(input: {
  template_id: string;
  template_version_id: string;
  template_version_number: number;
  production_order: string;
  item_number: string;
  item_description: string;
  customer_po?: string;
  sales_order?: string;
  sales_line?: string;
  customer_account?: string;
  quantity?: number;
  serial_number?: string;
  d365_context_json?: Record<string, unknown>;
  userId?: string;
}): Promise<COCDocumentRow> {
  const sb = supabaseAdmin();
  const cocNumber = await reserveNextCocNumber();

  const { data, error } = await sb
    .from("coc_documents")
    .insert({
      coc_number: cocNumber,
      template_id: input.template_id,
      template_version_id: input.template_version_id,
      template_version_number: input.template_version_number,
      production_order: input.production_order,
      item_number: input.item_number,
      item_description: input.item_description,
      customer_po: input.customer_po || null,
      sales_order: input.sales_order || null,
      sales_line: input.sales_line || null,
      customer_account: input.customer_account || null,
      quantity: input.quantity || 1,
      serial_number: input.serial_number || null,
      status: "DRAFT",
      d365_context_json: input.d365_context_json || {},
      created_by: input.userId && /^[0-9a-f-]{36}$/i.test(input.userId) ? input.userId : null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as COCDocumentRow;
}

export async function logProcessStep(
  cocId: string,
  step: COCProcessStepRow["step"],
  status: COCProcessStepRow["status"],
  details?: Record<string, unknown>,
  error?: string
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("coc_process_steps").insert({
    coc_document_id: cocId,
    step,
    status,
    details: details || {},
    error: error || null,
    finished_at: status !== "STARTED" ? new Date().toISOString() : null,
  });
}

export async function uploadGeneratedPdf(cocNumber: string, pdfBytes: Uint8Array): Promise<string> {
  const sb = supabaseAdmin();
  const storagePath = `${new Date().getFullYear()}/${cocNumber}.pdf`;

  const { error } = await sb.storage.from(Buckets.cocGenerated).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) throw error;
  return storagePath;
}

/** Store one captured supplier document (converted to PDF – the bucket only accepts PDFs). */
export async function uploadAttachmentPdf(cocNumber: string, index: number, name: string, pdfBytes: Uint8Array): Promise<string> {
  const safeName = name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "document";
  const safeCoc = cocNumber.replace(/[^A-Za-z0-9._-]+/g, "_");
  const storagePath = `attachments/${new Date().getFullYear()}/${safeCoc}/${String(index + 1).padStart(2, "0")}-${safeName}.pdf`;
  const { error } = await supabaseAdmin().storage.from(Buckets.cocGenerated).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return storagePath;
}

export async function getGeneratedPdfUrl(storagePath: string): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage
    .from(Buckets.cocGenerated)
    .createSignedUrl(storagePath, 60 * 60); // 1 hour

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not create signed PDF URL");
  }
  return data.signedUrl;
}

export async function getGeneratedPdfBytes(storagePath: string): Promise<Uint8Array> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.from(Buckets.cocGenerated).download(storagePath);
  if (error || !data) throw new Error(error?.message || "Failed to download PDF");
  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function listCocDocuments(opts: {
  query?: string;
  productionOrder?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<COCDocumentRow[]> {
  const sb = supabaseAdmin();
  let q = sb.from("coc_documents").select("*").order("created_at", { ascending: false });

  if (opts.productionOrder) {
    q = q.eq("production_order", opts.productionOrder);
  }

  if (opts.query) {
    q = q.or(
      `coc_number.ilike.%${opts.query}%,production_order.ilike.%${opts.query}%,item_number.ilike.%${opts.query}%,customer_po.ilike.%${opts.query}%`
    );
  }

  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 20) - 1);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as COCDocumentRow[];
}

export async function getCocDocumentById(id: string): Promise<{
  doc: COCDocumentRow;
  steps: COCProcessStepRow[];
  values: Array<{ field_name: string; value_text: string | null; value_json?: unknown }>;
} | null> {
  const sb = supabaseAdmin();
  const { data: doc, error } = await sb.from("coc_documents").select("*").eq("id", id).maybeSingle();
  if (error || !doc) return null;

  const [{ data: steps }, { data: values }] = await Promise.all([
    sb.from("coc_process_steps").select("*").eq("coc_document_id", id).order("started_at", { ascending: true }),
    sb.from("coc_document_values").select("field_name, value_text, value_json").eq("coc_document_id", id),
  ]);

  return {
    doc: doc as COCDocumentRow,
    steps: (steps || []) as COCProcessStepRow[],
    values: values || [],
  };
}
