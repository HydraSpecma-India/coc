"use client";

import { useState } from "react";
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
import { Search, Download, ExternalLink, Plus, FileCheck } from "lucide-react";

export function HistoryClient({ initialDocs }: { initialDocs: COCDocumentRow[] }) {
  const [docs, setDocs] = useState<COCDocumentRow[]>(initialDocs);
  const [query, setQuery] = useState("");

  const filtered = docs.filter((d) => {
    const q = query.toLowerCase();
    return (
      (d.coc_number && d.coc_number.toLowerCase().includes(q)) ||
      d.production_order.toLowerCase().includes(q) ||
      (d.item_number && d.item_number.toLowerCase().includes(q)) ||
      (d.customer_po && d.customer_po.toLowerCase().includes(q))
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

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <PageHeader
        title="COC Document History"
        description="Search, inspect, and download historical Certificates of Conformity issued across all production lines."
        actions={
          <Link href="/coc/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New COC
            </Button>
          </Link>
        }
      />

      <Card className="mb-6">
        <CardBody className="flex items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by COC Number, PO Number, Part Number..."
              className="pl-9"
            />
          </div>
          <div className="text-xs text-ink-500 font-medium">
            Total records: {docs.length}
          </div>
        </CardBody>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th>COC Number</Th>
            <Th>Production Order</Th>
            <Th>Item / Description</Th>
            <Th>Customer PO</Th>
            <Th>Qty</Th>
            <Th>Status</Th>
            <Th>Issued Date</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-500">
                <FileCheck className="mx-auto h-8 w-8 text-ink-300 mb-2" />
                No Certificates of Conformity found. Create one using the &quot;New COC&quot; button above.
              </td>
            </tr>
          ) : (
            filtered.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Link href={`/coc/${d.id}`} className="font-mono text-xs font-bold text-brand-700 hover:underline">
                    {d.coc_number || "DRAFT-" + d.id.slice(0, 6)}
                  </Link>
                </Td>
                <Td>
                  <span className="font-mono text-xs font-medium text-ink-800">{d.production_order}</span>
                </Td>
                <Td>
                  <div className="font-semibold text-xs text-ink-900">{d.item_number}</div>
                  <div className="text-[11px] text-ink-500 line-clamp-1">{d.item_description}</div>
                </Td>
                <Td>
                  <span className="text-xs text-ink-700">{d.customer_po || "—"}</span>
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
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
