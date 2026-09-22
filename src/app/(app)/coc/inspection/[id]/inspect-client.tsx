"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, Eye, FileCheck, GitBranch, History, PenTool, Undo2, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Field, PageHeader, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { MeasurementSections, initMeasureValues, missingRequired, photoUploads, toMeasurementEntries, type MeasureValues } from "@/components/coc/MeasurementSections";
import { DocumentCapture, toAttachmentUploads, uid, type CapturedDoc } from "@/components/coc/DocumentCapture";
import { SignaturePicker } from "@/components/coc/SignaturePicker";
import { PdfViewer } from "@/components/coc/PdfViewer";
import { EMPTY_INPUT_CONFIG, formatPrinted, type TemplateInputConfig } from "@/lib/coc-inputs/types";
import type { CreateCocInput } from "@/lib/coc/issue";
import type { WorkflowInfo } from "@/lib/workflow/types";

interface InspectionData {
  document: {
    id: string;
    coc_number: string | null;
    status: string;
    production_order: string;
    item_number: string | null;
    item_description: string | null;
    serial_number: string | null;
    sales_order: string | null;
    sales_line: string | null;
    customer_po: string | null;
    quantity: number | null;
    template_id: string;
    template_version_id: string;
    company: string;
    created_at: string;
  };
  workflow: WorkflowInfo;
  payload: CreateCocInput | null;
  canInspect: boolean;
  canWithdraw: boolean;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

/** Values and documents prepared by production → editable state for the inspector. */
function prefill(cfg: TemplateInputConfig, payload: CreateCocInput | null): { values: MeasureValues; docs: CapturedDoc[] } {
  const values = initMeasureValues(cfg.sections);
  for (const m of payload?.measurements ?? []) {
    if (values[m.key] && m.type !== "photo") values[m.key] = { value: m.value ?? "", source: m.source ?? "manual" };
  }
  const docs: CapturedDoc[] = [];
  for (const a of payload?.attachments ?? []) {
    if (a.fieldKey && values[a.fieldKey]) {
      values[a.fieldKey] = {
        ...values[a.fieldKey],
        value: "Photo attached",
        photo: { dataBase64: a.dataBase64, previewUrl: `data:image/jpeg;base64,${a.dataBase64}`, mimeType: "image/jpeg" },
      };
    } else if (!a.fieldKey) {
      docs.push({
        id: uid(),
        name: a.name,
        mimeType: a.mimeType,
        previewUrl: a.mimeType === "application/pdf" ? undefined : `data:${a.mimeType};base64,${a.dataBase64}`,
        dataBase64: a.dataBase64,
        sizeBytes: Math.floor((a.dataBase64.length * 3) / 4),
        caption: a.caption || "",
      });
    }
  }
  return { values, docs };
}

export function InspectClient({ id, userName }: { id: string; userName: string }) {
  const router = useRouter();
  const [data, setData] = useState<InspectionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputConfig, setInputConfig] = useState<TemplateInputConfig>(EMPTY_INPUT_CONFIG);
  const [values, setValues] = useState<MeasureValues>({});
  const [docs, setDocs] = useState<CapturedDoc[]>([]);
  const [signature, setSignature] = useState("");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<InspectionData & { ok: boolean }>(`/api/workflow/inspections/${id}`);
      let cfg = EMPTY_INPUT_CONFIG;
      try {
        const c = await api<{ ok: boolean; config: TemplateInputConfig }>(`/api/templates/${res.document.template_id}/inputs`);
        cfg = c.config ?? EMPTY_INPUT_CONFIG;
      } catch {
        /* template without data-entry fields */
      }
      const pre = prefill(cfg, res.payload);
      setInputConfig(cfg);
      setValues(pre.values);
      setDocs(pre.docs);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const attachmentsNeeded = inputConfig.attachments.enabled
    ? inputConfig.attachments.required ? Math.max(1, inputConfig.attachments.minCount) : inputConfig.attachments.minCount
    : 0;

  const extras = useMemo(
    () => ({
      measurements: toMeasurementEntries(inputConfig.sections, values),
      attachments: [...photoUploads(inputConfig.sections, values), ...toAttachmentUploads(docs)],
      measurementValues: Object.fromEntries(
        inputConfig.sections
          .flatMap((s) => s.fields)
          .filter((f) => f.type !== "photo")
          .map((f) => [f.key, formatPrinted(f, values[f.key]?.value ?? "")] as const)
          .filter(([, v]) => v),
      ) as Record<string, string>,
    }),
    [inputConfig, values, docs],
  );

