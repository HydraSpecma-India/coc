"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Alert,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { COCDocumentRow, COCProcessStepRow } from "@/lib/db/repositories/coc";
import {
  Download,
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Send,
} from "lucide-react";

export function CocDetailClient({
  doc,
  steps: initialSteps,
  values,
}: {
  doc: COCDocumentRow;
  steps: COCProcessStepRow[];
  values: Array<{ field_name: string; value_text: string | null }>;
}) {
  const [steps, setSteps] = useState<COCProcessStepRow[]>(initialSteps);
  const [retrying, setRetrying] = useState(false);
  const [sendingTeams, setSendingTeams] = useState(false);

  const retryFailedStep = async () => {
    setRetrying(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(`/api/coc/${doc.id}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(res.message);
        // Refresh details
        const refreshed = await api<{ ok: boolean; steps: COCProcessStepRow[] }>(`/api/coc/${doc.id}`);
        if (refreshed.steps) setSteps(refreshed.steps);
      }
    } catch (e) {
      toast.error("Retry failed", (e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  const sendToTeams = async () => {
    setSendingTeams(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(`/api/coc/${doc.id}/send-teams`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(res.message);
        const refreshed = await api<{ ok: boolean; steps: COCProcessStepRow[] }>(`/api/coc/${doc.id}`);
        if (refreshed.steps) setSteps(refreshed.steps);
      }
    } catch (e) {
      toast.error("Send to Teams failed", (e as Error).message);
    } finally {
      setSendingTeams(false);
    }
  };

  const getStepIcon = (status: string) => {
    if (status === "OK") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    if (status === "FAILED") return <XCircle className="h-5 w-5 text-red-600" />;
    return <Clock className="h-5 w-5 text-amber-500 animate-spin" />;
  };

  const hasFailedStep = steps.some((s) => s.status === "FAILED");

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <div className="mb-4">
        <Link href="/coc/history" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Completed COCs
        </Link>
      </div>

      <PageHeader
        title={doc.coc_number || "Certificate of Conformity"}
        description={`Production Order: ${doc.production_order} • Part: ${doc.item_number || "—"}`}
        actions={
          <div className="flex items-center gap-2">
            {hasFailedStep && (
              <Button variant="outline" size="sm" loading={retrying} onClick={retryFailedStep}>
                <RotateCw className="h-3.5 w-3.5" />
                Retry Failed Step
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              loading={sendingTeams}
              onClick={sendToTeams}
              className="inline-flex items-center gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            >
              <Send className="h-4 w-4 text-indigo-600" />
              Send to Teams
            </Button>
            {doc.generated_pdf_path && (
              <a
                href={`/api/coc/${doc.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-brand-600"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            )}
          </div>
        }
      />

      {/* Process Pipeline Tracker */}
      <Card className="mb-6">
        <CardHeader title="Automated Processing Pipeline" description="Real-time execution steps recorded for this certificate." />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { id: "D365_FETCH", title: "1. D365 ERP Fetch" },
              { id: "VALIDATE", title: "2. Rules Validation" },
              { id: "RENDER", title: "3. PDF Rendering" },
              { id: "SP_UPLOAD", title: "4. Storage Upload" },
              { id: "TEAMS_WEBHOOK", title: "5. Teams Notification" },
              { id: "D365_UPDATE", title: "6. D365 Registration" },
            ].map((p) => {
              const match = steps.find((s) => s.step === p.id);
              const status = match ? match.status : "PENDING";
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-3 ${
                    status === "OK"
                      ? "border-emerald-200 bg-emerald-50/40"
                      : status === "FAILED"
                      ? "border-red-200 bg-red-50/40"
                      : "border-ink-200 bg-ink-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-800">{p.title}</span>
                    {match ? getStepIcon(match.status) : <span className="h-2 w-2 rounded-full bg-ink-300" />}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500">
                    <span>{status}</span>
                    {match?.duration_ms && <span>{match.duration_ms}ms</span>}
                  </div>
                  {match?.error && (
                    <div className="mt-1 text-[10px] text-red-600 font-mono line-clamp-1" title={match.error}>
                      {match.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* PDF Viewer */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Certificate Document"
              description="Digitally signed PDF conforming to ISO 9001:2015 standards."
              actions={
                <a
                  href={`/api/coc/${doc.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Fullscreen
                </a>
              }
            />
            <CardBody className="p-0">
              <iframe
                src={`/api/coc/${doc.id}/pdf`}
                className="w-full h-[650px] rounded-b-lg border-0"
                title="Generated COC PDF"
              />
            </CardBody>
          </Card>
        </div>

        {/* Metadata & Quality Record Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Order Information" />
            <CardBody className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Production Order:</span>
                <span className="font-mono font-bold text-ink-900">{doc.production_order}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Customer:</span>
                <span className="font-medium text-ink-900 text-right truncate max-w-[200px]" title={String(doc.d365_context_json?.customerName || values.find((v) => v.field_name === "CustomerName")?.value_text || "—")}>
                  {String(doc.d365_context_json?.customerName || values.find((v) => v.field_name === "CustomerName")?.value_text || "—")}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Part Number:</span>
                <span className="font-mono font-medium text-ink-900">{doc.item_number}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Customer Part No:</span>
                <span className="font-mono font-semibold text-brand-800">
                  {String(doc.d365_context_json?.customerPartNumber || values.find((v) => v.field_name === "CustomerPartNo")?.value_text || "160072")}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Customer PO:</span>
                <span className="font-medium text-ink-900">{doc.customer_po || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Sales Order:</span>
                <span className="font-mono text-ink-900">{doc.sales_order || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Quantity:</span>
                <span className="font-bold text-ink-900">{doc.quantity ?? 1}</span>
              </div>
              {Boolean(doc.d365_context_json?.deliveryDate) && (
                <div className="flex justify-between py-1 border-b border-ink-100">
                  <span className="text-ink-500">Delivery Date:</span>
                  <span className="font-mono text-ink-900">{String(doc.d365_context_json?.deliveryDate)}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-ink-500">Status:</span>
                <Badge tone={doc.status === "COMPLETED" ? "success" : "warning"}>{doc.status}</Badge>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Inspection Parameters" />
            <CardBody className="space-y-2 text-xs">
              {values.length === 0 ? (
                <div className="text-ink-400 text-center py-4">Standard inspection values applied</div>
              ) : (
                values.map((v) => {
                  let dispVal = v.value_text || "—";
                  if (v.field_name === "CustomerName" && dispVal.toLowerCase().includes("hydraspecma")) {
                    dispVal = String(doc.d365_context_json?.customerName || (doc.customer_account === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD"));
                  }
                  return (
                    <div key={v.field_name} className="py-1 border-b border-ink-100 last:border-0">
                      <div className="font-semibold text-ink-700">{v.field_name}</div>
                      <div className="text-ink-900 mt-0.5">{dispVal}</div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
