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
  Select,
  Badge,
  Field,
  Label,
  Alert,
  Dialog,
  Textarea,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { D365ProductionOrder, D365SalesOrderLine } from "@/lib/integrations/d365/types";
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
  Building2,
  ShieldCheck,
  Check,
  Filter,
  Upload,
  PencilRuler,
  FileUp,
  ShoppingCart,
  Tag,
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
  const [templateList, setTemplateList] = useState<TemplateSummary[]>(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates.find((t) => t.active_version_id)?.id || templates[0]?.id || ""
  );
  const [showUploadPdfModal, setShowUploadPdfModal] = useState(false);
  const [uploadPdfFile, setUploadPdfFile] = useState<File | null>(null);
  const [uploadPdfName, setUploadPdfName] = useState("");
  const [uploadPdfDesc, setUploadPdfDesc] = useState("");
  const [uploadPdfRevision, setUploadPdfRevision] = useState("Rev 01");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [modifyingTemplate, setModifyingTemplate] = useState(false);

  const handleModifyTemplate = async (templateIdToEdit: string) => {
    setModifyingTemplate(true);
    try {
      const res = await api<{ ok: boolean; templateId: string; versionId: string }>("/api/templates/ensure-draft", {
        method: "POST",
        json: { templateId: templateIdToEdit },
      });
      if (res.ok && res.templateId && res.versionId) {
        toast.success("Opening template designer...");
        router.push(`/admin/templates/${res.templateId}/designer/${res.versionId}`);
      }
    } catch (e) {
      toast.error("Could not open template designer", (e as Error).message);
    } finally {
      setModifyingTemplate(false);
    }
  };

  const handleUploadPdfSubmit = async () => {
    if (!uploadPdfFile) {
      toast.error("Please select a PDF file");
      return;
    }
    const name = uploadPdfName.trim() || uploadPdfFile.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadPdfFile);
      fd.append("name", name);
      fd.append("description", uploadPdfDesc.trim() || "Created from uploaded PDF");
      fd.append("revision", uploadPdfRevision.trim() || "Rev 01");
      fd.append("publish", "true");

      const res = await api<{
        ok: boolean;
        template: { id: string; name: string; template_type: string; active_version_id: string; active_version_number: number };
        version: { id: string };
      }>("/api/templates/from-pdf", {
        method: "POST",
        body: fd,
      });

      if (res.ok && res.template) {
        const newSummary: TemplateSummary = {
          id: res.template.id,
          name: res.template.name,
          template_type: res.template.template_type,
          active_version_id: res.template.active_version_id,
          active_version_number: res.template.active_version_number || 1,
        };
        setTemplateList((prev) => [newSummary, ...prev]);
        setSelectedTemplateId(newSummary.id);
        setShowUploadPdfModal(false);
        setUploadPdfFile(null);
        setUploadPdfName("");
        setUploadPdfDesc("");
        toast.success(`Template "${newSummary.name}" created from PDF and selected!`);
      }
    } catch (e) {
      toast.error("Failed to upload template PDF", (e as Error).message);
    } finally {
      setUploadingPdf(false);
    }
  };

  // PO Search & Selection
  const [selectedCompany, setSelectedCompany] = useState<string>("HSIN");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL_ACTIVE");
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
    CustomerAccount: "HSIN",
    CustomerName: "HydraSpecma India Pvt Ltd",
    CustomerPO: "4509008214",
    CustomerPartNumber: "160072",
    dataAreaId: "HSIN",
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

  // Sales Order selection state for active Production Order
  const [salesOrders, setSalesOrders] = useState<D365SalesOrderLine[]>([]);
  const [loadingSalesOrders, setLoadingSalesOrders] = useState(false);
  const [isCustomSO, setIsCustomSO] = useState(false);
  const [customSOValue, setCustomSOValue] = useState("");

  // Sales Order selection state for Manual / Custom Order Modal
  const [modalSalesOrders, setModalSalesOrders] = useState<D365SalesOrderLine[]>([]);
  const [loadingModalSO, setLoadingModalSO] = useState(false);
  const [modalIsCustomSO, setModalIsCustomSO] = useState(false);

  const fetchSalesOrdersForPO = async (
    itemNumber: string,
    company = selectedCompany,
    currentPO?: D365ProductionOrder
  ) => {
    const cleanItem = itemNumber?.trim();
    if (!cleanItem) return;
    setLoadingSalesOrders(true);
    setIsCustomSO(false);
    try {
      const compParam = company && company !== "ALL" ? `&company=${encodeURIComponent(company)}` : "";
      const res = await api<{
        ok: boolean;
        mode?: "mock" | "live";
        salesOrders: D365SalesOrderLine[];
        error?: string;
      }>(`/api/d365/sales-orders?itemNumber=${encodeURIComponent(cleanItem)}${compParam}`);

      const list = res.salesOrders || [];
      setSalesOrders(list);

      const targetOrder = currentPO || selectedPO;
      const targetSO = targetOrder?.SalesOrder?.trim().toLowerCase();
      const matched = (targetSO ? list.find((so) => so.SalesOrder.toLowerCase() === targetSO) : null) || list[0];

      if (matched) {
        const extPart = matched.ExternalItemNumber || targetOrder?.CustomerPartNumber || "160072";
        const poNum = matched.CustomerPO || targetOrder?.CustomerPO || "4509008214";
        const custName = matched.CustomerName || targetOrder?.CustomerName || "HydraSpecma India Pvt Ltd";

        setSelectedPO((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            SalesOrder: matched.SalesOrder,
            CustomerPartNumber: extPart,
            CustomerPO: poNum,
            CustomerName: custName,
          };
        });

        setManualFields((prev) => ({
          ...prev,
          CustomerPartNo: extPart,
          CustomerPO: poNum,
        }));
      }
    } catch (e) {
      console.warn("Could not fetch sales orders for item", e);
    } finally {
      setLoadingSalesOrders(false);
    }
  };

  const fetchModalSalesOrders = async (itemNumber: string, company = selectedCompany) => {
    const cleanItem = itemNumber?.trim();
    if (!cleanItem) return;
    setLoadingModalSO(true);
    try {
      const compParam = company && company !== "ALL" ? `&company=${encodeURIComponent(company)}` : "";
      const res = await api<{
        ok: boolean;
        mode?: "mock" | "live";
        salesOrders: D365SalesOrderLine[];
        error?: string;
      }>(`/api/d365/sales-orders?itemNumber=${encodeURIComponent(cleanItem)}${compParam}`);

      const list = res.salesOrders || [];
      setModalSalesOrders(list);

      if (list.length > 0) {
        const matched = list.find((so) => so.SalesOrder.toLowerCase() === manualOrder.SalesOrder?.toLowerCase()) || list[0];
        if (matched) {
          setManualOrder((prev) => ({
            ...prev,
            SalesOrder: matched.SalesOrder,
            CustomerPartNumber: matched.ExternalItemNumber || prev.CustomerPartNumber || "160072",
            CustomerPO: matched.CustomerPO || prev.CustomerPO,
            CustomerName: matched.CustomerName || prev.CustomerName,
          }));
        }
      }
    } catch (e) {
      console.warn("Could not fetch modal sales orders", e);
    } finally {
      setLoadingModalSO(false);
    }
  };

  // Serial number conflict check & auto-increment state
  const [existingCocs, setExistingCocs] = useState<Array<{ coc_number: string; serial_number: string | null; status: string }>>([]);
  const [serialWarning, setSerialWarning] = useState<string | null>(null);
  const [serialNotice, setSerialNotice] = useState<string | null>(null);

  const fetchExistingCocsForPO = async (productionOrder: string, itemNumber: string) => {
    const cleanPO = productionOrder?.trim();
    if (!cleanPO) return;
    try {
      const res = await api<{ ok: boolean; documents: Array<{ coc_number: string; serial_number: string | null; status: string }> }>(
        `/api/coc?productionOrder=${encodeURIComponent(cleanPO)}`
      );
      const docs = (res.documents || []).filter((d) => d.status !== "CANCELLED");
      setExistingCocs(docs);

      const usedSerials = docs.map((d) => d.serial_number?.trim()).filter(Boolean) as string[];

      // Calculate next recommended serial number
      const basePrefix = `${itemNumber || cleanPO} - SN`;
      let nextNum = 1;
      for (const s of usedSerials) {
        const match = s.match(/SN(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= nextNum) {
            nextNum = num + 1;
          }
        }
      }

      const nextSerial = `${basePrefix}${String(nextNum).padStart(3, "0")}`;

      if (usedSerials.length > 0) {
        const lastDoc = docs[0]?.coc_number || "Existing Certificate";
        setSerialNotice(
          `Auto-selected next unit: SN${String(nextNum).padStart(3, "0")} (${lastDoc} already issued for earlier unit)`
        );
      } else {
        setSerialNotice(null);
      }

      setManualFields((prev) => ({
        ...prev,
        SerialNumber: nextSerial,
      }));
    } catch (e) {
      console.warn("Could not fetch existing COCs for order", e);
    }
  };


  const handleSelectSalesOrder = (soNumber: string) => {
    if (soNumber === "__custom__") {
      setIsCustomSO(true);
      return;
    }
    setIsCustomSO(false);
    const matched = salesOrders.find((so) => so.SalesOrder === soNumber);
    if (matched) {
      const extPart = matched.ExternalItemNumber || "160072";
      const poNum = matched.CustomerPO || selectedPO?.CustomerPO || "4509008214";
      const custName = matched.CustomerName || selectedPO?.CustomerName || "HydraSpecma India Pvt Ltd";

      setSelectedPO((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          SalesOrder: matched.SalesOrder,
          CustomerPartNumber: extPart,
          CustomerPO: poNum,
          CustomerName: custName,
        };
      });

      setManualFields((prev) => ({
        ...prev,
        CustomerPartNo: extPart,
        CustomerPO: poNum,
      }));

      toast.success(`Selected Sales Order ${matched.SalesOrder} (Customer Part: ${extPart})`);
    }
  };

  const handleSelectModalSalesOrder = (soNumber: string) => {
    if (soNumber === "__custom__") {
      setModalIsCustomSO(true);
      return;
    }
    setModalIsCustomSO(false);
    const matched = modalSalesOrders.find((so) => so.SalesOrder === soNumber);
    if (matched) {
      setManualOrder((prev) => ({
        ...prev,
        SalesOrder: matched.SalesOrder,
        CustomerPartNumber: matched.ExternalItemNumber || prev.CustomerPartNumber || "160072",
        CustomerPO: matched.CustomerPO || prev.CustomerPO,
        CustomerName: matched.CustomerName || prev.CustomerName,
      }));
    }
  };

  const openManualOrder = (defaultQuery = "") => {
    const q = defaultQuery.trim();
    const defaultItem = q || "1070.0049";
    const comp = selectedCompany !== "ALL" ? selectedCompany : "HSIN";
    const initialOrder: D365ProductionOrder = {
      ProductionOrder: q || "HSIN-008617",
      ItemNumber: defaultItem,
      ItemDescription: q ? `HydraSpecma Assembly (${q})` : "Baseframe Module",
      CustomerAccount: comp,
      CustomerName: comp === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD",
      CustomerPO: "4509008214",
      CustomerPartNumber: defaultItem === "1070.0049" ? "29107156" : "160072",
      dataAreaId: comp,
      SalesOrder: defaultItem === "1070.0049" ? "SO-1070-01" : "SO-002859",
      SalesLine: "1.0",
      BatchNumber: "HS-B24-0747",
      SerialNumber: `SN-${defaultItem}-01`,
      DrawingNumber: `DWG-${defaultItem}`,
      Revision: "Rev 02",
      Quantity: 1,
      UnitOfMeasure: "Pcs",
      RemainingQuantity: 1,
      Specification: "DIN EN 853 2SN, Max WP 275 bar",
    };
    setManualOrder(initialOrder);
    setModalIsCustomSO(false);
    setShowManualModal(true);
    fetchModalSalesOrders(defaultItem, comp);
  };

  // Quality & Official Checklist Fields (Aligned with 1 COC-1070.0049-Rev.02-merged 1.pdf)
  const [manualFields, setManualFields] = useState({
    InspectorName: userName || userEmail || "Quality Inspector",
    InspectionDate: new Date().toISOString().slice(0, 10),
    CustomerPartNo: "160072",
    CustomerPO: "4509008214",
    SerialNumber: "",
    CustomerSpec: "0068-7211 / 0069-2093 - Latest version",
    Comments: "All test criteria satisfied. Conforms to ISO 9001:2015 / HydraSpecma requirements.",
    Step1_Assembled: "Passed",
    Step2_AirLeakTest: "Passed",
    Step3_AirFanTest: "Passed",
    Step4_InterfaceDimension: "Passed",
    Step5_FlatnessBaseframe: "Passed",
    Step6_PipeSystemLeak: "Passed",
    Step7_PartTraceability: "Passed",
    Step8_CompleteInspection: "Passed",
    Step9_Packing: "Passed",
    TestPressureBar: "275 bar",
    VisualInspection: "Passed - No surface defects or cracks",
    DimensionalCheck: "Conforms to engineering drawing tolerances",
    TorqueCheck: "45 Nm verified per assembly specification",
  });

  // Real-time conflict warning when user edits serial number
  useEffect(() => {
    if (!manualFields.SerialNumber || !existingCocs.length) {
      setSerialWarning(null);
      return;
    }
    const entered = manualFields.SerialNumber.trim().toLowerCase();
    const conflict = existingCocs.find(
      (c) => c.serial_number && c.serial_number.trim().toLowerCase() === entered
    );
    if (conflict) {
      setSerialWarning(
        `A Certificate (${conflict.coc_number}) has already been issued for this production order with Serial Number "${conflict.serial_number}". Please change the Serial Number (e.g. next unit suffix) to proceed.`
      );
    } else {
      setSerialWarning(null);
    }
  }, [manualFields.SerialNumber, existingCocs]);

  // Signature canvas state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");

  // Preview & Generating state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const applySelectedPO = (order: D365ProductionOrder) => {
    setSelectedPO(order);
    const initialExtPart = order.CustomerPartNumber || "160072";
    setManualFields((prev) => ({
      ...prev,
      CustomerPartNo: initialExtPart,
      CustomerPO: order.CustomerPO || prev.CustomerPO || "4509008214",
      SerialNumber: order.SerialNumber || `${order.ItemNumber || order.ProductionOrder} - SN001`,
    }));
    fetchSalesOrdersForPO(order.ItemNumber, order.dataAreaId || selectedCompany, order);
    fetchExistingCocsForPO(order.ProductionOrder, order.ItemNumber);
  };

  // Initial PO search
  useEffect(() => {
    searchOrders("", "HSIN", "ALL_ACTIVE");
  }, []);

  const searchOrders = async (q: string, comp = selectedCompany, st = selectedStatus) => {
    setSearching(true);
    setD365Error(null);
    try {
      const compParam = comp ? `&company=${encodeURIComponent(comp)}` : "";
      const statusParam = st ? `&status=${encodeURIComponent(st)}` : "";
      const res = await api<{ ok: boolean; mode?: "mock" | "live"; orders: D365ProductionOrder[]; error?: string }>(
        `/api/d365/production-orders?q=${encodeURIComponent(q)}${compParam}${statusParam}`
      );
      if (res.mode) setD365Mode(res.mode);
      if (res.error) setD365Error(res.error);

      const orders = res.orders || [];
      setSearchResults(orders);
      if (orders.length > 0) {
        if (!selectedPO || !orders.some((o) => o.ProductionOrder === selectedPO.ProductionOrder)) {
          applySelectedPO(orders[0]);
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

  const handleCompanyChange = (newCompany: string) => {
    setSelectedCompany(newCompany);
    searchOrders(poQuery, newCompany, selectedStatus);
  };

  const handleStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    searchOrders(poQuery, selectedCompany, newStatus);
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
    const prodOrder = selectedPO.ProductionOrder?.trim() || selectedPO.ItemNumber?.trim() || "PO-HSIN-001";
    const itemNum = selectedPO.ItemNumber?.trim() || prodOrder;
    const itemDesc = selectedPO.ItemDescription?.trim() || `HydraSpecma Assembly (${itemNum})`;
    const tpl = templateList.find((t) => t.id === selectedTemplateId) || templateList[0];

    try {
      const res = await fetch("/api/coc/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: tpl?.id,
          templateVersionId: tpl?.active_version_id || tpl?.id,
          productionOrder: prodOrder,
          itemNumber: itemNum,
          itemDescription: itemDesc,
          customerName: selectedPO.CustomerName || "HydraSpecma India Pvt Ltd",
          customerPO: manualFields.CustomerPO || selectedPO.CustomerPO || "4509008214",
          customerPartNumber: manualFields.CustomerPartNo || selectedPO.CustomerPartNumber || "160072",
          salesOrder: selectedPO.SalesOrder || "",
          batchNumber: selectedPO.BatchNumber || "HS-B24-0747",
          serialNumber: manualFields.SerialNumber || selectedPO.SerialNumber || "",
          quantity: selectedPO.Quantity || 1,
          unitOfMeasure: selectedPO.UnitOfMeasure || "Pcs",
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

    if (serialWarning) {
      toast.error("Duplicate Serial Number", serialWarning);
      return;
    }

    const tpl = templateList.find((t) => t.id === selectedTemplateId) || templateList[0];
    if (!tpl) {
      toast.error("No template available");
      return;
    }

    const prodOrder = selectedPO.ProductionOrder?.trim() || selectedPO.ItemNumber?.trim() || "PO-HSIN-001";
    const itemNum = selectedPO.ItemNumber?.trim() || prodOrder;
    const itemDesc = selectedPO.ItemDescription?.trim() || `HydraSpecma Assembly (${itemNum})`;

    setGenerating(true);
    try {
      const res = await api<{ ok: boolean; documentId: string; cocNumber: string }>("/api/coc", {
        method: "POST",
        json: {
          templateId: tpl.id,
          templateVersionId: tpl.active_version_id || tpl.id,
          templateVersionNumber: tpl.active_version_number || 1,
          productionOrder: prodOrder,
          itemNumber: itemNum,
          itemDescription: itemDesc,
          customerName: selectedPO.CustomerName || "HydraSpecma India Pvt Ltd",
          customerPO: manualFields.CustomerPO || selectedPO.CustomerPO || "4509008214",
          customerPartNumber: manualFields.CustomerPartNo || selectedPO.CustomerPartNumber || "160072",
          salesOrder: selectedPO.SalesOrder || "",
          salesLine: selectedPO.SalesLine || "1.0",
          customerAccount: selectedPO.CustomerAccount || selectedCompany || "HSIN",
          quantity: selectedPO.Quantity || 1,
          unitOfMeasure: selectedPO.UnitOfMeasure || "Pcs",
          batchNumber: selectedPO.BatchNumber || "HS-B24-0747",
          serialNumber: manualFields.SerialNumber || selectedPO.SerialNumber || "",
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
              description="Choose the approved layout template for this certificate, or upload a custom PDF template."
              actions={
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUploadPdfModal(true)}
                    className="gap-1.5 text-xs text-brand-800 border-brand-300 hover:bg-brand-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload PDF Template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleModifyTemplate(selectedTemplateId)}
                    loading={modifyingTemplate}
                    className="gap-1.5 text-xs text-ink-800"
                  >
                    <PencilRuler className="h-3.5 w-3.5" />
                    Modify in Designer
                  </Button>
                </div>
              }
            />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                {templateList.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`cursor-pointer rounded-lg border p-4 transition-all relative ${
                        isSelected
                          ? "border-brand-500 bg-brand-50/30 ring-2 ring-brand-400 shadow-xs"
                          : "border-ink-200 hover:border-ink-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-ink-900 line-clamp-1">{tpl.name}</div>
                        <Badge tone={tpl.active_version_id ? "success" : "warning"}>
                          {tpl.active_version_id ? "Published v" + tpl.active_version_number : "Draft"}
                        </Badge>
                      </div>
                      <div className="mt-1.5 text-xs text-ink-500 flex items-center justify-between">
                        <span>Standard A4 Portrait Certificate • ISO 9001:2015 Compliant</span>
                      </div>
                      <div className="mt-3 pt-2 border-t border-ink-100 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-ink-500 font-mono">
                          {isSelected ? "✓ Active Selection" : "Click to select"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModifyTemplate(tpl.id);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900 underline"
                        >
                          <PencilRuler className="h-3 w-3" />
                          Modify in Designer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* Selected Order Banner - Positioned Under Document Template */}
          {selectedPO && (
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/80 p-4 sm:p-5 shadow-xs animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-emerald-950 flex items-center gap-2 flex-wrap">
                      <span>
                        Selected Order:{" "}
                        <span className="font-mono font-bold text-brand-800">{selectedPO.ProductionOrder}</span>
                        {" "}&bull;{" "}
                        <span>{selectedPO.ItemDescription}</span>
                      </span>
                      {selectedPO.ProductionOrderStatus && (
                        <Badge
                          tone={
                            selectedPO.ProductionOrderStatus === "Completed"
                              ? "success"
                              : selectedPO.ProductionOrderStatus === "Started"
                              ? "warning"
                              : selectedPO.ProductionOrderStatus === "Released"
                              ? "info"
                              : "brand"
                          }
                          className="text-[10px] font-bold"
                        >
                          {selectedPO.ProductionOrderStatus === "Completed"
                            ? "End"
                            : selectedPO.ProductionOrderStatus === "ReportedFinished"
                            ? "Reported as finished"
                            : selectedPO.ProductionOrderStatus}
                        </Badge>
                      )}
                      {selectedPO.dataAreaId && (
                        <Badge tone="brand" className="text-[10px] font-mono font-bold">
                          {selectedPO.dataAreaId}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-emerald-800 mt-1 flex items-center gap-2 flex-wrap">
                      <span>Part: <strong className="font-mono font-bold text-ink-900">{selectedPO.ItemNumber}</strong></span>
                      <span>&bull;</span>
                      <span>Customer: <strong>{selectedPO.CustomerName}</strong></span>
                      <span>&bull;</span>
                      <span>Qty: <strong>{selectedPO.Quantity} {selectedPO.UnitOfMeasure}</strong></span>
                      {selectedPO.CustomerPartNumber && (
                        <>
                          <span>&bull;</span>
                          <span>Customer Part: <strong className="font-mono text-brand-900 font-bold">{selectedPO.CustomerPartNumber}</strong></span>
                        </>
                      )}
                      {selectedPO.CustomerPO && (
                        <>
                          <span>&bull;</span>
                          <span>Cust PO: <strong>{selectedPO.CustomerPO}</strong></span>
                        </>
                      )}
                      {selectedPO.SalesOrder && (
                        <>
                          <span>&bull;</span>
                          <span>SO: <strong className="font-mono text-ink-900">{selectedPO.SalesOrder}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setManualOrder({ ...selectedPO });
                    setModalIsCustomSO(false);
                    setShowManualModal(true);
                    fetchModalSalesOrders(selectedPO.ItemNumber, selectedPO.dataAreaId || selectedCompany);
                  }}
                  className="text-xs gap-1.5 bg-white hover:bg-emerald-100 text-emerald-950 border-emerald-300 shrink-0 self-start sm:self-center"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Details
                </Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader
              title="2. Lookup Dynamics 365 Production Order"
              description="Search by Production Order Number, Item Number, Customer PO, or Batch."
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={d365Mode === "live" ? "success" : "neutral"}>
                    {d365Mode === "live" ? "D365 Live ERP" : "Standard Catalog"}
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
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-sky-900">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">Standard Catalog Active</p>
                      <p className="mt-0.5 text-sky-800">
                        Orders shown are standard HydraSpecma assemblies. To retrieve live orders directly from your Microsoft Dynamics 365 F&O tenant, connect your credentials in{" "}
                        <Link href="/admin/settings" className="font-bold underline hover:text-sky-950">
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

              {/* Search Bar with Legal Entity (dataAreaId) Switcher */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="sm:w-56 shrink-0">
                    <Select
                      value={selectedCompany}
                      onChange={(e) => handleCompanyChange(e.target.value)}
                      className="font-medium text-xs bg-slate-50 border-slate-300 h-9"
                      title="D365 Legal Entity (dataAreaId)"
                    >
                      <option value="HSIN">HSIN - India (HydraSpecma India)</option>
                      <option value="HGCN">HGCN - China (HydraSpecma China)</option>
                      <option value="HSDK">HSDK - Denmark (HydraSpecma A/S)</option>
                      <option value="HSSW">HSSW - Sweden (HydraSpecma AB)</option>
                      <option value="ALL">ALL - Cross-Company (All Entities)</option>
                    </Select>
                  </div>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
                    <Input
                      value={poQuery}
                      onChange={(e) => setPoQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchOrders(poQuery, selectedCompany, selectedStatus)}
                      placeholder="Search product number, order, or customer part (e.g. 29110478R05, HSIN-000011, 160072)..."
                      className="pl-9"
                    />
                  </div>
                  <Button loading={searching} onClick={() => searchOrders(poQuery, selectedCompany, selectedStatus)}>
                    Search D365
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openManualOrder(poQuery)}
                    className="gap-1.5 shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Custom Order
                  </Button>
                </div>

                {/* Quick Entity Switcher Tabs */}
                <div className="flex items-center gap-1.5 text-xs text-ink-500 pt-1 flex-wrap">
                  <span className="text-[11px] font-medium text-ink-400">Legal Entity:</span>
                  {[
                    { code: "HSIN", label: "HSIN (India)" },
                    { code: "HGCN", label: "HGCN (China)" },
                    { code: "HSDK", label: "HSDK (Denmark)" },
                    { code: "HSSW", label: "HSSW (Sweden)" },
                    { code: "ALL", label: "ALL Entities" },
                  ].map((ent) => (
                    <button
                      key={ent.code}
                      type="button"
                      onClick={() => handleCompanyChange(ent.code)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                        selectedCompany === ent.code
                          ? "bg-brand-500 text-ink-900 border-brand-500 font-bold shadow-xs"
                          : "bg-white text-ink-600 border-ink-200 hover:bg-ink-100"
                      }`}
                    >
                      {ent.label}
                    </button>
                  ))}
                  <span className="ml-auto text-[11px] font-mono text-ink-400">
                    OData dataAreaId: <strong>{selectedCompany === "ALL" ? "cross-company" : selectedCompany.toLowerCase()}</strong>
                  </span>
                </div>

                {/* Production Order Status Filter (Released, Started, Reported as finished, End only - sorted last to first) */}
                <div className="flex items-center gap-1.5 text-xs text-ink-600 pt-2 border-t border-ink-100 flex-wrap">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-700 mr-1">
                    <Filter className="h-3.5 w-3.5 text-brand-600" />
                    <span>Status Filter:</span>
                  </div>
                  {[
                    { code: "ALL_ACTIVE", label: "All Active (4 Statuses)" },
                    { code: "Released", label: "Released" },
                    { code: "Started", label: "Started" },
                    { code: "ReportedFinished", label: "Reported as finished" },
                    { code: "Completed", label: "End (Completed)" },
                    { code: "ALL", label: "All Statuses" },
                  ].map((st) => (
                    <button
                      key={st.code}
                      type="button"
                      onClick={() => handleStatusChange(st.code)}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                        selectedStatus === st.code
                          ? "bg-ink-900 text-white border-ink-900 font-bold shadow-xs"
                          : "bg-white text-ink-600 border-ink-200 hover:bg-ink-100"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                  <span className="ml-auto text-[11px] font-medium text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    Sorted: Last to First &darr;
                  </span>
                </div>
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
                        placeholder="e.g. HSIN-008617 or 1071.0747"
                        required
                      />
                    </Field>
                    <Field label="Item / Part Number *">
                      <Input
                        value={manualOrder.ItemNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualOrder({ ...manualOrder, ItemNumber: val });
                          if (val.trim()) {
                            fetchModalSalesOrders(val.trim(), manualOrder.dataAreaId || selectedCompany);
                          }
                        }}
                        placeholder="e.g. 1070.0049 or 29110478R05"
                        required
                      />
                    </Field>
                    <Field label="Item Description *">
                      <Input
                        value={manualOrder.ItemDescription}
                        onChange={(e) => setManualOrder({ ...manualOrder, ItemDescription: e.target.value })}
                        placeholder="e.g. Baseframe Module"
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

                    {/* Sales Order Dropdown */}
                    <Field
                      label="Sales Order Number *"
                      hint={loadingModalSO ? "Checking matching SOs in D365..." : `${modalSalesOrders.length} matching sales order(s)`}
                    >
                      {modalIsCustomSO ? (
                        <div className="flex gap-1.5">
                          <Input
                            value={manualOrder.SalesOrder}
                            onChange={(e) => setManualOrder({ ...manualOrder, SalesOrder: e.target.value })}
                            placeholder="Enter custom SO..."
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setModalIsCustomSO(false)}
                            className="text-xs px-2"
                            title="Return to dropdown list"
                          >
                            List
                          </Button>
                        </div>
                      ) : (
                        <Select
                          value={modalSalesOrders.some((s) => s.SalesOrder === manualOrder.SalesOrder) ? manualOrder.SalesOrder : (modalSalesOrders[0]?.SalesOrder || "__custom__")}
                          onChange={(e) => handleSelectModalSalesOrder(e.target.value)}
                          className="font-mono text-xs"
                        >
                          {modalSalesOrders.map((so) => (
                            <option key={so.SalesOrder} value={so.SalesOrder}>
                              {so.SalesOrder} — {so.CustomerName?.slice(0, 20)} (Cust Part: {so.ExternalItemNumber || "N/A"})
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom Sales Order...</option>
                        </Select>
                      )}
                    </Field>

                    {/* Customer Part Number (External Item Number) */}
                    <Field
                      label="Customer Part No. (External Item No.) *"
                      hint="Auto-populated from Sales Order ExternalItemNumber"
                    >
                      <Input
                        value={manualOrder.CustomerPartNumber || ""}
                        onChange={(e) => setManualOrder({ ...manualOrder, CustomerPartNumber: e.target.value })}
                        placeholder="e.g. 160072 or 29107156"
                        className="font-mono font-bold text-brand-900 bg-brand-50/60 border-brand-300"
                        required
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
                        const finalCustPart = manualOrder.CustomerPartNumber?.trim() || "160072";
                        const finalOrder = { ...manualOrder, CustomerPartNumber: finalCustPart };
                        setSelectedPO(finalOrder);
                        setManualFields((prev) => ({
                          ...prev,
                          CustomerPartNo: finalCustPart,
                          CustomerPO: manualOrder.CustomerPO || prev.CustomerPO || "4509008214",
                          SerialNumber: manualOrder.SerialNumber || `${manualOrder.ItemNumber} - SN001`,
                        }));
                        setShowManualModal(false);
                        fetchSalesOrdersForPO(finalOrder.ItemNumber, finalOrder.dataAreaId || selectedCompany, finalOrder);
                        fetchExistingCocsForPO(finalOrder.ProductionOrder, finalOrder.ItemNumber);
                        toast.success(`Applied order: ${manualOrder.ProductionOrder} (Customer Part: ${finalCustPart})`);
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
                      ? "No matching orders found in the standard catalog. You can click below to use this number directly, or connect Live ERP in Admin Settings."
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
                    const entityBadge = order.dataAreaId || (order.CustomerAccount ? order.CustomerAccount.toUpperCase() : selectedCompany);
                    const status = order.ProductionOrderStatus;
                    let statusTone: "neutral" | "success" | "warning" | "danger" | "info" | "brand" = "neutral";
                    let statusLabel = status || "";
                    if (status === "Completed") {
                      statusTone = "success";
                      statusLabel = "End";
                    } else if (status === "ReportedFinished") {
                      statusTone = "brand";
                      statusLabel = "Reported as finished";
                    } else if (status === "Started") {
                      statusTone = "warning";
                      statusLabel = "Started";
                    } else if (status === "Released") {
                      statusTone = "info";
                      statusLabel = "Released";
                    }

                    return (
                      <div
                        key={order.ProductionOrder}
                        onClick={() => applySelectedPO(order)}
                        className={`cursor-pointer rounded-lg border p-4 transition-all ${
                          isSelected
                            ? "border-brand-500 bg-brand-50/30 ring-2 ring-brand-400 shadow-sm"
                            : "border-ink-200 hover:border-ink-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-brand-700">
                              {order.ProductionOrder}
                            </span>
                            {entityBadge && (
                              <Badge tone="brand" className="text-[10px] font-mono font-bold px-1.5 py-0.5">
                                {entityBadge}
                              </Badge>
                            )}
                            {statusLabel && (
                              <Badge tone={statusTone} className="text-[10px] font-semibold px-1.5 py-0.5">
                                {statusLabel}
                              </Badge>
                            )}
                          </div>
                          <Badge tone="info" className="truncate max-w-[130px]">{order.CustomerName}</Badge>
                        </div>
                        <div className="mt-1 font-semibold text-sm text-ink-900 line-clamp-1">
                          {order.ItemDescription}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-600">
                          <div>Product / Part: <span className="font-mono font-bold text-ink-900">{order.ItemNumber}</span></div>
                          <div>Customer Part: <span className="font-mono font-semibold text-brand-800">{order.CustomerPartNumber || "160072"}</span></div>
                          <div>Cust PO: <span className="font-medium">{order.CustomerPO || "—"}</span></div>
                          <div>Qty: <span className="font-semibold text-ink-900">{order.Quantity} {order.UnitOfMeasure}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Order Summary */}
              {selectedPO && (
                <div className="rounded-xl border-2 border-brand-300 bg-gradient-to-br from-brand-50/40 via-white to-emerald-50/30 p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-100 pb-3">
                    <div className="flex items-start sm:items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-ink-900 font-bold shadow-xs shrink-0">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Active Production Order</span>
                          <span className="font-mono text-sm font-bold text-brand-800 bg-brand-100/70 px-2 py-0.5 rounded border border-brand-200">
                            {selectedPO.ProductionOrder}
                          </span>
                          {selectedPO.dataAreaId && (
                            <Badge tone="brand" className="text-[10px] font-mono font-bold">
                              {selectedPO.dataAreaId}
                            </Badge>
                          )}
                          {selectedPO.ProductionOrderStatus && (
                            <Badge tone="success" className="text-[10px]">
                              {selectedPO.ProductionOrderStatus}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-ink-900 mt-0.5">
                          {selectedPO.ItemDescription}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setManualOrder({ ...selectedPO });
                          setModalIsCustomSO(false);
                          setShowManualModal(true);
                          fetchModalSalesOrders(selectedPO.ItemNumber, selectedPO.dataAreaId || selectedCompany);
                        }}
                        className="text-xs gap-1.5"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Details
                      </Button>
                    </div>
                  </div>

                  {/* Cross-checked Sales Order & External Customer Part Box */}
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 bg-white/80 p-3.5 rounded-lg border border-brand-200/80">
                    {/* Sales Order Dropdown */}
                    <div className="space-y-1.5 sm:col-span-2 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                          <ShoppingCart className="h-3.5 w-3.5 text-brand-600" />
                          Sales Order Number (Cross-checked by Item: {selectedPO.ItemNumber})
                        </label>
                        <span className="text-[11px] text-brand-700 font-medium">
                          {loadingSalesOrders ? "Querying D365..." : `${salesOrders.length} matching order(s)`}
                        </span>
                      </div>

                      {isCustomSO ? (
                        <div className="flex gap-2">
                          <Input
                            value={customSOValue || selectedPO.SalesOrder}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomSOValue(v);
                              setSelectedPO({ ...selectedPO, SalesOrder: v });
                            }}
                            placeholder="Enter custom Sales Order Number..."
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsCustomSO(false)}
                            className="text-xs px-2.5 shrink-0"
                          >
                            Back to List
                          </Button>
                        </div>
                      ) : (
                        <Select
                          value={salesOrders.some((s) => s.SalesOrder === selectedPO.SalesOrder) ? selectedPO.SalesOrder : (salesOrders[0]?.SalesOrder || "__custom__")}
                          onChange={(e) => handleSelectSalesOrder(e.target.value)}
                          className="font-medium text-xs bg-slate-50 border-brand-200 focus:border-brand-500"
                        >
                          {salesOrders.map((so) => (
                            <option key={so.SalesOrder} value={so.SalesOrder}>
                              {so.SalesOrder} &bull; {so.CustomerName?.slice(0, 24)} &bull; Cust Part: {so.ExternalItemNumber || "160072"} &bull; PO: {so.CustomerPO || "N/A"}
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom Sales Order...</option>
                        </Select>
                      )}
                      <p className="text-[11px] text-ink-500">
                        Cross-referenced between Production Item Number <span className="font-mono font-medium text-ink-700">{selectedPO.ItemNumber}</span> and Sales Order Line items in D365.
                      </p>
                    </div>

                    {/* Customer Part Number (External Item Number) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-brand-600" />
                        Customer Part No. (External Item)
                      </label>
                      <Input
                        value={selectedPO.CustomerPartNumber || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedPO({ ...selectedPO, CustomerPartNumber: val });
                          setManualFields((prev) => ({ ...prev, CustomerPartNo: val }));
                        }}
                        placeholder="e.g. 160072 or 29107156"
                        className="font-mono font-bold text-brand-900 bg-brand-50/50 border-brand-300 text-xs"
                      />
                      <p className="text-[11px] text-brand-700">
                        Populated from <strong>ExternalItemNumber</strong> on Sales Line.
                      </p>
                    </div>
                  </div>

                  {/* Summary Badges: Customer Name, Customer PO, Quantity */}
                  <div className="flex items-center gap-4 text-xs text-ink-600 flex-wrap pt-1">
                    <div>Customer: <strong className="text-ink-900">{selectedPO.CustomerName || "—"}</strong></div>
                    <div>Customer PO: <strong className="font-mono text-ink-900">{selectedPO.CustomerPO || "—"}</strong></div>
                    <div>Qty: <strong className="text-ink-900">{selectedPO.Quantity} {selectedPO.UnitOfMeasure}</strong></div>
                    <div>Batch: <span className="font-mono text-ink-800">{selectedPO.BatchNumber || "—"}</span></div>
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

      {/* Step 2: Quality Inspection Data & Official Workflow Checklist */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Part & Order References Box */}
          <Card>
            <CardHeader
              title="1. Order & Customer Part Identification"
              description="Verify customer part mapping and purchase order reference details as printed on the official COC."
            />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <Field label="Customer Part No. *" hint="e.g. 160072">
                  <Input
                    value={manualFields.CustomerPartNo}
                    onChange={(e) => setManualFields({ ...manualFields, CustomerPartNo: e.target.value })}
                    required
                  />
                </Field>

                <Field label="Customer Purchase Order *" hint="e.g. 4509008214">
                  <Input
                    value={manualFields.CustomerPO}
                    onChange={(e) => setManualFields({ ...manualFields, CustomerPO: e.target.value })}
                    required
                  />
                </Field>

                <Field label="Top Level Serial Number *" hint="e.g. SN-HSIN-000011">
                  <Input
                    value={manualFields.SerialNumber}
                    onChange={(e) => setManualFields({ ...manualFields, SerialNumber: e.target.value })}
                    required
                    className={serialWarning ? "border-red-400 focus:border-red-500 focus:ring-red-300" : ""}
                  />
                  {serialNotice && !serialWarning && (
                    <div className="mt-1.5 flex items-center gap-1.5 rounded bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800 border border-brand-200">
                      <span>ℹ️</span> {serialNotice}
                    </div>
                  )}
                  {serialWarning && (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-red-50 p-2.5 text-xs font-semibold text-red-700 border border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{serialWarning}</span>
                    </div>
                  )}
                </Field>

                <Field label="HydraSpecma (HSRE) Part No.">
                  <Input
                    value={selectedPO?.ItemNumber || ""}
                    readOnly
                    className="bg-ink-50 font-mono text-ink-700"
                  />
                </Field>

                <Field label="Manufacturing Order Number (PO)">
                  <Input
                    value={selectedPO?.ProductionOrder || ""}
                    readOnly
                    className="bg-ink-50 font-mono font-bold text-brand-700"
                  />
                </Field>

                <Field label="Customer Name">
                  <Input
                    value={selectedPO?.CustomerName || "VESTAS WIND TECHNOLOGYS INDIA PVT LTD"}
                    readOnly
                    className="bg-ink-50 text-ink-700"
                  />
                </Field>

                <div className="sm:col-span-2 md:col-span-3">
                  <Field label="Customer Technical Purchase Specification & Revision">
                    <Input
                      value={manualFields.CustomerSpec}
                      onChange={(e) => setManualFields({ ...manualFields, CustomerSpec: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Official 9-Step Workflow Verification Card */}
          <Card>
            <CardHeader
              title="2. HydraSpecma Official 9-Step Quality Workflow Checklist"
              description="Verify conformity to engineering and inspection standards from official template COC-1070.0049-Rev.02."
              actions={
                <Badge tone="success" className="gap-1 font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5" /> 9 of 9 Steps Verified
                </Badge>
              }
            />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50/70 text-ink-700 font-semibold">
                      <th className="py-2.5 px-4 w-12 text-center">#</th>
                      <th className="py-2.5 px-4 w-64">Work Flow Step</th>
                      <th className="py-2.5 px-4">Inspection Standard / Technical Specification</th>
                      <th className="py-2.5 px-4 w-36 text-right">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {[
                      { step: 1, name: "Assembled.", spec: "According to AI-1071.0512 and AI-1070.0049, Latest revision." },
                      { step: 2, name: "Air leak test.", spec: "According to TI-1071.0512-1, Latest revision." },
                      { step: 3, name: "Air fan test", spec: "According to TI-1071.0512-2, Latest revision." },
                      { step: 4, name: "Interface dimension for cabinet.", spec: "According to TI-1071.0512-3, Latest revision." },
                      { step: 5, name: "Flatness of Baseframe.", spec: "According to TI-1071.0512-4, Latest revision." },
                      { step: 6, name: "Pipe system Air leak test or Helium leak test.", spec: "According to TI-1071.0267 / TI-1071.0267-1, Latest revision." },
                      { step: 7, name: "Part traceability.", spec: "According to SN-1070.0049, Latest revision." },
                      { step: 8, name: "Complete inspection.", spec: "Visual inspection of complete unit before packed." },
                      { step: 9, name: "Packing.", spec: "According to PI-1070.0049, Latest revision." },
                    ].map((item) => (
                      <tr key={item.step} className="hover:bg-ink-50/50 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-ink-500 text-center">{item.step}</td>
                        <td className="py-2.5 px-4 font-semibold text-ink-900">{item.name}</td>
                        <td className="py-2.5 px-4 text-ink-600 font-mono text-[11px]">{item.spec}</td>
                        <td className="py-2.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <Check className="h-3 w-3 text-emerald-600 stroke-[3]" /> Conforms
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Inspector Signoff Card */}
          <Card>
            <CardHeader
              title="3. Quality Inspector Details & Declaration"
              description="Confirm the authorizing quality assurance inspector and certificate date."
            />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Inspector Name *">
                  <Input
                    value={manualFields.InspectorName}
                    onChange={(e) => setManualFields({ ...manualFields, InspectorName: e.target.value })}
                    required
                  />
                </Field>

                <Field label="Date of Signature *">
                  <Input
                    type="date"
                    value={manualFields.InspectionDate}
                    onChange={(e) => setManualFields({ ...manualFields, InspectionDate: e.target.value })}
                    required
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Compliance Declaration & Remarks">
                    <Input
                      value={manualFields.Comments}
                      onChange={(e) => setManualFields({ ...manualFields, Comments: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-between pt-6 border-t border-ink-200">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back to Order Lookup
                </Button>
                <Button onClick={() => setStep(3)} className="gap-2">
                  Next: Digital Signature <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
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
                disabled={Boolean(serialWarning)}
                className="bg-brand-500 hover:bg-brand-600 text-ink-900 font-semibold gap-2 border-brand-500 disabled:opacity-50"
              >
                <FileCheck className="h-4 w-4" />
                Generate & Issue Official COC
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {serialWarning && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-bold text-sm text-red-900">Duplicate Serial Number Detected</p>
                  <p>{serialWarning}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStep(2)}
                    className="mt-1 text-xs bg-white text-red-700 border-red-300 hover:bg-red-50"
                  >
                    Go to Step 2 to Change Serial Number
                  </Button>
                </div>
              </div>
            )}

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
                disabled={Boolean(serialWarning)}
                className="bg-brand-500 hover:bg-brand-600 text-ink-900 font-semibold gap-2 border-brand-500 disabled:opacity-50"
              >
                <FileCheck className="h-4 w-4" />
                Confirm & Issue Official Certificate
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Upload PDF Template Modal */}
      <Dialog
        open={showUploadPdfModal}
        onClose={() => setShowUploadPdfModal(false)}
        title="Upload PDF & Make Template"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowUploadPdfModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUploadPdfSubmit}
              loading={uploadingPdf}
              disabled={!uploadPdfFile}
              className="gap-1.5"
            >
              <Upload className="h-4 w-4" />
              Upload & Make Template
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-600">
            Upload any HydraSpecma or customer PDF certificate to use as a document layout template. Standard COC fields will automatically be mapped and can be fine-tuned in the visual designer.
          </p>

          <div
            onClick={() => document.getElementById("template-pdf-input")?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-6 text-center hover:bg-brand-50 transition-colors"
          >
            <input
              id="template-pdf-input"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadPdfFile(f);
                  if (!uploadPdfName) {
                    setUploadPdfName(f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
                  }
                }
              }}
            />
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <FileUp className="h-5 w-5" />
            </div>
            {uploadPdfFile ? (
              <div className="mt-3">
                <div className="text-sm font-bold text-ink-900">{uploadPdfFile.name}</div>
                <div className="text-xs text-ink-500 font-mono mt-0.5">
                  {(uploadPdfFile.size / 1024).toFixed(1)} KB &bull; Ready to process
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-sm font-semibold text-ink-900">Click to select a PDF certificate file</div>
                <div className="text-xs text-ink-500 mt-1">Accepts standard PDF documents up to 20MB</div>
              </div>
            )}
          </div>

          <Field label="Template Name *" hint="Descriptive name shown in template list">
            <Input
              value={uploadPdfName}
              onChange={(e) => setUploadPdfName(e.target.value)}
              placeholder="e.g. HydraSpecma COC 1070.0049 - Vestas Spec"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Revision" hint="e.g. Rev 02">
              <Input
                value={uploadPdfRevision}
                onChange={(e) => setUploadPdfRevision(e.target.value)}
                placeholder="Rev 01"
              />
            </Field>
            <Field label="Template Type">
              <Input value="COC" readOnly className="bg-ink-50 text-ink-600" />
            </Field>
          </div>

          <Field label="Description (Optional)">
            <Textarea
              value={uploadPdfDesc}
              onChange={(e) => setUploadPdfDesc(e.target.value)}
              placeholder="e.g. Customer approved COC layout for project..."
              className="min-h-16"
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