  const problems = (): string[] => {
    const out: string[] = [];
    const missing = missingRequired(inputConfig.sections, values);
    if (missing.length) out.push(`${missing.length} required field(s) missing: ${missing.slice(0, 4).map((f) => f.label).join(", ")}${missing.length > 4 ? "…" : ""}`);
    if (docs.length < attachmentsNeeded) out.push(`Capture at least ${attachmentsNeeded} supplier document(s)`);
    if (!signature) out.push("Sign the certificate");
    return out;
  };

  const preview = async () => {
    if (!data) return;
    setPreviewing(true);
    try {
      const p = data.payload ?? ({} as CreateCocInput);
      const keys = new Set(extras.measurements.map((m) => m.key));
      const base = Object.fromEntries(Object.entries(p.manualValues || {}).filter(([k]) => !keys.has(k)));
      const res = await fetch("/api/coc/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...p,
          templateId: data.document.template_id,
          templateVersionId: data.document.template_version_id,
          manualValues: { ...base, ...extras.measurementValues },
          measurements: extras.measurements,
          attachments: extras.attachments,
          signatureBase64: signature || undefined,
        }),
      });
      if (!res.ok) throw new Error("Preview generation failed");
      const url = URL.createObjectURL(await res.blob());
      setPreviewUrl(url);
    } catch (e) {
      toast.error("Preview error", (e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const issue = async () => {
    const list = problems();
    if (list.length) {
      setShowErrors(true);
      toast.error("Complete the inspection first", list.join(" • "));
      window.setTimeout(() => document.querySelector<HTMLElement>("[data-missing='true']")?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
      return;
    }
    setIssuing(true);
    try {
      const res = await api<{ ok: boolean; cocNumber: string; documentId: string }>(`/api/workflow/inspections/${id}/issue`, {
        method: "POST",
        json: { ...extras, signatureBase64: signature, note: note.trim() || undefined },
      });
      toast.success(`Issued ${res.cocNumber}`, "The COC is now in Completed COCs.");
      router.push(`/coc/${res.documentId}`);
    } catch (e) {
      toast.error("Could not issue the COC", (e as Error).message);
      void load();
    } finally {
      setIssuing(false);
    }
  };

  const reject = async (withdraw: boolean) => {
    if (rejectReason.trim().length < 3) return toast.error("Enter a reason (at least 3 characters)");
    setRejecting(true);
    try {
      await api(`/api/workflow/inspections/${id}/reject`, { method: "POST", json: { reason: rejectReason.trim(), withdraw } });
      toast.success(withdraw ? "Submission withdrawn" : "COC rejected – production can create it again");
      router.push("/coc/inspection");
    } catch (e) {
      toast.error("Could not reject", (e as Error).message);
    } finally {
      setRejecting(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/coc/inspection" className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900"><ArrowLeft className="h-3.5 w-3.5" /> Pending Inspection</Link>
        <Alert tone="danger" title="Could not open this inspection">{error}</Alert>
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-ink-500">Loading inspection…</div>;

  const { document: doc, workflow: wf, payload } = data;
  const state = wf.state;
  const readOnly = !data.canInspect;
  const wfLabel: Record<string, { text: string; tone: "warning" | "brand" | "danger" | "success" }> = {
    PENDING_INSPECTION: { text: "Waiting for inspection", tone: "warning" },
    ISSUING: { text: "Being issued", tone: "brand" },
    REJECTED: { text: "Rejected", tone: "danger" },
    ISSUED: { text: "Issued", tone: "success" },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      <Link href="/coc/inspection" className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Pending Inspection
      </Link>
      <PageHeader
        title={`Quality inspection · ${doc.production_order}`}
        description={`${doc.item_number || ""} ${doc.item_description ? `· ${doc.item_description}` : ""}`}
        actions={<Badge tone={wfLabel[state]?.tone ?? "neutral"}>{wfLabel[state]?.text ?? state}</Badge>}
      />

      {state === "ISSUED" && doc.coc_number && (
        <Alert tone="success" title={`Issued as ${doc.coc_number}`}>
          <Link href={`/coc/${doc.id}`} className="font-semibold underline">Open the certificate</Link>
        </Alert>
      )}
      {state === "REJECTED" && (
        <Alert tone="danger" title="Rejected">
          {wf.rejectReason} — {wf.inspectedBy?.name || wf.inspectedBy?.email}, {fmt(wf.inspectedAt)}
        </Alert>
      )}

      <Card>
        <CardHeader title="Prepared by production" description={`${wf.ruleName} · sent by ${wf.submittedBy?.name || wf.submittedBy?.email} · ${fmt(wf.submittedAt)}`} />
        <CardBody className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            {[
              ["Production order", doc.production_order],
              ["Company", doc.company],
              ["Item", doc.item_number],
              ["Serial no.", doc.serial_number],
              ["Sales order", doc.sales_order ? `${doc.sales_order}${doc.sales_line ? ` / ${doc.sales_line}` : ""}` : "—"],
              ["Customer PO", doc.customer_po || payload?.customerPO],
              ["Customer part no.", payload?.customerPartNumber || payload?.manualValues?.CustomerPartNo],
              ["Quantity", `${doc.quantity ?? payload?.quantity ?? 1} ${payload?.unitOfMeasure || "Pcs"}`],
              ["Customer", payload?.customerName],
              ["Delivery date", payload?.deliveryDate],
            ].map(([k, v]) => (
              <div key={k as string} className={k === "Customer" ? "col-span-2" : ""}>
                <dt className="text-[11px] text-ink-400">{k}</dt>
                <dd className="font-medium text-ink-900 break-words">{(v as string) || "—"}</dd>
              </div>
            ))}
          </dl>
          {wf.note && <div className="rounded-md bg-ink-50 px-3 py-2 text-xs italic text-ink-700">Note from production: “{wf.note}”</div>}
          {wf.instructions && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {wf.instructions}
            </div>
          )}
        </CardBody>
      </Card>

      {readOnly ? (
        <Alert tone="info" title={state === "PENDING_INSPECTION" ? "Waiting for Quality" : "Read only"}>
          {state === "PENDING_INSPECTION"
            ? "A quality inspector enters the inspection data, signs and issues this COC. You can withdraw it while it is waiting."
            : "This inspection is closed."}
        </Alert>
      ) : (
        <>
          {inputConfig.sections.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-1 pt-1">
                <ClipboardList className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-ink-900">Inspection data – template pages</h3>
              </div>
              <MeasurementSections sections={inputConfig.sections} values={values} onChange={setValues} showErrors={showErrors} />
            </>
          ) : (
            <Alert tone="info">This template has no data-entry fields – check the order data and sign.</Alert>
          )}

          {(inputConfig.attachments.enabled || docs.length > 0) && (
            <DocumentCapture
              settings={inputConfig.attachments.enabled ? inputConfig.attachments : { ...inputConfig.attachments, enabled: true, required: false, minCount: 0 }}
              docs={docs}
              onChange={setDocs}
              showErrors={showErrors}
            />
          )}

          <Card>
            <CardHeader title="Inspector signature" description="Your signature is stamped on the certificate when you issue it." />
            <CardBody className="space-y-3">
              <SignaturePicker userName={userName} onChange={setSignature} />
              {showErrors && !signature && <div className="text-xs font-medium text-red-600" data-missing="true">Sign the certificate before issuing it.</div>}
              <Field label="Inspection remark (optional, kept in the history)">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </Field>
            </CardBody>
          </Card>

          {previewUrl && (
            <Card>
              <CardHeader title="Preview" description="Draft preview – the COC number is assigned when you issue." />
              <CardBody>
                <PdfViewer src={previewUrl} title="Inspection preview" downloadName={`${doc.production_order}-preview.pdf`} />
              </CardBody>
            </Card>
          )}
        </>
      )}

      {wf.history?.length > 0 && (
        <Card>
          <CardHeader title="History" />
          <CardBody>
            <ol className="space-y-1.5 text-xs">
              {wf.history.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                  <span>
                    <strong>{h.action.replace(/_/g, " ").toLowerCase()}</strong> · {h.by} · {fmt(h.at)}
                    {h.note ? <span className="text-ink-600"> — {h.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {/* sticky action bar */}
      {(data.canInspect || data.canWithdraw) && (
        <div className="sticky bottom-0 z-20 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t border-ink-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {data.canWithdraw && !data.canInspect && (
            <Button variant="outline" onClick={() => { setRejectReason(""); setRejectOpen(true); }} className="gap-1.5">
              <Undo2 className="h-4 w-4" /> Withdraw
            </Button>
          )}
          {data.canInspect && (
            <>
              <Button variant="outline" onClick={() => { setRejectReason(""); setRejectOpen(true); }} className="gap-1.5 text-red-700 border-red-200 hover:bg-red-50">
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button variant="outline" loading={previewing} onClick={preview} className="gap-1.5">
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button loading={issuing} onClick={issue} className="gap-1.5 bg-brand-500 hover:bg-brand-600 text-ink-900 border-brand-500 font-semibold">
                {signature ? <FileCheck className="h-4 w-4" /> : <PenTool className="h-4 w-4" />} Issue COC
              </Button>
            </>
          )}
        </div>
      )}

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={data.canInspect ? "Reject this COC" : "Withdraw from inspection"}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={rejecting} onClick={() => reject(!data.canInspect)}>
              {data.canInspect ? "Reject" : "Withdraw"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-ink-600">
            The COC is cancelled and the serial number {doc.serial_number ? <strong>{doc.serial_number}</strong> : null} can be used again. Production sees the reason under “Rejected / withdrawn”.
          </p>
          <Field label="Reason">
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Flatness point 3 out of tolerance – rework needed" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
