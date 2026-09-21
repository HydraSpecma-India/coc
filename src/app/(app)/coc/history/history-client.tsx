"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Input,
  Badge,
  Table,
  Th,
  Td,
} from "@/components/ui";
import type { COCDocumentRow } from "@/lib/db/repositories/coc";
import { api } from "@/lib/utils/fetcher";
import {
  Search,
  Download,
  ExternalLink,
  Plus,
  FileCheck,
  LayoutGrid,
  List,
  Eye,
  Building2,
  X,
} from "lucide-react";

interface HistoryClientProps {
  initialDocs: COCDocumentRow[];
  allowedCompanies?: string[];
}

const HISTORY_PAGE_SIZE = 50;

export function HistoryClient({
  initialDocs,
  allowedCompanies = ["ALL"],
}: HistoryClientProps) {
  const [docs, setDocs] = useState<COCDocumentRow[]>(initialDocs);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  // Phones always get the card layout – the wide table is not usable below 640px
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setIsPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialDocs.length === HISTORY_PAGE_SIZE);

  // Company / Legal Entity Filter
  const defaultCompany =
    !allowedCompanies.includes("ALL") && allowedCompanies.length > 0
      ? allowedCompanies[0]
      : "ALL";
  const [selectedCompany, setSelectedCompany] = useState<string>(defaultCompany);
  const [availableCompanies, setAvailableCompanies] = useState<{ code: string; label: string }[]>([
    { code: "ALL", label: "ALL - Cross-Company (All Entities)" },
    { code: "HSIN", label: "HSIN - India (HydraSpecma India)" },
    { code: "HGCN", label: "HGCN - China (HydraSpecma China)" },
    { code: "HSDK", label: "HSDK - Denmark (HydraSpecma Denmark)" },
    { code: "HSPL", label: "HSPL - Poland (HydraSpecma Poland)" },
    { code: "HSSE", label: "HSSE - Sweden (HydraSpecma Sweden)" },
    { code: "HSFI", label: "HSFI - Finland (HydraSpecma Finland)" },
    { code: "HSUK", label: "HSUK - UK (HydraSpecma UK)" },
    { code: "HSUS", label: "HSUS - USA (HydraSpecma North America)" },
  ]);

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((res) => {
        if (res.ok && res.companies && res.companies.length > 0) {
          const mapped = [
            { code: "ALL", label: "ALL - Cross-Company (All Entities)" },
            ...res.companies.map((c) => ({
              code: c.code,
              label: `${c.code} - ${c.name}`,
            })),
          ];
          setAvailableCompanies(mapped);
        }
      })
      .catch(() => {});
  }, []);

  // Filter available tabs based on user allowed companies
  const visibleCompanyTabs = availableCompanies.filter(
    (c) =>
      allowedCompanies.includes("ALL") ||
      c.code === "ALL" ||
      allowedCompanies.includes(c.code)
  );

  // Filter documents
  const filtered = docs.filter((d) => {
    // 1. Company restriction from session
    const docCtx = (d.d365_context_json || {}) as Record<string, unknown>;
    const docCompany = (
      (docCtx.dataAreaId as string) ||
      d.customer_account ||
      "HSIN"
    ).toUpperCase();

    if (!allowedCompanies.includes("ALL") && !allowedCompanies.includes(docCompany)) {
      return false;
    }

    // 2. Active company tab filter
    if (selectedCompany !== "ALL" && docCompany !== selectedCompany) {
      return false;
    }

    // 3. Search query filter
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const custName = ((docCtx.customerName as string) || "").toLowerCase();
    const custPart = ((docCtx.customerPartNumber as string) || "").toLowerCase();

    return (
      (d.coc_number && d.coc_number.toLowerCase().includes(q)) ||
      d.production_order.toLowerCase().includes(q) ||
      (d.item_number && d.item_number.toLowerCase().includes(q)) ||
      (d.item_description && d.item_description.toLowerCase().includes(q)) ||
      (d.customer_po && d.customer_po.toLowerCase().includes(q)) ||
      (d.serial_number && d.serial_number.toLowerCase().includes(q)) ||
      custName.includes(q) ||
      custPart.includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "UPLOADED":
        return <Badge tone="success">Completed</Badge>;
      case "PDF_GENERATED":
        return <Badge tone="info">Generated</Badge>;
      case "UPLOAD_FAILED":
      case "D365_UPDATE_FAILED":
        return <Badge tone="danger">Failed</Badge>;
      default:
        return <Badge tone="warning">{status}</Badge>;
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const result = await api<{ ok: boolean; documents: COCDocumentRow[]; hasMore: boolean }>(
        `/api/coc?offset=${docs.length}&limit=${HISTORY_PAGE_SIZE}`,
      );
      setDocs((current) => {
        const knownIds = new Set(current.map((doc) => doc.id));
        return [...current, ...result.documents.filter((doc) => !knownIds.has(doc.id))];
      });
      setHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="Completed Certificates of Conformity"
        description="Search, view, and download completed Certificates of Conformity issued across all production orders."
        actions={
          <div className="flex items-center gap-2">
            {/* View Switcher: Grid vs Table (phones always use cards) */}
            <div className="hidden sm:inline-flex rounded-lg border border-ink-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === "grid"
                    ? "bg-ink-900 text-white shadow-xs"
                    : "text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === "table"
                    ? "bg-ink-900 text-white shadow-xs"
                    : "text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
            </div>

            <Link href="/coc/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New COC
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <Card className="mb-6 shadow-xs border-ink-200">
        <CardBody className="space-y-3.5">
          {/* Company Quick-Select Tabs */}
          <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 text-xs text-ink-600 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <div className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink-700 mr-1">
              <Building2 className="h-3.5 w-3.5 text-brand-600" />
              <span>Legal Entity:</span>
            </div>
            {visibleCompanyTabs.map((ent) => (
              <button
                key={ent.code}
                type="button"
                onClick={() => setSelectedCompany(ent.code)}
                title={ent.label}
                className={`shrink-0 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded text-[11px] font-semibold transition-all border ${
                  selectedCompany === ent.code
                    ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                    : "bg-ink-50 text-ink-600 border-ink-200 hover:bg-ink-100"
                }`}
              >
                {ent.code}
              </button>
            ))}
            <span className="ml-auto hidden text-[11px] font-mono text-ink-400 sm:inline">
              Entity: <strong>{selectedCompany === "ALL" ? "All Companies" : selectedCompany}</strong>
            </span>
          </div>

          {/* Search Input */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-ink-100">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Production Order, Item Number, Customer Name, PO, Serial Number, or COC Number..."
                className="pl-9 pr-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2.5 text-ink-400 hover:text-ink-600"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-500 font-medium shrink-0 self-end sm:self-auto">
              <span>Showing:</span>
              <span className="font-bold text-ink-900 bg-ink-100 px-2 py-0.5 rounded">
                {filtered.length} of {docs.length}
              </span>
              <span>completed COCs</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Content Area */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-300 p-12 text-center bg-ink-50/50">
          <FileCheck className="mx-auto h-10 w-10 text-ink-400 mb-3" />
          <h4 className="text-sm font-semibold text-ink-900">
            {query || selectedCompany !== "ALL"
              ? "No completed COCs match your search and filter criteria."
              : "No Certificates of Conformity have been completed yet."}
          </h4>
          <p className="mt-1 text-xs text-ink-500 max-w-md mx-auto">
            {query || selectedCompany !== "ALL"
              ? "Try clearing the search query or selecting 'ALL' companies to see all completed certificates."
              : "Once you generate a Certificate of Conformity from the New COC wizard, it will appear here."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            {(query || selectedCompany !== "ALL") && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setSelectedCompany("ALL");
                }}
              >
                Reset Filters
              </Button>
            )}
            <Link href="/coc/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create New COC
              </Button>
            </Link>
          </div>
        </div>
      ) : viewMode === "grid" || isPhone ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filtered.map((d) => {
            const docCtx = (d.d365_context_json || {}) as Record<string, unknown>;
            const docCompany = (
              (docCtx.dataAreaId as string) ||
              d.customer_account ||
              "HSIN"
            ).toUpperCase();

            const customerName =
              (docCtx.customerName as string) ||
              (docCompany === "HGCN"
                ? "VESTAS WIND TECHNOLOGY CHINA CO LTD"
                : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

            const customerPartNo =
              (docCtx.customerPartNumber as string) ||
              (docCtx.externalItemNumber as string) ||
              "160072";

            const deliveryDate = (docCtx.deliveryDate as string) || "";
            const formattedDate = d.created_at
              ? new Date(d.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—";

            return (
              <div
                key={d.id}
                className="rounded-lg border border-emerald-200 bg-white hover:border-emerald-400 hover:shadow-sm p-3 transition-all flex flex-col justify-between text-xs relative"
              >
                <div>
                  {/* Top: Order & Badges */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className="font-mono text-xs font-bold text-brand-700 truncate"
                      title={d.production_order}
                    >
                      {d.production_order}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] font-mono font-bold bg-ink-100 text-ink-700 px-1 py-0.5 rounded">
                        {docCompany}
                      </span>
                      <Badge tone="success" className="text-[9px] font-semibold px-1 py-0.5">
                        End
                      </Badge>
                    </div>
                  </div>

                  {/* Item Description */}
                  <div
                    className="font-semibold text-xs text-ink-900 line-clamp-1 mb-1"
                    title={d.item_description || d.item_number || "Component"}
                  >
                    {d.item_description || d.item_number || "Assembled Component"}
                  </div>

                  {/* Customer & Qualification Pill */}
                  <div className="flex items-center justify-between gap-1 mb-1.5 text-[10px]">
                    <span className="text-ink-500 truncate max-w-[130px]" title={customerName}>
                      {customerName}
                    </span>
                    <Badge tone="success" className="text-[9px] font-bold px-1.5 py-0 shrink-0">
                      {d.coc_number || "Certified"}
                    </Badge>
                  </div>

                  {/* 2x2 / 2x3 Specs Grid */}
                  <div className="pt-1.5 border-t border-ink-100 grid grid-cols-2 gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-600">
                    <div className="truncate">
                      Part: <span className="font-mono font-bold text-ink-900">{d.item_number || "—"}</span>
                    </div>
                    <div className="truncate">
                      Cust: <span className="font-mono font-semibold text-brand-800">{customerPartNo}</span>
                    </div>
                    <div className="truncate">
                      PO: <span className="font-medium text-ink-700">{d.customer_po || "—"}</span>
                    </div>
                    <div className="truncate">
                      Qty: <span className="font-bold text-ink-900">{d.quantity ?? 1} Pcs</span>
                    </div>
                    {deliveryDate && (
                      <div className="truncate">
                        Date: <span className="font-medium text-ink-700">{deliveryDate}</span>
                      </div>
                    )}
                    {d.serial_number && (
                      <div className="truncate">
                        SN: <span className="font-mono font-bold text-ink-900">{d.serial_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom: Date & View / Download Actions */}
                <div className="mt-2.5 pt-1.5 border-t border-emerald-200 flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium text-ink-400">
                    {formattedDate}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {d.generated_pdf_path && (
                      <a
                        href={`/api/coc/${d.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] sm:text-[10px] font-semibold text-ink-700 hover:text-ink-900 bg-ink-100 hover:bg-ink-200 px-2.5 py-1.5 sm:px-2 sm:py-0.5 rounded transition-colors"
                        title="Download PDF"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </a>
                    )}
                    <Link
                      href={`/coc/${d.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] sm:text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 sm:px-2.5 sm:py-0.5 rounded shadow-2xs transition-colors shrink-0"
                    >
                      <Eye className="h-3 w-3" /> View COC ({d.coc_number || "View"})
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <Table>
          <thead>
            <tr>
              <Th>COC Number</Th>
              <Th>Production Order</Th>
              <Th>Company</Th>
              <Th>Item / Description</Th>
              <Th>Customer</Th>
              <Th>Customer PO</Th>
              <Th>Serial No</Th>
              <Th>Qty</Th>
              <Th>Status</Th>
              <Th>Issued Date</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const docCtx = (d.d365_context_json || {}) as Record<string, unknown>;
              const docCompany = (
                (docCtx.dataAreaId as string) ||
                d.customer_account ||
                "HSIN"
              ).toUpperCase();
              const customerName = (docCtx.customerName as string) || "—";

              return (
                <tr key={d.id}>
                  <Td>
                    <Link
                      href={`/coc/${d.id}`}
                      className="font-mono text-xs font-bold text-brand-700 hover:underline"
                    >
                      {d.coc_number || "DRAFT-" + d.id.slice(0, 6)}
                    </Link>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs font-medium text-ink-800">
                      {d.production_order}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs font-semibold bg-ink-100 text-ink-700 px-1.5 py-0.5 rounded">
                      {docCompany}
                    </span>
                  </Td>
                  <Td>
                    <div className="font-semibold text-xs text-ink-900">{d.item_number}</div>
                    <div className="text-[11px] text-ink-500 line-clamp-1">{d.item_description}</div>
                  </Td>
                  <Td>
                    <span className="text-xs text-ink-700 truncate max-w-[150px] block" title={customerName}>
                      {customerName}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-ink-700">{d.customer_po || "—"}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-ink-800">{d.serial_number || "—"}</span>
                  </Td>
                  <Td>
                    <span className="text-xs font-semibold text-ink-800">{d.quantity ?? 1}</span>
                  </Td>
                  <Td>{getStatusBadge(d.status)}</Td>
                  <Td>
                    <span className="text-xs text-ink-500">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {d.generated_pdf_path && (
                        <a
                          href={`/api/coc/${d.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100"
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      )}
                      <Link
                        href={`/coc/${d.id}`}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </Link>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
            Load 50 more certificates
          </Button>
        </div>
      )}
    </div>
  );
}
