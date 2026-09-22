"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, RefreshCw, Search, Undo2, XCircle } from "lucide-react";
import { Badge, Button, Card, CardBody, EmptyState, Input, PageHeader } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { WorkflowInfo } from "@/lib/workflow/types";

interface Row {
  id: string;
  production_order: string;
  item_number: string | null;
  item_description: string | null;
  serial_number: string | null;
  sales_order: string | null;
  customer_po: string | null;
  quantity: number | null;
  company: string;
  customerName: string;
  created_at: string;
  mine: boolean;
  workflow: WorkflowInfo;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const waitingFor = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
};

export function InspectionListClient({ canInspect }: { canInspect: boolean }) {
  const [tab, setTab] = useState<"pending" | "rejected">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async (which: "pending" | "rejected") => {
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; documents: Row[] }>(`/api/workflow/pending?state=${which}`);
      setRows(res.documents || []);
      setNow(Date.now());
    } catch (e) {
      toast.error("Could not load inspections", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(tab), 0);
    return () => clearTimeout(t);
  }, [tab, load]);

  const withdraw = async (r: Row) => {
    const reason = prompt(`Withdraw ${r.production_order} · ${r.serial_number || ""} from inspection?\nReason:`, "Created by mistake");
    if (!reason || reason.trim().length < 3) return;
    try {
      await api(`/api/workflow/inspections/${r.id}/reject`, { method: "POST", json: { reason, withdraw: true } });
      toast.success("Submission withdrawn – the serial number is free again");
      void load(tab);
    } catch (e) {
      toast.error("Could not withdraw", (e as Error).message);
    }
  };

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      !needle ||
      [r.production_order, r.item_number, r.serial_number, r.sales_order, r.customer_po, r.customerName, r.workflow.submittedBy?.name, r.workflow.submittedBy?.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pending Inspection"
        description={
          canInspect
            ? "COCs prepared by production that wait for your quality inspection. Open one to enter the inspection data, sign and issue it."
            : "COCs you and your colleagues sent to quality. They are issued by the quality inspector."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => load(tab)} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(["pending", "rejected"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}
            >
              {t === "pending" ? "Waiting for inspection" : "Rejected / withdrawn"}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order, item, serial, user…" className="pl-8" />
        </div>
        <Badge tone={tab === "pending" ? "warning" : "neutral"}>{shown.length}</Badge>
      </div>

      {loading && rows.length === 0 ? (
        <Card><CardBody className="text-sm text-ink-500">Loading…</CardBody></Card>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "Nothing waiting for inspection" : "No rejected submissions"}
          description={tab === "pending" ? "COCs for items with a quality inspection workflow appear here after production sends them." : "Rejected or withdrawn submissions appear here with the reason."}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((r) => {
            const issuing = r.workflow.state === "ISSUING";
            return (
              <Card key={r.id}>
                <CardBody className="space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-ink-900">{r.production_order}</span>
                        <Badge tone="info">{r.company}</Badge>
                        {issuing && <Badge tone="brand">Being issued…</Badge>}
                        {r.mine && <Badge tone="neutral">Sent by you</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-600">
                        {r.item_number} · {r.item_description}
                      </div>
                    </div>
                    {tab === "pending" && (
                      <Badge tone="warning" className="shrink-0">waiting {now ? waitingFor(r.workflow.submittedAt || r.created_at) : ""}</Badge>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
                    <div><dt className="text-ink-400">Serial no.</dt><dd className="font-mono font-semibold text-ink-900">{r.serial_number || "—"}</dd></div>
                    <div><dt className="text-ink-400">Sales order</dt><dd className="font-mono text-ink-800">{r.sales_order || "—"}</dd></div>
                    <div><dt className="text-ink-400">Customer PO</dt><dd className="font-mono text-ink-800">{r.customer_po || "—"}</dd></div>
                    <div className="col-span-2 sm:col-span-3"><dt className="text-ink-400">Customer</dt><dd className="truncate text-ink-800">{r.customerName || "—"}</dd></div>
                  </dl>

                  <div className="text-[11px] text-ink-500">
                    {r.workflow.ruleName} · sent by <strong className="text-ink-700">{r.workflow.submittedBy?.name || r.workflow.submittedBy?.email}</strong> · {fmt(r.workflow.submittedAt)}
                  </div>
                  {r.workflow.note && <div className="rounded bg-ink-50 px-2 py-1 text-[11px] italic text-ink-700">“{r.workflow.note}”</div>}
                  {tab === "rejected" && (
                    <div className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {r.workflow.history?.at(-1)?.action === "WITHDRAWN" ? "Withdrawn" : "Rejected"} by {r.workflow.inspectedBy?.name || r.workflow.inspectedBy?.email} · {fmt(r.workflow.inspectedAt)} — {r.workflow.rejectReason}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {tab === "pending" && r.mine && !issuing && (
                      <Button size="sm" variant="outline" onClick={() => withdraw(r)} className="gap-1.5 text-xs">
                        <Undo2 className="h-3.5 w-3.5" /> Withdraw
                      </Button>
                    )}
                    <Link href={`/coc/inspection/${r.id}`}>
                      <Button size="sm" className={`gap-1.5 text-xs ${tab === "pending" && canInspect ? "bg-brand-500 hover:bg-brand-600 text-ink-900 border-brand-500" : ""}`} variant={tab === "pending" && canInspect ? "primary" : "outline"}>
                        <ClipboardCheck className="h-3.5 w-3.5" /> {tab === "pending" && canInspect ? "Inspect & issue" : "View"}
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
