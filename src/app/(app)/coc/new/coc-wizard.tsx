"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Badge,
  Field,
  Label,
  Alert,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { D365ProductionOrder } from "@/lib/integrations/d365/types";
import {
  Search,
  CheckCircle2,
  FileCheck,
  PenTool,
  Eye,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Plus,
  ExternalLink,
  AlertCircle,
  Info,
  Edit3,
} from "lucide-react";

interface TemplateSummary {
  id: string;
  name: string;
  template_type: string;
  active_version_id: string | null;
  active_version_number: number;
}

export function CocWizard({
  templates,
  userName,
  userEmail,
}: {
  templates: TemplateSummary[];
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Template selection
  const publishedTemplates = templates.filter((t) => t.active_version_id);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    publishedTemplates[0]?.id || templates[0]?.id || ""
  );

  // PO Search & Selection
  const [poQuery, setPoQuery] = useState("");
  const [searchResults, setSearchResults] = useState<D365ProductionOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<D365ProductionOrder | null>(null);
  const [searching, setSearching] = useState(false);
  const [d365Mode, setD365Mode] = useState<"mock" | "live">("mock");
  const [d365Error, setD365Error] = useState<string | null>(null);

  // Manual / Custom Order Entry
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualOrder, setManualOrder] = useState<D365ProductionOrder>({
    ProductionOrder: "",
    ItemNumber: "",
    ItemDescription: "",
    CustomerAccount: "CUST-HSIN",
    CustomerName: "HydraSpecma India Pvt Ltd",
    CustomerPO: "",
    SalesOrder: "",
    SalesLine: "1.0",
    BatchNumber: "",
    SerialNumber: "",
    DrawingNumber: "",
    Revision: "Rev 01",
    Quantity: 100,
    UnitOfMeasure: "Pcs",
    RemainingQuantity: 100,
    Specification: "ISO 9001:2015 / HydraSpecma Technical Standard",
  });

  const openManualOrder = (defaultQuery = "") => {
    const q = defaultQuery.trim();
    setManualOrder({
      ProductionOrder: q || "PO-" + new Date().getFullYear() + "-001",
      ItemNumber: q || "1071.0747",
      ItemDescription: q ? `HydraSpecma Assembly (${q})` : "Hydraulic Hose Assembly DN16",
      CustomerAccount: "CUST-HSIN",
      CustomerName: "HydraSpecma India Pvt Ltd",
      CustomerPO: "PO-HSIN-74721",
      SalesOrder: "SO-74721",
      SalesLine: "1.0",
      BatchNumber: "HS-B24-0747",
      SerialNumber: "SN-0747-01",
      DrawingNumber: q ? `DWG-${q}` : "DWG-1071-0747",
      Revision: "Rev 01",
      Quantity: 100,
      UnitOfMeasure: "Pcs",
      RemainingQuantity: 100,
      Specification: "ISO 9001:2015 / EN 853 2SN, Max WP 350 bar",
    });
    setShowManualModal(true);
  };

  // Quality & Manual Form Fields
  const [manualFields, setManualFields] = useState({
    InspectorName: userName || userEmail || "Quality Inspector",
    InspectionDate: new Date().toISOString().slice(0, 10),
    TestPressureBar: "275 bar",
    VisualInspection: "Passed - No surface defects or cracks",
    DimensionalCheck: "Conforms to engineering drawing tolerances",
    TorqueCheck: "45 Nm verified per assembly specification",
    Comments: "All test criteria satisfied. Conforms to ISO 9001:2015 / HydraSpecma requirements.",
  });

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");

  // Preview & Generating
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Initial PO search
  useEffect(() => {
    searchOrders("");
  }, []);

  const searchOrders = async (q: string) => {
    setSearching(true);
    setD365Error(null);
    try {
      const res = await api<{ ok: boolean; mode?: "mock" | "live"; orders: D365ProductionOrder[]; error?: string }>(
        `/api/d365/production-orders?q=${encodeURIComponent(q)}`
      );
      if (res.mode) setD365Mode(res.mode);
      if (res.error) setD365Error(res.error);

      const orders = res.orders || [];
      setSearchResults(orders);
      if (orders.length > 0) {
        if (!selectedPO || !orders.some((o) => o.ProductionOrder === selectedPO.ProductionOrder)) {
          setSelectedPO(orders[0]);
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      setD365Error(msg);
      toast.error("Failed to load production orders", msg);
    } finally {
      setSearching(false);
    }
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      setSignatureDataUrl(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSignatureDataUrl("");
  };

  const generatePreview = async () => {
    if (!selectedPO) return;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/coc/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionOrder: selectedPO.ProductionOrder,
          itemNumber: selectedPO.ItemNumber,
          itemDescription: selectedPO.ItemDescription,
          customerName: selectedPO.CustomerName,
          customerPO: selectedPO.CustomerPO,
          salesOrder: selectedPO.SalesOrder,
          batchNumber: selectedPO.BatchNumber,
          serialNumber: selectedPO.SerialNumber,
          quantity: selectedPO.Quantity,
          unitOfMeasure: selectedPO.UnitOfMeasure,
          manualValues: manualFields,
          signatureBase64: signatureDataUrl,
        }),
      });

      if (!res.ok) throw new Error("Preview generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (e) {
      toast.error("Preview error", (e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateCoc = async () => {
    if (!selectedPO) {
      toast.error("Please select a production order");
      return;
    }

    const tpl = templates.find((t) => t.id === selectedTemplateId) || templates[0];
    if (!tpl) {
      toast.error("No template available");
      return;
    }

    setGenerating(true);
    try {
      const res = await api<{ ok: boolean; documentId: string; cocNumber: string }>("/api/coc", {
        method: "POST",
        json: {
          templateId: tpl.id,
          templateVersionId: tpl.active_version_id || tpl.id,
          templateVersionNumber: tpl.active_version_number || 1,
          productionOrder: selectedPO.ProductionOrder,
          itemNumber: selectedPO.ItemNumber,
          itemDescription: selectedPO.ItemDescription,
          customerName: selectedPO.CustomerName,
          customerPO: selectedPO.CustomerPO,
          salesOrder: selectedPO.SalesOrder,
          salesLine: selectedPO.SalesLine,
          customerAccount: selectedPO.CustomerAccount,
          quantity: selectedPO.Quantity,
          unitOfMeasure: selectedPO.UnitOfMeasure,
          batchNumber: selectedPO.BatchNumber,
          serialNumber: selectedPO.SerialNumber,
          manualValues: manualFields,
          signatureBase64: signatureDataUrl,
        },
      });

      if (res.ok) {
        toast.success(`Generated ${res.cocNumber} successfully!`);
        router.push(`/coc/${res.documentId}`);
      }
    } catch (err) {
      toast.error("COC Generation Failed", (err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <PageHeader
        title="Create Certificate of Conformity"
        description="Issue an official COC by selecting a production order, validating quality parameters, and applying an authorized digital signature."
      />

      {/* Step Progress Bar */}
      <div className="mb-8 grid grid-cols-4 gap-2">
        {[
          { num: 1, label: "Select Order", icon: FileCheck },
          { num: 2, label: "Quality Checks", icon: Sparkles },
          { num: 3, label: "Digital Sign", icon: PenTool },
          { num: 4, label: "Review & Issue", icon: Eye },
        ].map((s) => (
          <button
            key={s.num}
            onClick={() => {
              if (s.num === 4) generatePreview();
              setStep(s.num as never);
            }}
            className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
              step === s.num
                ? "border-brand-500 bg-brand-50/50 text-ink-900"
                : step > s.num
                ? "border-emerald-300 bg-emerald-50/30 text-emerald-800"
                : "border-ink-200 bg-white text-ink-500"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step === s.num
                  ? "bg-brand-500 text-ink-900"
                  : step > s.num
                  ? "bg-emerald-600 text-white"
                  : "bg-ink-100 text-ink-600"
              }`}
            >
              {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold leading-none">{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Step 1: Production Order & Template Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="1. Document Template"
              description="Choose the approved layout template for this certificate."
            />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      selectedTemplateId === tpl.id
                        ? "border-brand-500 bg-brand-50/30 ring-2 ring-brand-400"
                        : "border-ink-200 hover:border-ink-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-ink-900">{tpl.name}</div>
                      <Badge tone={tpl.active_version_id ? "success" : "warning"}>
                        {tpl.active_version_id ? "Published v" + tpl.active_version_number : "Draft"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      Standard A4 Portrait Certificate • ISO 9001:2015 Compliant
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="2. Lookup Dynamics 365 Production Order"
              description="Search by Production Order Number, Item Number, Customer PO, or Batch."
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={d365Mode === "live" ? "success" : "warning"}>
                    {d365Mode === "live" ? "D365 Live ERP" : "Demo / Mock Mode"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openManualOrder(poQuery)}
                    className="gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Enter Manually
                  </Button>
                </div>
              }
            />
            <CardBody className="space-y-4">
              {/* Integration Status Notice */}
              {d365Mode === "mock" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">Demo / Simulated Mode Active</p>
                      <p className="mt-0.5 text-amber-800">
                        Orders shown are built-in sample HydraSpecma assemblies. To retrieve live orders directly from your Microsoft Dynamics 365 F&O tenant, enter your credentials in{" "}
                        <Link href="/admin/settings" className="font-bold underline hover:text-amber-950">
                          Admin Settings &rarr;
                        </Link>
                        . You can also click <strong>&quot;Enter Manually&quot;</strong> to use any custom production order number.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {d365Error && (
                <Alert tone="danger" title="Dynamics 365 ERP Notice">
                  <div className="text-xs space-y-1">
                    <p>{d365Error}</p>
                    <p>
                      Please verify your D365 URL, tenant, and client secret in{" "}
                      <Link href="/admin/settings" className="font-bold underline">
                        System Settings
                      </Link>
                      , or enter your order details manually below.
                    </p>
                  </div>
                </Alert>
              )}

              {/* Search Bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
                  <Input
                    value={poQuery}
                    onChange={(e) => setPoQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchOrders(poQuery)}
                    placeholder="Search production order or item number (e.g. 1071.0747, PO-2026-10710747, Hose)..."
                    className="pl-9"
                  />
                </div>
                <Button loading={searching} onClick={() => searchOrders(poQuery)}>
                  Search D365
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openManualOrder(poQuery)}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Custom Order
                </Button>
              </div>

              {/* Manual Order Entry Form */}
              {showManualModal && (
                <div className="rounded-xl border-2 border-brand-400 bg-brand-50/50 p-5 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-brand-200 pb-3">
                    <div>
                      <h4 className="font-semibold text-ink-900 flex items-center gap-2">
                        <Edit3 className="h-4 w-4 text-brand-600" />
                        Custom / Manual Production Order
                      </h4>
                      <p className="text-xs text-ink-600">
                        Specify details for this production order to proceed with COC generation.
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowManualModal(false)}>
                      Cancel
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    <Field label="Production Order Number *">
                      <Input
                        value={manualOrder.ProductionOrder}
                        onChange={(e) => setManualOrder({ ...manualOrder, ProductionOrder: e.target.value })}
                        placeholder="e.g. 1071.0747"
                        required
                      />
                    </Field>
                    <Field label="Item / Part Number *">
                      <Input
                        value={manualOrder.ItemNumber}
                        onChange={(e) => setManualOrder({ ...manualOrder, ItemNumber: e.target.value })}
                        placeholder="e.g. 1071.0747"
                        required
                      />
                    </Field>
                    <Field label="Item Description *">
                      <Input
                        value={manualOrder.ItemDescription}
                        onChange={(e) => setManualOrder({ ...manualOrder, ItemDescription: e.target.value })}
                        placeholder="e.g. High Pressure Flexible Hose Assembly"
                        required
                      />
                    </Field>
                    <Field label="Customer Name">
                      <Input
                        value={manualOrder.CustomerName}
                        onChange={(e) => setManualOrder({ ...manualOrder, CustomerName: e.target.value })}
                        placeholder="e.g. HydraSpecma India Pvt Ltd"
                      />
                    </Field>
                    <Field label="Customer PO">
                      <Input
                        value={manualOrder.CustomerPO}
                        onChange={(e) => setManualOrder({ ...manualOrder, CustomerPO: e.target.value })}
                        placeholder="e.g. PO-HSIN-74721"
                      />
                    </Field>
                    <Field label="Batch Number">
                      <Input
                        value={manualOrder.BatchNumber}
                        onChange={(e) => setManualOrder({ ...manualOrder, BatchNumber: e.target.value })}
                        placeholder="e.g. HS-B24-0747"
                      />
                    </Field>
                    <Field label="Quantity">
                      <Input
                        type="number"
                        value={manualOrder.Quantity}
                        onChange={(e) => setManualOrder({ ...manualOrder, Quantity: Number(e.target.value) || 1 })}
                      />
                    </Field>
                    <Field label="Unit of Measure">
                      <Input
                        value={manualOrder.UnitOfMeasure}
                        onChange={(e) => setManualOrder({ ...manualOrder, UnitOfMeasure: e.target.value })}
                        placeholder="Pcs"
                      />
                    </Field>
                    <Field label="Sales Order Number">
                      <Input
                        value={manualOrder.SalesOrder}
                        onChange={(e) => setManualOrder({ ...manualOrder, SalesOrder: e.target.value })}
                        placeholder="e.g. SO-74721"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-brand-200">
                    <Button variant="outline" size="sm" onClick={() => setShowManualModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!manualOrder.ProductionOrder.trim() || !manualOrder.ItemNumber.trim() || !manualOrder.ItemDescription.trim()) {
                          toast.error("Please fill required fields: Production Order, Item Number, and Description");
                          return;
                        }
                        setSelectedPO({ ...manualOrder });
                        setShowManualModal(false);
                        toast.success(`Applied order: ${manualOrder.ProductionOrder}`);
                      }}
                    >
                      Apply This Production Order
                    </Button>
                  </div>
                </div>
              )}

              {/* Order Cards / Empty State */}
              {searchResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center bg-ink-50/50">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                    <Search className="h-5 w-5" />
                  </div>
                  <h4 className="mt-3 text-sm font-semibold text-ink-900">
                    {poQuery ? `No orders found matching "${poQuery}"` : "No production orders available"}
                  </h4>
                  <p className="mt-1 text-xs text-ink-500 max-w-md mx-auto">
                    {d365Mode === "mock"
                      ? "The mock dataset did not find this item. You can click below to use this number directly, or switch to Live ERP in Admin Settings."
                      : "Dynamics 365 did not return any records for this query. You can enter details manually to continue."}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <Button
                      size="sm"
                      onClick={() => openManualOrder(poQuery)}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Use &quot;{poQuery || "1071.0747"}&quot; as Production Order
                    </Button>
                    <Link
                      href="/admin/settings"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 underline"
                    >
                      D365 Settings <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {searchResults.map((order) => {
                    const isSelected = selectedPO?.ProductionOrder === order.ProductionOrder;
                    return (
                      <div
                        key={order.ProductionOrder}
                        onClick={() => setSelectedPO(order)}
                        className={`cursor-pointer rounded-lg border p-4 transition-all ${
                          isSelected
                            ? "border-brand-500 bg-brand-50/30 ring-2 ring-brand-400 shadow-sm"
                            : "border-ink-200 hover:border-ink-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-brand-700">
                            {order.ProductionOrder}
                          </span>
                          <Badge tone="info">{order.CustomerName}</Badge>
                        </div>
                        <div className="mt-1 font-semibold text-sm text-ink-900 line-clamp-1">
                          {order.ItemDescription}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-600">
                          <div>Part: <span className="font-mono font-medium text-ink-900">{order.ItemNumber}</span></div>
                          <div>PO: <span className="font-medium">{order.CustomerPO || "—"}</span></div>
                          <div>Batch: <span className="font-mono">{order.BatchNumber || "—"}</span></div>
                          <div>Qty: <span className="font-semibold text-ink-900">{order.Quantity} {order.UnitOfMeasure}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Order Summary */}
              {selectedPO && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-emerald-950">
                          Selected Order: <span className="font-mono font-bold text-brand-700">{selectedPO.ProductionOrder}</span> &bull; {selectedPO.ItemDescription}
                        </div>
                        <div className="text-xs text-emerald-800 mt-0.5">
                          Part: <span className="font-mono font-medium">{selectedPO.ItemNumber}</span> &bull; Customer: <strong>{selectedPO.CustomerName}</strong> &bull; Qty: <strong>{selectedPO.Quantity} {selectedPO.UnitOfMeasure}</strong>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setManualOrder({ ...selectedPO });
                        setShowManualModal(true);
                      }}
                      className="text-xs gap-1"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit Details
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-ink-200">
                <Button
                  disabled={!selectedPO}
                  onClick={() => setStep(2)}
                  className="gap-2"
                >
                  Next: Quality Checks <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Step 2: Quality Inspection Data */}
      {step === 2 && (
        <Card>
          <CardHeader
            title="Quality Verification & Inspection Parameters"
            description="Verify physical measurements, hydraulic pressure testing, and inspector details."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Inspector Name">
                <Input
                  value={manualFields.InspectorName}
                  onChange={(e) => setManualFields({ ...manualFields, InspectorName: e.target.value })}
                  required
                />
              </Field>

              <Field label="Inspection Date">
                <Input
                  type="date"
                  value={manualFields.InspectionDate}
                  onChange={(e) => setManualFields({ ...manualFields, InspectionDate: e.target.value })}
                  required
                />
              </Field>

              <Field label="Hydraulic Test Pressure" hint="e.g. 275 bar / 4000 psi">
                <Input
                  value={manualFields.TestPressureBar}
                  onChange={(e) => setManualFields({ ...manualFields, TestPressureBar: e.target.value })}
                />
              </Field>

              <Field label="Torque / Assembly Check">
                <Input
                  value={manualFields.TorqueCheck}
                  onChange={(e) => setManualFields({ ...manualFields, TorqueCheck: e.target.value })}
                />
              </Field>

              <Field label="Dimensional Verification Status">
                <Input
                  value={manualFields.DimensionalCheck}
                  onChange={(e) => setManualFields({ ...manualFields, DimensionalCheck: e.target.value })}
                />
              </Field>

              <Field label="Visual & Surface Finish Check">
                <Input
                  value={manualFields.VisualInspection}
                  onChange={(e) => setManualFields({ ...manualFields, VisualInspection: e.target.value })}
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="Compliance Remarks & Notes">
                  <Input
                    value={manualFields.Comments}
                    onChange={(e) => setManualFields({ ...manualFields, Comments: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-ink-200">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)} className="gap-2">
                Next: Digital Signature <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 3: Digital Signature */}
      {step === 3 && (
        <Card>
          <CardHeader
            title="Authorized Digital Signature"
            description="Sign on the canvas pad below using your mouse or touchscreen to sign off on quality verification."
            actions={
              <Button variant="outline" size="sm" onClick={clearSignature}>
                <RotateCcw className="h-3.5 w-3.5" /> Clear Signature
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink-300 bg-ink-50/50 p-6">
              <canvas
                ref={canvasRef}
                width={480}
                height={160}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="rounded border border-ink-200 bg-white shadow-inner cursor-crosshair touch-none"
              />
              <div className="mt-2 text-xs text-ink-500">
                Sign inside the box above with your mouse, pen, or finger.
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-ink-200">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => {
                  generatePreview();
                  setStep(4);
                }}
                className="gap-2"
              >
                Next: Preview & Issue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 4: Preview & Issue Certificate */}
      {step === 4 && (
        <Card>
          <CardHeader
            title="Final Review & Certificate Issuance"
            description="Review the rendered PDF certificate before registering it in Dynamics 365 and SharePoint."
            actions={
              <Button
                size="md"
                loading={generating}
                onClick={handleCreateCoc}
                className="bg-brand-500 hover:bg-brand-600 text-ink-900 font-semibold gap-2 border-brand-500"
              >
                <FileCheck className="h-4 w-4" />
                Generate & Issue Official COC
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {previewLoading ? (
              <div className="flex h-96 items-center justify-center rounded-lg border border-ink-200 bg-ink-50">
                <div className="text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-r-transparent" />
                  <div className="mt-2 text-sm font-medium text-ink-600">Rendering preview PDF...</div>
                </div>
              </div>
            ) : previewUrl ? (
              <div className="rounded-lg border border-ink-200 overflow-hidden shadow-sm">
                <iframe src={previewUrl} className="w-full h-[650px]" title="COC Preview" />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-ink-200 bg-ink-50">
                <Button onClick={generatePreview}>Click to Load PDF Preview</Button>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-ink-200">
              <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to Signature
              </Button>
              <Button
                loading={generating}
                onClick={handleCreateCoc}
                className="bg-brand-500 hover:bg-brand-600 text-ink-900 font-semibold gap-2 border-brand-500"
              >
                <FileCheck className="h-4 w-4" />
                Confirm & Issue Official Certificate
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
