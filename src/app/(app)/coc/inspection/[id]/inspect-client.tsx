"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, CornerUpLeft, Eye, FileCheck, GitBranch, History, PenTool, Undo2, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Field, PageHeader, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { useI18n } from "@/lib/i18n/provider";
import { MeasurementSections, initMeasureValues, missingRequired, photoUploads, toMeasurementEntries, type MeasureValues } from "@/components/coc/MeasurementSections";
import { DocumentCapture, toAttachmentUploads, uid, type CapturedDoc } from "@/components/coc/DocumentCapture";
import { SignaturePicker } from "@/components/coc/SignaturePicker";
import { PdfViewer } from "@/components/coc/PdfViewer";
import { EMPTY_INPUT_CONFIG, formatPrinted, type TemplateInputConfig } from "@/lib/coc-inputs/types";
import type { CreateCocInput } from "@/lib/coc/issue";
import { pagesForStep, type WorkflowInfo, type WorkflowStep } from "@/lib/workflow/types";

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
  steps: WorkflowStep[];
  stepIndex: number;
  isFinal: boolean;
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
  const { t } = useI18n();
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
  const [dialogMode, setDialogMode] = useState<"reject" | "withdraw" | "return">("reject");
  const [completing, setCompleting] = useState(false);

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
    const tm = setTimeout(() => void load(), 0);
    return () => clearTimeout(tm);
  }, [load]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const allPages = useMemo(() => Array.from(new Set(inputConfig.sections.map((sec) => sec.pageNumber ?? 0))), [inputConfig]);
  const stepPages = useMemo(
    () => (data ? pagesForStep(data.steps, data.stepIndex, allPages) : new Set<number>()),
    [data, allPages],
  );
  const mySections = inputConfig.sections.filter((sec) => stepPages.has(sec.pageNumber ?? 0));
  const otherSections = inputConfig.sections.filter((sec) => !stepPages.has(sec.pageNumber ?? 0));
  const stepDoesDocuments = Boolean(data?.steps[data.stepIndex]?.attachments);

  const attachmentsNeeded = stepDoesDocuments && inputConfig.attachments.enabled
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
    const missing = missingRequired(mySections, values);
    if (missing.length) out.push(`${missing.length} required field(s) missing: ${missing.slice(0, 4).map((f) => f.label).join(", ")}${missing.length > 4 ? "…" : ""}`);
    if (docs.length < attachmentsNeeded) out.push(`Capture at least ${attachmentsNeeded} supplier document(s)`);
    if (data?.isFinal && !signature) out.push("Sign the certificate");
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
      toast.success(t("ip.issued", { coc: res.cocNumber }));
      router.push(`/coc/${res.documentId}`);
    } catch (e) {
      toast.error("Could not issue the COC", (e as Error).message);
      void load();
    } finally {
      setIssuing(false);
    }
  };

  const completeStep = async () => {
    const list = problems();
    if (list.length) {
      setShowErrors(true);
      toast.error(t("ip.completeFirst"), list.join(" • "));
      window.setTimeout(() => document.querySelector<HTMLElement>("[data-missing='true']")?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
      return;
    }
    setCompleting(true);
    try {
      const res = await api<{ ok: boolean; nextStep: string | null }>(`/api/workflow/inspections/${id}/step`, {
        method: "POST",
        json: { ...extras, note: note.trim() || undefined },
      });
      toast.success(t("ip.stepCompleted"), res.nextStep ? t("ip.sentToStep", { step: res.nextStep }) : undefined);
      router.push("/coc/inspection");
    } catch (e) {
      toast.error("Could not complete the step", (e as Error).message);
      void load();
    } finally {
      setCompleting(false);
    }
  };

  const openDialog = (mode: "reject" | "withdraw" | "return") => {
    setDialogMode(mode);
    setRejectReason("");
    setRejectOpen(true);
  };

  const reject = async (withdraw: boolean) => {
    if (rejectReason.trim().length < 3) return toast.error("Enter a reason (at least 3 characters)");
    setRejecting(true);
    try {
      if (dialogMode === "return") {
        const r = await api<{ ok: boolean; step: string }>(`/api/workflow/inspections/${id}/return`, { method: "POST", json: { reason: rejectReason.trim() } });
        toast.success(`Sent back to “${r.step}”`);
        router.push("/coc/inspection");
        return;
      }
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
        <Link href="/coc/inspection" className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900"><ArrowLeft className="h-3.5 w-3.5" /> {t("ip.back")}</Link>
        <Alert tone="danger" title="Could not open this inspection">{error}</Alert>
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-ink-500">Loading inspection…</div>;

  const { document: doc, workflow: wf, payload, steps, stepIndex, isFinal } = data;
  const state = wf.state;
  const readOnly = !data.canInspect;
  const step = steps[stepIndex];
  const nextStep = steps[stepIndex + 1];
  const open = state === "PENDING_INSPECTION" || state === "ISSUING";
  const wfLabel: Record<string, { text: string; tone: "warning" | "brand" | "danger" | "success" }> = {
    PENDING_INSPECTION: { text: t("ip.state.pending", { i: stepIndex + 1, n: steps.length, step: step?.name ?? "" }), tone: "warning" },
    ISSUING: { text: t("ip.state.issuing"), tone: "brand" },
    REJECTED: { text: t("ip.state.rejected"), tone: "danger" },
    ISSUED: { text: t("ip.state.issued"), tone: "success" },
  };
  const filled = (key: string) => values[key]?.photo ? "Photo attached" : values[key]?.value || "";

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      <Link href="/coc/inspection" className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("ip.back")}
      </Link>
      <PageHeader
        title={`${open ? step?.name : "COC workflow"} · ${doc.production_order}`}
        description={`${doc.item_number || ""} ${doc.item_description ? `· ${doc.item_description}` : ""}`}
        actions={<Badge tone={wfLabel[state]?.tone ?? "neutral"}>{wfLabel[state]?.text ?? state}</Badge>}
      />

      {/* workflow progress */}
      <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {steps.map((st, i) => {
          const done = state === "ISSUED" || i < stepIndex;
          const now = open && i === stepIndex;
          return (
            <li key={st.id} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium ${
                  now ? "border-brand-500 bg-brand-50 text-brand-900" : done ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-ink-200 bg-white text-ink-500"
                }`}
              >
                {done ? <CheckCircle2 className="h-3 w-3" /> : <span className="font-bold">{i + 1}</span>} {st.name}
                {st.roles.length > 0 && <span className="opacity-70">· {st.roles.join("/")}</span>}
              </span>
              {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-ink-300" />}
            </li>
          );
        })}
      </ol>

      {state === "ISSUED" && doc.coc_number && (
        <Alert tone="success" title={t("ip.issuedAs", { coc: doc.coc_number })}>
          <Link href={`/coc/${doc.id}`} className="font-semibold underline">{t("ip.openCertificate")}</Link>
        </Alert>
      )}
      {state === "REJECTED" && (
        <Alert tone="danger" title={t("ip.rejected")}>
          {wf.rejectReason} — {wf.inspectedBy?.name || wf.inspectedBy?.email}, {fmt(wf.inspectedAt)}
        </Alert>
      )}

      <Card>
        <CardHeader title={t("ip.orderData")} description={`${wf.ruleName} · sent by ${wf.submittedBy?.name || wf.submittedBy?.email} · ${fmt(wf.submittedAt)}`} />
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
          {wf.note && <div className="rounded-md bg-ink-50 px-3 py-2 text-xs italic text-ink-700">{t("ip.noteFromProduction")} “{wf.note}”</div>}
          {wf.instructions && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {wf.instructions}
            </div>
          )}
        </CardBody>
      </Card>

      {open && step?.instructions && (
        <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><strong>{step.name}:</strong> {step.instructions}</span>
        </div>
      )}

      {/* data from earlier steps (read only) */}
      {otherSections.some((sec) => sec.fields.some((f) => filled(f.key))) && (
        <Card>
          <CardHeader title={t("ip.otherSteps")} description={t("ip.otherStepsDesc")} />
          <CardBody className="space-y-3">
            {otherSections.map((sec) => {
              const rows = sec.fields.filter((f) => filled(f.key));
              if (!rows.length) return null;
              return (
                <div key={sec.id}>
                  <div className="mb-1 text-[11px] font-semibold text-ink-700">{sec.title}</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                    {rows.map((f) => (
                      <div key={f.key} className="min-w-0">
                        <dt className="truncate text-[11px] text-ink-400">{f.label}</dt>
                        <dd className="truncate font-medium text-ink-900">{filled(f.key)}{f.unit && values[f.key]?.value && !values[f.key]?.photo ? ` ${f.unit}` : ""}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
            {!stepDoesDocuments && docs.length > 0 && (
              <div className="text-[11px] text-ink-600">Supplier documents: {docs.map((d) => d.caption || d.name).join(", ")}</div>
            )}
          </CardBody>
        </Card>
      )}

      {readOnly ? (
        <Alert tone="info" title={open ? t("ip.waitingFor", { step: step?.name ?? "" }) : t("ip.readOnly")}>
          {open
            ? `${t("ip.doneBy", { roles: step?.roles.length ? step.roles.join(", ") : "Quality" })}${data.canWithdraw ? t("ip.canWithdraw") : ""}`
            : t("ip.closed")}
        </Alert>
      ) : (
        <>
          {mySections.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-1 pt-1">
                <ClipboardList className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-ink-900">{t("ip.dataEntry", { step: step?.name ?? "" })}</h3>
                <span className="text-[11px] text-ink-500">{t("ip.pages", { p: Array.from(stepPages).filter((p) => p > 0).sort((a, b) => a - b).join(", ") || "–" })}</span>
              </div>
              <MeasurementSections sections={mySections} values={values} onChange={setValues} showErrors={showErrors} />
            </>
          ) : (
            <Alert tone="info">{isFinal ? t("ip.noFieldsFinal") : t("ip.noFields")}</Alert>
          )}

          {stepDoesDocuments && (
            <DocumentCapture
              settings={inputConfig.attachments.enabled ? inputConfig.attachments : { ...inputConfig.attachments, enabled: true, required: false, minCount: 0 }}
              docs={docs}
              onChange={setDocs}
              showErrors={showErrors}
            />
          )}

          <Card>
            {isFinal ? (
              <>
                <CardHeader title={t("ip.signature")} description={t("ip.signatureDesc")} />
                <CardBody className="space-y-3">
                  <SignaturePicker userName={userName} onChange={setSignature} />
                  {showErrors && !signature && <div className="text-xs font-medium text-red-600" data-missing="true">{t("ip.signFirst")}</div>}
                  <Field label={t("ip.remark")}>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                  </Field>
                </CardBody>
              </>
            ) : (
              <>
                <CardHeader title={t("ip.handover")} description={`${t("ip.handoverDesc", { step: nextStep?.name ?? "" })}${nextStep?.roles.length ? ` (${nextStep.roles.join(", ")})` : ""}`} />
                <CardBody>
                  <Field label={t("ip.noteNext")}>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                  </Field>
                </CardBody>
              </>
            )}
          </Card>

          {previewUrl && (
            <Card>
              <CardHeader title={t("common.preview")} description={t("ip.previewDesc")} />
              <CardBody>
                <PdfViewer src={previewUrl} title="Preview" downloadName={`${doc.production_order}-preview.pdf`} />
              </CardBody>
            </Card>
          )}
        </>
      )}

      {wf.history?.length > 0 && (
        <Card>
          <CardHeader title={t("ip.history")} />
          <CardBody>
            <ol className="space-y-1.5 text-xs">
              {wf.history.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                  <span>
                    <strong>{h.action.replace(/_/g, " ").toLowerCase()}</strong>{h.step ? ` (${h.step})` : ""} · {h.by} · {fmt(h.at)}
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
            <Button variant="outline" onClick={() => openDialog("withdraw")} className="gap-1.5">
              <Undo2 className="h-4 w-4" /> {t("common.withdraw")}
            </Button>
          )}
          {data.canInspect && (
            <>
              <Button variant="outline" onClick={() => openDialog("reject")} className="gap-1.5 text-red-700 border-red-200 hover:bg-red-50">
                <XCircle className="h-4 w-4" /> {t("common.reject")}
              </Button>
              {stepIndex >= 2 && (
                <Button variant="outline" onClick={() => openDialog("return")} className="gap-1.5">
                  <CornerUpLeft className="h-4 w-4" /> {t("ip.sendBack")}
                </Button>
              )}
              <Button variant="outline" loading={previewing} onClick={preview} className="gap-1.5">
                <Eye className="h-4 w-4" /> {t("common.preview")}
              </Button>
              {isFinal ? (
                <Button loading={issuing} onClick={issue} className="gap-1.5 bg-brand-500 hover:bg-brand-600 text-ink-900 border-brand-500 font-semibold">
                  {signature ? <FileCheck className="h-4 w-4" /> : <PenTool className="h-4 w-4" />} {t("ip.issueCoc")}
                </Button>
              ) : (
                <Button loading={completing} onClick={completeStep} className="gap-1.5 bg-brand-500 hover:bg-brand-600 text-ink-900 border-brand-500 font-semibold">
                  {t("ip.completeStep")} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={dialogMode === "return" ? t("ip.returnTitle", { step: steps[stepIndex - 1]?.name ?? "" }) : dialogMode === "withdraw" ? t("ip.withdrawTitle") : t("ip.rejectTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t("common.cancel")}</Button>
            <Button variant={dialogMode === "return" ? "primary" : "danger"} loading={rejecting} onClick={() => reject(dialogMode === "withdraw")}>
              {dialogMode === "return" ? t("ip.sendBack") : dialogMode === "withdraw" ? t("common.withdraw") : t("common.reject")}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-ink-600">
            {dialogMode === "return" ? t("ip.returnInfo") : t("ip.rejectInfo")}
          </p>
          <Field label={t("common.reason")}>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Flatness point 3 out of tolerance – rework needed" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
