"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, RefreshCw, Search, Undo2, XCircle } from "lucide-react";
import { Badge, Button, Card, CardBody, EmptyState, Input, PageHeader } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { useI18n } from "@/lib/i18n/provider";
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
  yourTurn: boolean;
  stepIndex: number;
  stepCount: number;
  stepName: string;
  stepRoles: string[];
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
  const { t } = useI18n();
  const [tab, setTab] = useState<"pending" | "rejected">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(true);
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
    const tm = setTimeout(() => void load(tab), 0);
    return () => clearTimeout(tm);
  }, [tab, load]);

  const withdraw = async (r: Row) => {
    const reason = prompt(t("insp.withdrawPrompt", { order: `${r.production_order} · ${r.serial_number || ""}` }), "");
    if (!reason || reason.trim().length < 3) return;
    try {
      await api(`/api/workflow/inspections/${r.id}/reject`, { method: "POST", json: { reason, withdraw: true } });
      toast.success(t("insp.withdrawn"));
      void load(tab);
    } catch (e) {
      toast.error("Could not withdraw", (e as Error).message);
    }
  };

  const needle = q.trim().toLowerCase();
  const turnCount = rows.filter((r) => r.yourTurn).length;
  const shown = rows.filter(
    (r) =>
      (tab !== "pending" || !onlyMine || r.yourTurn || r.mine) &&
      (!needle ||
      [r.production_order, r.item_number, r.serial_number, r.sales_order, r.customer_po, r.customerName, r.workflow.submittedBy?.name, r.workflow.submittedBy?.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("insp.title")}
        description={
          canInspect ? t("insp.descInspector") : t("insp.descOther")
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => load(tab)} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(["pending", "rejected"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === tb ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}
            >
              {tb === "pending" ? t("insp.tabPending") : t("insp.tabRejected")}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("insp.searchPh")} className="pl-8" />
        </div>
        {tab === "pending" && (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-700">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            {t("insp.onlyMine")} {turnCount ? `(${t("insp.forYou", { n: turnCount })})` : ""}
          </label>
        )}
        <Badge tone={tab === "pending" ? "warning" : "neutral"}>{shown.length}</Badge>
      </div>

      {loading && rows.length === 0 ? (
        <Card><CardBody className="text-sm text-ink-500">Loading…</CardBody></Card>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? t("insp.emptyPending") : t("insp.emptyRejected")}
          description={tab === "pending" ? t("insp.emptyPendingDesc") : t("insp.emptyRejectedDesc")}
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
                        {issuing && <Badge tone="brand">{t("insp.beingIssued")}</Badge>}
                        {tab === "pending" && r.yourTurn && !issuing && <Badge tone="success">{t("insp.yourStep")}</Badge>}
                        {r.mine && <Badge tone="neutral">{t("insp.sentByYou")}</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-600">
                        {r.item_number} · {r.item_description}
                      </div>
                    </div>
                    {tab === "pending" && (
                      <Badge tone="warning" className="shrink-0">{t("insp.waiting", { t: now ? waitingFor(r.workflow.submittedAt || r.created_at) : "" })}</Badge>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
                    <div><dt className="text-ink-400">{t("insp.serial")}</dt><dd className="font-mono font-semibold text-ink-900">{r.serial_number || "—"}</dd></div>
                    <div><dt className="text-ink-400">{t("insp.salesOrder")}</dt><dd className="font-mono text-ink-800">{r.sales_order || "—"}</dd></div>
                    <div><dt className="text-ink-400">{t("insp.customerPo")}</dt><dd className="font-mono text-ink-800">{r.customer_po || "—"}</dd></div>
                    <div className="col-span-2 sm:col-span-3"><dt className="text-ink-400">{t("insp.customer")}</dt><dd className="truncate text-ink-800">{r.customerName || "—"}</dd></div>
                  </dl>

                  {tab === "pending" && (
                    <div className="rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-[11px] text-ink-700">
                      {t("insp.stepOf", { i: r.stepIndex + 1, n: r.stepCount })} <strong>{r.stepName}</strong>
                      {r.stepRoles.length ? ` · ${r.stepRoles.join(", ")}` : ""}
                    </div>
                  )}
                  <div className="text-[11px] text-ink-500">
                    {r.workflow.ruleName} · {t("insp.sentBy")} <strong className="text-ink-700">{r.workflow.submittedBy?.name || r.workflow.submittedBy?.email}</strong> · {fmt(r.workflow.submittedAt)}
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
                        <Undo2 className="h-3.5 w-3.5" /> {t("common.withdraw")}
                      </Button>
                    )}
                    <Link href={`/coc/inspection/${r.id}`}>
                      <Button size="sm" className={`gap-1.5 text-xs ${tab === "pending" && r.yourTurn ? "bg-brand-500 hover:bg-brand-600 text-ink-900 border-brand-500" : ""}`} variant={tab === "pending" && r.yourTurn ? "primary" : "outline"}>
                        <ClipboardCheck className="h-3.5 w-3.5" /> {tab === "pending" && r.yourTurn ? (r.stepIndex === r.stepCount - 1 ? t("insp.signIssue") : t("insp.openStep")) : t("common.view")}
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
