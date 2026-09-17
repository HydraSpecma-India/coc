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

function generateAutoSignature(name: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 140;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Clean background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 480, 140);

  // Subtle border frame
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(4, 4, 472, 132);

  // Verified shield badge
  ctx.fillStyle = "#0284c7";
  ctx.beginPath();
  ctx.arc(36, 42, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✓", 36, 48);

  // Cursive / Calligraphic signature style
  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "italic bold 26px 'Segoe Script', 'Brush Script MT', cursive, sans-serif";
  ctx.fillText(name || "Authorized Signatory", 68, 46);

  // Subtitle / Legal verification
  ctx.fillStyle = "#334155";
  ctx.font = "bold 10px sans-serif";
  ctx.fillText("DIGITALLY SIGNED & VERIFIED QUALITY INSPECTOR", 68, 70);

  // Metadata line
  const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  ctx.fillStyle = "#64748b";
  ctx.font = "9.5px monospace";
  ctx.fillText(`Signatory: ${name} | Timestamp: ${nowStr}`, 68, 90);
  ctx.fillText("HydraSpecma Quality Assurance System Certified", 68, 108);

  return canvas.toDataURL("image/png");
}

export function CocWizard({
  templates,
  userName,
  userEmail,
  allowedCompanies = ["ALL"],
}: {
  templates: TemplateSummary[];
  userName: string;
  userEmail: string;
  allowedCompanies?: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Template selection
  const [templateList, setTemplateList] = useState<TemplateSummary[]>(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates.find((t) => t.active_version_id)?.id || templates[0]?.id || ""
  );
  const selectedTemplate = templateList.find((t) => t.id === selectedTemplateId) || templateList[0];
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
  const defaultCompany = !allowedCompanies.includes("ALL") && allowedCompanies.length > 0 ? allowedCompanies[0] : "HSIN";
  const [selectedCompany, setSelectedCompany] = useState<string>(defaultCompany);
  const [availableCompanies, setAvailableCompanies] = useState<{ code: string; label: string }[]>([
    { code: "HSIN", label: "HSIN - India (HydraSpecma India)" },
    { code: "HGCN", label: "HGCN - China (HydraSpecma China)" },
    { code: "HSDK", label: "HSDK - Denmark (HydraSpecma Denmark)" },
    { code: "HSPL", label: "HSPL - Poland (HydraSpecma Poland)" },
    { code: "HSSE", label: "HSSE - Sweden (HydraSpecma Sweden)" },
    { code: "HSFI", label: "HSFI - Finland (HydraSpecma Finland)" },
    { code: "HSUK", label: "HSUK - UK (HydraSpecma UK)" },
    { code: "HSUS", label: "HSUS - USA (HydraSpecma North America)" },
    { code: "ALL", label: "ALL - Cross-Company (All Entities)" },
  ]);

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((res) => {
        if (res.ok && res.companies && res.companies.length > 0) {
          const mapped = res.companies.map((c) => ({
            code: c.code,
            label: `${c.code} - ${c.name}`,
          }));
          mapped.push({ code: "ALL", label: "ALL - Cross-Company (All Entities)" });
          setAvailableCompanies(mapped);
        }
      })
      .catch(() => {});
  }, []);

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
    CustomerName: "VESTAS WIND TECHNOLOGYS INDIA PVT LTD",
    CustomerPO: "4509008214",
    CustomerPartNumber: "160072",
    dataAreaId: "HSIN",
    SalesOrder: "",
    SalesLine: "1.0",
    DeliveryDate: "",
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
        const rawCust = matched.DeliveryAddressName || matched.CustomerName || "";
        const custName = (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
          ? rawCust
          : targetOrder?.CustomerName && !targetOrder.CustomerName.toLowerCase().includes("hydraspecma")
            ? targetOrder.CustomerName
            : (company === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

        setSelectedPO((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            SalesOrder: matched.SalesOrder,
            CustomerPartNumber: extPart,
            CustomerPO: poNum,
            CustomerName: custName,
            DeliveryAddressName: matched.DeliveryAddressName || custName,
          };
        });

        setManualFields((prev) => ({
          ...prev,
          CustomerPartNo: extPart,
          CustomerPO: poNum,
          CustomerName: custName,
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
          const rawCust = matched.DeliveryAddressName || matched.CustomerName || "";
          const custName = (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
            ? rawCust
            : (company === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

          setManualOrder((prev) => ({
            ...prev,
            SalesOrder: matched.SalesOrder,
            CustomerPartNumber: matched.ExternalItemNumber || prev.CustomerPartNumber || "160072",
            CustomerPO: matched.CustomerPO || prev.CustomerPO,
            CustomerName: custName,
            DeliveryAddressName: matched.DeliveryAddressName || custName,
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

  // Product-specific continuous serial sequence state
  const [productSequence, setProductSequence] = useState<{
    rule: { itemNumber: string; mode: "auto" | "manual"; pattern: string; nextNumber: number };
    samplePreview: string;
    source: "db_configured" | "default_auto";
  } | null>(null);

  const fetchProductSequence = async (itemNumber: string, itemDescription?: string) => {
    try {
      const res = await api<{
        ok: boolean;
        rule: { itemNumber: string; mode: "auto" | "manual"; pattern: string; nextNumber: number };
        samplePreview: string;
        source: "db_configured" | "default_auto";
      }>(`/api/admin/number-sequences/rule?itemNumber=${encodeURIComponent(itemNumber)}&itemDescription=${encodeURIComponent(itemDescription || "")}`);
      if (res.ok && res.rule) {
        setProductSequence(res);
        if (res.rule.mode === "auto" && res.samplePreview) {
          setManualFields((prev) => ({
            ...prev,
            SerialNumber: res.samplePreview,
          }));
        }
      }
    } catch (e) {
      console.warn("Could not fetch product serial sequence rule", e);
    }
  };

  const fetchExistingCocsForPO = async (poNumber: string, itemNumber?: string) => {
    try {
      const res = await api<{ ok: boolean; cocs: Array<{ coc_number: string; serial_number: string | null; status: string }> }>(
        `/api/coc/by-po?po=${encodeURIComponent(poNumber)}`
      );
      if (res.ok && res.cocs) {
        setExistingCocs(res.cocs);
        const count = res.cocs.length;
        if (count > 0) {
          const nextIndex = count + 1;
          const padNext = String(nextIndex).padStart(4, "0");
          const prefixItem = itemNumber?.trim() || poNumber.trim();
          const autoSuggestedSerial = `${prefixItem} - SN${padNext}`;
          setManualFields((prev) => ({
            ...prev,
            SerialNumber: autoSuggestedSerial,
          }));
          setSerialNotice(
            `Found ${count} previously issued Certificate(s) for this order. Auto-incremented serial number to "${autoSuggestedSerial}".`
          );
        } else {
          setSerialNotice(null);
        }
      }
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
      const rawCust = matched.DeliveryAddressName || matched.CustomerName || "";
      const custName = (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
        ? rawCust
        : selectedPO?.CustomerName && !selectedPO.CustomerName.toLowerCase().includes("hydraspecma")
          ? selectedPO.CustomerName
          : (selectedCompany === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

      setSelectedPO((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          SalesOrder: matched.SalesOrder,
          CustomerPartNumber: extPart,
          CustomerPO: poNum,
          CustomerName: custName,
          DeliveryAddressName: matched.DeliveryAddressName || custName,
        };
      });

      setManualFields((prev) => ({
        ...prev,
        CustomerPartNo: extPart,
        CustomerPO: poNum,
        CustomerName: custName,
      }));

      toast.success(`Selected Sales Order ${matched.SalesOrder} (Customer: ${custName})`);
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
      const rawCust = matched.DeliveryAddressName || matched.CustomerName || "";
      const custName = (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
        ? rawCust
        : (manualOrder.dataAreaId === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

      setManualOrder((prev) => ({
        ...prev,
        SalesOrder: matched.SalesOrder,
        CustomerPartNumber: matched.ExternalItemNumber || prev.CustomerPartNumber || "160072",
        CustomerPO: matched.CustomerPO || prev.CustomerPO,
        CustomerName: custName,
        DeliveryAddressName: matched.DeliveryAddressName || custName,
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
      DeliveryDate: new Date().toISOString().slice(0, 10),
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
    CustomerName: "VESTAS WIND TECHNOLOGYS INDIA PVT LTD",
    DeliveryDate: "",
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

  // Signature state: automated user signature (default) or manual draw
  const [signatureMode, setSignatureMode] = useState<"auto" | "draw">("auto");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(true);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");

  useEffect(() => {
    if (signatureMode === "auto" && typeof window !== "undefined") {
      const autoSig = generateAutoSignature(userName);
      if (autoSig) {
        setSignatureDataUrl(autoSig);
        setHasSignature(true);
      }
    }
  }, [userName, signatureMode]);

  // Preview & Generating state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const applySelectedPO = (order: D365ProductionOrder) => {
    setSelectedPO(order);
    const initialExtPart = order.CustomerPartNumber || "160072";
    const rawCust = order.DeliveryAddressName || order.CustomerName || "";
    const custName =
      (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
        ? rawCust
        : (order.dataAreaId === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");
    setManualFields((prev) => ({
      ...prev,
      CustomerPartNo: initialExtPart,
      CustomerPO: order.CustomerPO || prev.CustomerPO || "4509008214",
      CustomerName: custName,
      DeliveryDate: order.DeliveryDate ? order.DeliveryDate.slice(0, 10) : prev.DeliveryDate || "",
      SerialNumber: order.SerialNumber || `${order.ItemNumber || order.ProductionOrder} - SN001`,
    }));
    fetchSalesOrdersForPO(order.ItemNumber, order.dataAreaId || selectedCompany, order);
    fetchExistingCocsForPO(order.ProductionOrder, order.ItemNumber);
    fetchProductSequence(order.ItemNumber, order.ItemDescription);
  };

  // Initial PO search
  useEffect(() => {
    searchOrders("", defaultCompany, "ALL_ACTIVE");
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
          const firstPending = orders.find((o) => !o.isFullyCertified) || orders[0];
          applySelectedPO(firstPending);
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

    const activeSO = salesOrders.find((so) => so.SalesOrder === selectedPO.SalesOrder);
    const rawCust =
      (manualFields.CustomerName && !manualFields.CustomerName.toLowerCase().includes("hydraspecma") ? manualFields.CustomerName : null) ||
      activeSO?.DeliveryAddressName ||
      activeSO?.CustomerName ||
      (selectedPO.CustomerName && !selectedPO.CustomerName.toLowerCase().includes("hydraspecma") ? selectedPO.CustomerName : null) ||
      "";
    const finalCustomerName =
      (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
        ? rawCust
        : (selectedCompany === "HGCN" || selectedPO.dataAreaId === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

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
          customerName: finalCustomerName,
          customerPO: manualFields.CustomerPO || selectedPO.CustomerPO || "4509008214",
          customerPartNumber: manualFields.CustomerPartNo || selectedPO.CustomerPartNumber || "160072",
          salesOrder: selectedPO.SalesOrder || "",
          deliveryDate: manualFields.DeliveryDate || selectedPO.DeliveryDate || "",
          serialNumber: manualFields.SerialNumber || selectedPO.SerialNumber || "",
          quantity: selectedPO.Quantity || 1,
          unitOfMeasure: selectedPO.UnitOfMeasure || "Pcs",
          manualValues: { ...manualFields, CustomerName: finalCustomerName },
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

    const activeSO = salesOrders.find((so) => so.SalesOrder === selectedPO.SalesOrder);
    const rawCust =
      (manualFields.CustomerName && !manualFields.CustomerName.toLowerCase().includes("hydraspecma") ? manualFields.CustomerName : null) ||
      activeSO?.DeliveryAddressName ||
      activeSO?.CustomerName ||
      (selectedPO.CustomerName && !selectedPO.CustomerName.toLowerCase().includes("hydraspecma") ? selectedPO.CustomerName : null) ||
      "";
    const finalCustomerName =
      (rawCust && !rawCust.toLowerCase().includes("hydraspecma"))
        ? rawCust
        : (selectedCompany === "HGCN" || selectedPO.dataAreaId === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

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
          customerName: finalCustomerName,
          customerPO: manualFields.CustomerPO || selectedPO.CustomerPO || "4509008214",
          customerPartNumber: manualFields.CustomerPartNo || selectedPO.CustomerPartNumber || "160072",
          salesOrder: selectedPO.SalesOrder || "",
          salesLine: selectedPO.SalesLine || "1.0",
          customerAccount: selectedPO.CustomerAccount || selectedCompany || "HSIN",
          quantity: selectedPO.Quantity || 1,
          unitOfMeasure: selectedPO.UnitOfMeasure || "Pcs",
          deliveryDate: manualFields.DeliveryDate || selectedPO.DeliveryDate || "",
          serialNumber: manualFields.SerialNumber || selectedPO.SerialNumber || "",
          manualValues: { ...manualFields, CustomerName: finalCustomerName },
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
    <div className="flex h-full w-full overflow-hidden">
      {/* Center Main Scrollable Workflow Canvas */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-6 pb-20">
          <PageHeader
            title="Create Certificate of Conformity"
            description="Issue an official COC by selecting a production order, validating quality parameters, and applying an authorized digital signature."
          />

          {/* Step Progress Bar */}
          <div className="mb-6 grid grid-cols-4 gap-2">
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
          {/* 1. Document Template Selector (Compact Bar) */}
          <div className="rounded-lg border border-ink-200 bg-white p-2.5 sm:px-4 sm:py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-50 text-brand-800 font-bold text-xs border border-brand-200">
                1
              </div>
              <span className="text-xs font-semibold text-ink-800 whitespace-nowrap">Document Template:</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="h-8 max-w-[240px] sm:max-w-xs truncate rounded border border-ink-300 bg-ink-50/60 px-2.5 py-0 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-hidden cursor-pointer"
                >
                  {templateList.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {tpl.active_version_id ? `(v${tpl.active_version_number})` : "(Draft)"}
                    </option>
                  ))}
                </select>
                {selectedTemplate && (
                  <Badge tone={selectedTemplate.active_version_id ? "success" : "warning"} className="text-[10px] px-1.5 py-0.5 font-medium shrink-0">
                    {selectedTemplate.active_version_id ? `v${selectedTemplate.active_version_number} Published` : "Draft"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleModifyTemplate(selectedTemplateId)}
                loading={modifyingTemplate}
                className="h-7 text-xs gap-1 py-0 px-2.5 text-ink-700 hover:text-ink-900"
                title="Edit layout, text & lines in designer"
              >
                <PencilRuler className="h-3 w-3" />
                <span>Designer</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUploadPdfModal(true)}
                className="h-7 text-xs gap-1 py-0 px-2.5 text-brand-700 border-brand-200 hover:bg-brand-50"
                title="Upload a custom PDF template"
              >
                <Upload className="h-3 w-3" />
                <span>Upload PDF</span>
              </Button>
            </div>
          </div>

          {/* Selected Order Banner - Mobile/Small Screen Fallback */}
          {selectedPO && (
            <div className="lg:hidden rounded-xl border-2 border-emerald-300 bg-emerald-50/80 p-4 sm:p-5 shadow-xs animate-in fade-in">
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
                      {/* Qualification Badges */}
                      {selectedPO.isFullyCertified ? (
                        <Badge tone="success" className="text-[10px] font-bold">
                          COC Created ({selectedPO.certifiedQuantity}/{selectedPO.Quantity} Qty)
                        </Badge>
                      ) : selectedPO.certifiedQuantity ? (
                        <Badge tone="warning" className="text-[10px] font-bold">
                          {selectedPO.certifiedQuantity}/{selectedPO.Quantity} Certified &bull; {selectedPO.pendingCocQuantity} Pending for COC
                        </Badge>
                      ) : (
                        <Badge tone="neutral" className="text-[10px] font-medium">
                          {selectedPO.Quantity} Qty Pending for COC
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-emerald-800 mt-1 flex items-center gap-2 flex-wrap">
                      <span>Part: <strong className="font-mono font-bold text-ink-900">{selectedPO.ItemNumber}</strong></span>
                      <span>&bull;</span>
                      <span>Customer: <strong>{selectedPO.CustomerName}</strong></span>
                      <span>&bull;</span>
                      <span>Total Qty: <strong>{selectedPO.Quantity} {selectedPO.UnitOfMeasure}</strong></span>
                      {selectedPO.certifiedQuantity !== undefined && selectedPO.certifiedQuantity > 0 && (
                        <>
                          <span>&bull;</span>
                          <span>Certified: <strong className="text-emerald-950 font-bold">{selectedPO.certifiedQuantity}</strong></span>
                          <span>&bull;</span>
                          <span>Pending: <strong className="text-brand-900 font-bold">{selectedPO.pendingCocQuantity}</strong></span>
                        </>
                      )}
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
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  {selectedPO.isFullyCertified && selectedPO.cocList?.[0] && (
                    <Link
                      href={`/coc/${selectedPO.cocList[0].id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View COC ({selectedPO.cocList[0].coc_number})
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setManualOrder({ ...selectedPO });
                      setModalIsCustomSO(false);
                      setShowManualModal(true);
                      fetchModalSalesOrders(selectedPO.ItemNumber, selectedPO.dataAreaId || selectedCompany);
                    }}
                    className="text-xs gap-1.5 bg-white hover:bg-emerald-100 text-emerald-950 border-emerald-300"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit Details
                  </Button>
                </div>
              </div>

              {/* Fully Certified Alert Banner */}
              {selectedPO.isFullyCertified && (
                <div className="mt-2.5 rounded-lg bg-emerald-100/70 border border-emerald-300 p-2.5 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span>
                      <strong>All {selectedPO.Quantity} unit(s) certified:</strong> A Certificate of Conformity ({selectedPO.cocList?.[0]?.coc_number || "COC"}) has already been created for this production order. It is not qualified for generating another COC.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <Card>
            <CardHeader
              title="2. Lookup Dynamics 365 Production Order"
              description="Search by Production Order Number, Item Number, Customer PO, or Delivery Date."
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
                      {availableCompanies
                        .filter((c) => allowedCompanies.includes("ALL") || allowedCompanies.includes(c.code))
                        .map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
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
                  {availableCompanies
                    .filter((c) => allowedCompanies.includes("ALL") || allowedCompanies.includes(c.code))
                    .map((ent) => (
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
                      {ent.code}
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
                    <Field label="Production Order Delivery Date">
                      <Input
                        type="date"
                        value={manualOrder.DeliveryDate || ""}
                        onChange={(e) => setManualOrder({ ...manualOrder, DeliveryDate: e.target.value })}
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
                              {so.SalesOrder} — {(so.DeliveryAddressName || so.CustomerName)?.slice(0, 20)} (Cust Part: {so.ExternalItemNumber || "N/A"})
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
                        fetchProductSequence(finalOrder.ItemNumber, finalOrder.ItemDescription);
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
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
                        className={`cursor-pointer rounded-lg border p-2.5 transition-all flex flex-col justify-between text-xs relative ${
                          isSelected
                            ? "border-brand-500 bg-brand-50/30 ring-2 ring-brand-400 shadow-xs"
                            : order.isFullyCertified
                            ? "border-emerald-300 bg-emerald-50/20 hover:border-emerald-400"
                            : order.certifiedQuantity
                            ? "border-amber-300 bg-amber-50/15 hover:border-amber-400"
                            : "border-ink-200 hover:border-ink-300 bg-white"
                        }`}
                      >
                        <div>
                          {/* Top: Order & Badges */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-mono text-xs font-bold text-brand-700 truncate" title={order.ProductionOrder}>
                              {order.ProductionOrder}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {entityBadge && (
                                <span className="text-[9px] font-mono font-bold bg-ink-100 text-ink-700 px-1 py-0.5 rounded">
                                  {entityBadge}
                                </span>
                              )}
                              {statusLabel && (
                                <Badge tone={statusTone} className="text-[9px] font-semibold px-1 py-0.5">
                                  {statusLabel}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Item Description */}
                          <div className="font-semibold text-xs text-ink-900 line-clamp-1 mb-1" title={order.ItemDescription}>
                            {order.ItemDescription}
                          </div>

                          {/* Customer & Qualification Pill */}
                          <div className="flex items-center justify-between gap-1 mb-1.5 text-[10px]">
                            <span className="text-ink-500 truncate max-w-[100px]" title={order.CustomerName}>
                              {order.CustomerName}
                            </span>
                            {order.isFullyCertified ? (
                              <Badge tone="success" className="text-[9px] font-bold px-1 py-0">
                                COC Created ({order.certifiedQuantity}/{order.Quantity})
                              </Badge>
                            ) : order.certifiedQuantity ? (
                              <Badge tone="warning" className="text-[9px] font-bold px-1 py-0">
                                {order.certifiedQuantity}/{order.Quantity} Cert • {order.pendingCocQuantity} Pend
                              </Badge>
                            ) : (
                              <Badge tone="neutral" className="text-[9px] font-medium px-1 py-0">
                                {order.Quantity} Qty Pending
                              </Badge>
                            )}
                          </div>

                          {/* 2x2 Specs Grid */}
                          <div className="pt-1.5 border-t border-ink-100 grid grid-cols-2 gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-600">
                            <div className="truncate">
                              Part: <span className="font-mono font-bold text-ink-900">{order.ItemNumber}</span>
                            </div>
                            <div className="truncate">
                              Cust: <span className="font-mono font-semibold text-brand-800">{order.CustomerPartNumber || "160072"}</span>
                            </div>
                            <div className="truncate">
                              PO: <span className="font-medium text-ink-700">{order.CustomerPO || "—"}</span>
                            </div>
                            <div className="truncate">
                              Qty: <span className="font-bold text-ink-900">{order.Quantity} {order.UnitOfMeasure || "Pcs"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom: View COC Action if Certified */}
                        {order.isFullyCertified && order.cocList?.[0] ? (
                          <div className="mt-2 pt-1.5 border-t border-emerald-200 flex items-center justify-between gap-1">
                            <span className="text-[10px] font-semibold text-emerald-800 truncate">
                              Certified
                            </span>
                            <Link
                              href={`/coc/${order.cocList[0].id}`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded shadow-2xs transition-colors shrink-0"
                            >
                              <Eye className="h-3 w-3" /> View COC ({order.cocList[0].coc_number})
                            </Link>
                          </div>
                        ) : order.certifiedQuantity && order.cocList?.[0] ? (
                          <div className="mt-2 pt-1.5 border-t border-amber-200 flex items-center justify-between gap-1 text-[10px]">
                            <span className="font-semibold text-amber-800 truncate">
                              {order.pendingCocQuantity} pending
                            </span>
                            <Link
                              href={`/coc/${order.cocList[0].id}`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 font-semibold text-brand-800 hover:underline shrink-0"
                            >
                              View ({order.cocList[0].coc_number}) <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Order Summary (mobile / small screen fallback) */}
              {selectedPO && (
                <div className="lg:hidden rounded-xl border-2 border-brand-300 bg-gradient-to-br from-brand-50/40 via-white to-emerald-50/30 p-4 sm:p-5 shadow-xs space-y-4">
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
                          {/* Qualification Badges */}
                          {selectedPO.isFullyCertified ? (
                            <Badge tone="success" className="text-[10px] font-bold">
                              COC Created ({selectedPO.certifiedQuantity}/{selectedPO.Quantity} Qty)
                            </Badge>
                          ) : selectedPO.certifiedQuantity ? (
                            <Badge tone="warning" className="text-[10px] font-bold">
                              {selectedPO.certifiedQuantity}/{selectedPO.Quantity} Certified &bull; {selectedPO.pendingCocQuantity} Pending for COC
                            </Badge>
                          ) : (
                            <Badge tone="neutral" className="text-[10px] font-medium">
                              {selectedPO.Quantity} Qty Pending for COC
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-ink-900 mt-0.5">
                          {selectedPO.ItemDescription}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {selectedPO.isFullyCertified && selectedPO.cocList?.[0] && (
                        <Link
                          href={`/coc/${selectedPO.cocList[0].id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> View COC ({selectedPO.cocList[0].coc_number})
                        </Link>
                      )}
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

                  {/* Fully Certified Alert Banner in Card 2 */}
                  {selectedPO.isFullyCertified ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50/90 p-3 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                        <span>
                          <strong>COC Created ({selectedPO.certifiedQuantity}/{selectedPO.Quantity} Qty):</strong> All {selectedPO.Quantity} unit(s) for this Production Order have already been certified. This order is not qualified for generating another COC.
                        </span>
                      </div>
                      {selectedPO.cocList?.[0] && (
                        <Link
                          href={`/coc/${selectedPO.cocList[0].id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 underline hover:text-emerald-950 shrink-0"
                        >
                          Open Certificate <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ) : selectedPO.certifiedQuantity ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-amber-700 shrink-0" />
                        <span>
                          <strong>Partial Certification:</strong> {selectedPO.certifiedQuantity} of {selectedPO.Quantity} unit(s) certified. {selectedPO.pendingCocQuantity} unit(s) pending for certification.
                        </span>
                      </div>
                      {selectedPO.cocList?.[0] && (
                        <Link
                          href={`/coc/${selectedPO.cocList[0].id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline hover:text-amber-950 shrink-0"
                        >
                          View Certified Unit ({selectedPO.cocList[0].coc_number}) <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ) : null}

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
                          {salesOrders.map((so) => {
                            let prefix = "🟢";
                            let statusText = `${so.Quantity} pcs available`;
                            if (so.isFullyAssigned) {
                              prefix = "🔴 FULLY ASSIGNED:";
                              statusText = `${so.assignedQuantity}/${so.Quantity} pcs used (${so.assignedCocs?.map((c) => c.coc_number).join(", ")})`;
                            } else if (so.assignedQuantity) {
                              prefix = "🟡 PARTIAL:";
                              statusText = `${so.assignedQuantity}/${so.Quantity} assigned, ${so.remainingSalesQty} pending (${so.assignedCocs?.map((c) => c.coc_number).join(", ")})`;
                            }
                            return (
                              <option key={so.SalesOrder} value={so.SalesOrder}>
                                {prefix} {so.SalesOrder} &bull; {(so.DeliveryAddressName || so.CustomerName)?.slice(0, 20)} &bull; Cust Part: {so.ExternalItemNumber || "160072"} &bull; [{statusText}]
                              </option>
                            );
                          })}
                          <option value="__custom__">+ Enter Custom Sales Order...</option>
                        </Select>
                      )}
                      <p className="text-[11px] text-ink-500">
                        Cross-referenced between Production Item Number <span className="font-mono font-medium text-ink-700">{selectedPO.ItemNumber}</span> and Sales Order Line items in D365.
                      </p>

                      {/* Active Sales Order Allocation Box */}
                      {(() => {
                        const activeSO = salesOrders.find((s) => s.SalesOrder === selectedPO.SalesOrder);
                        if (!activeSO) return null;
                        return (
                          <div className="mt-2.5 rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between font-bold text-ink-900">
                              <span className="flex items-center gap-1.5">
                                <ShoppingCart className="h-3.5 w-3.5 text-brand-600" />
                                Sales Order Allocation: <span className="font-mono text-brand-900">{activeSO.SalesOrder}</span>
                              </span>
                              <Badge tone={activeSO.isFullyAssigned ? "danger" : activeSO.assignedQuantity ? "warning" : "success"}>
                                {activeSO.isFullyAssigned
                                  ? "Fully Assigned"
                                  : activeSO.assignedQuantity
                                  ? `${activeSO.assignedQuantity}/${activeSO.Quantity} Assigned`
                                  : "Available for COC"}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[11px] text-ink-700 bg-white/80 p-2 rounded border border-brand-100">
                              <div>Total SO Line Qty: <strong className="font-semibold text-ink-900">{activeSO.Quantity} Pcs</strong></div>
                              <div>Certified / Assigned: <strong className="font-semibold text-emerald-700">{activeSO.assignedQuantity || 0} Pcs</strong></div>
                              <div>Pending / Available: <strong className="font-semibold text-brand-800">{activeSO.remainingSalesQty !== undefined ? activeSO.remainingSalesQty : activeSO.Quantity} Pcs</strong></div>
                            </div>

                            {activeSO.assignedCocs && activeSO.assignedCocs.length > 0 && (
                              <div className="pt-1.5 text-[11px] space-y-1">
                                <p className="font-semibold text-ink-800">Already assigned & generated to below COC numbers:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {activeSO.assignedCocs.map((c) => (
                                    <Link
                                      key={c.id}
                                      href={`/coc/${c.id}`}
                                      target="_blank"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-brand-300 text-brand-900 font-mono font-bold hover:bg-brand-100/70 shadow-xs transition-colors"
                                    >
                                      <span>{c.coc_number}</span>
                                      <span className="text-[10px] font-normal text-ink-500">({c.production_order}{c.serial_number ? ` &bull; ${c.serial_number}` : ''})</span>
                                      <ExternalLink className="h-3 w-3 text-brand-600" />
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                    <div>Delivery Date: <span className="font-mono text-ink-800">{manualFields.DeliveryDate || selectedPO.DeliveryDate || "—"}</span></div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-ink-200">
                {selectedPO?.isFullyCertified ? (
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950 bg-emerald-100/70 px-3 py-2 rounded-md border border-emerald-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span>
                      Order fully certified ({selectedPO.certifiedQuantity}/{selectedPO.Quantity} units). Not qualified for generating another COC.
                    </span>
                  </div>
                ) : selectedPO?.certifiedQuantity ? (
                  <div className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                    <Info className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      {selectedPO.pendingCocQuantity} unit(s) pending for certification. Click Next to certify next unit.
                    </span>
                  </div>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  {selectedPO?.isFullyCertified && selectedPO.cocList?.[0] && (
                    <Link
                      href={`/coc/${selectedPO.cocList[0].id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      View Certificate ({selectedPO.cocList[0].coc_number})
                    </Link>
                  )}
                  <Button
                    disabled={!selectedPO || Boolean(selectedPO.isFullyCertified)}
                    onClick={() => setStep(2)}
                    className="gap-2 disabled:opacity-50"
                  >
                    Next: Quality Checks <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
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
                    value={manualFields.CustomerName || selectedPO?.CustomerName || "VESTAS WIND TECHNOLOGYS INDIA PVT LTD"}
                    onChange={(e) => setManualFields({ ...manualFields, CustomerName: e.target.value })}
                    className="bg-white font-medium text-ink-900"
                  />
                </Field>

                <Field label="Production Order Delivery Date">
                  <Input
                    type="date"
                    value={manualFields.DeliveryDate || (selectedPO?.DeliveryDate ? selectedPO.DeliveryDate.slice(0, 10) : "")}
                    onChange={(e) => setManualFields({ ...manualFields, DeliveryDate: e.target.value })}
                    className="bg-white font-medium text-ink-900"
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
            description="Sign off on quality verification using your authorized user credentials or draw manually."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant={signatureMode === "auto" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSignatureMode("auto");
                    const autoSig = generateAutoSignature(userName);
                    if (autoSig) {
                      setSignatureDataUrl(autoSig);
                      setHasSignature(true);
                    }
                  }}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Auto-Sign ({userName.split(" ")[0]})
                </Button>
                <Button
                  variant={signatureMode === "draw" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSignatureMode("draw")}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <PenTool className="h-3.5 w-3.5" /> Draw Manually
                </Button>
                {signatureMode === "draw" && (
                  <Button variant="outline" size="sm" onClick={clearSignature}>
                    <RotateCcw className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>
            }
          />
          <CardBody className="space-y-4">
            {signatureMode === "auto" ? (
              <div className="rounded-xl border-2 border-brand-300 bg-gradient-to-br from-brand-50/60 to-sky-50/40 p-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <span className="font-bold text-sm text-ink-900">Authorized Digital Signature Ready</span>
                      <Badge tone="success">Verified User</Badge>
                    </div>
                    <p className="text-xs text-ink-600">
                      Signatory: <strong className="text-ink-900">{userName}</strong> ({userEmail})
                    </p>
                    <p className="text-[11px] text-ink-500">
                      Timestamp: {new Date().toISOString().slice(0, 10)} • Quality Assurance Authorized Signatory
                    </p>
                  </div>
                  <Badge tone="brand" className="text-xs px-3 py-1 font-bold">
                    ✓ Auto-Applied to Certificate
                  </Badge>
                </div>

                {signatureDataUrl && (
                  <div className="mt-4 flex justify-center rounded-lg border border-brand-200 bg-white p-3 shadow-inner">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signatureDataUrl}
                      alt="Digital Signature Preview"
                      className="max-h-28 object-contain"
                    />
                  </div>
                )}
              </div>
            ) : (
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
            )}

            <div className="flex justify-between pt-4 border-t border-ink-200">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => {
                  generatePreview();
                  setStep(4);
                }}
                className="gap-2 bg-brand-500 hover:bg-brand-600 text-ink-900 font-semibold"
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

        </div>
      </div>

      {/* Fixed Right Sidebar - Fixed like the left menu bar */}
      <aside className="hidden lg:flex w-96 xl:w-[420px] 2xl:w-[460px] shrink-0 flex-col border-l border-ink-200 bg-white h-full overflow-hidden shadow-xs">
        {/* Right Sidebar Header */}
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 bg-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-ink-900 font-bold shadow-xs shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-500 leading-tight">
                Active Production Order
              </div>
              <div className="text-xs font-bold text-ink-900 truncate">
                {selectedPO ? selectedPO.ProductionOrder : "None Selected"}
              </div>
            </div>
          </div>
          {selectedPO && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setManualOrder({ ...selectedPO });
                setModalIsCustomSO(false);
                setShowManualModal(true);
                fetchModalSalesOrders(selectedPO.ItemNumber, selectedPO.dataAreaId || selectedCompany);
              }}
              className="text-xs gap-1 h-7 px-2 shrink-0 border-ink-200 hover:bg-ink-100"
            >
              <Edit3 className="h-3 w-3" />
              Edit Details
            </Button>
          )}
        </div>

        {/* Right Sidebar Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {selectedPO ? (
            <>
              {/* Order Number & Badges */}
              <div className="rounded-xl border border-brand-200 bg-white p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-brand-900 bg-brand-100/80 px-2 py-0.5 rounded border border-brand-300">
                    {selectedPO.ProductionOrder}
                  </span>
                  {selectedPO.dataAreaId && (
                    <Badge tone="brand" className="text-[10px] font-mono font-bold">
                      {selectedPO.dataAreaId}
                    </Badge>
                  )}
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
                      className="text-[10px] font-semibold"
                    >
                      {selectedPO.ProductionOrderStatus === "Completed"
                        ? "End"
                        : selectedPO.ProductionOrderStatus === "ReportedFinished"
                        ? "Reported as finished"
                        : selectedPO.ProductionOrderStatus}
                    </Badge>
                  )}
                </div>

                <div>
                  <div className="text-sm font-bold text-ink-900 leading-snug">
                    {selectedPO.ItemDescription}
                  </div>
                  <div className="text-[11px] font-mono text-ink-500 mt-0.5">
                    D365 Item: <strong className="text-ink-800">{selectedPO.ItemNumber}</strong>
                  </div>
                </div>

                {/* Qualification Status Badges */}
                <div className="pt-1">
                  {selectedPO.isFullyCertified ? (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50/90 p-2.5 text-xs text-emerald-950 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                        <span className="leading-tight">
                          <strong>COC Created ({selectedPO.certifiedQuantity}/{selectedPO.Quantity} Qty):</strong> All units certified. Not qualified for generating another COC.
                        </span>
                      </div>
                      {selectedPO.cocList?.[0] && (
                        <Link
                          href={`/coc/${selectedPO.cocList[0].id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 underline hover:text-emerald-950"
                        >
                          Open Certificate ({selectedPO.cocList[0].coc_number}) <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ) : selectedPO.certifiedQuantity ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50/90 p-2.5 text-xs text-amber-950 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <Info className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <span className="leading-tight">
                          <strong>Partial Certification:</strong> {selectedPO.certifiedQuantity} of {selectedPO.Quantity} certified. {selectedPO.pendingCocQuantity} unit(s) pending.
                        </span>
                      </div>
                      {selectedPO.cocList?.[0] && (
                        <Link
                          href={`/coc/${selectedPO.cocList[0].id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 underline hover:text-amber-950"
                        >
                          View Certified Unit ({selectedPO.cocList[0].coc_number}) <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ) : (
                    <Badge tone="neutral" className="text-[10px] font-medium">
                      {selectedPO.Quantity} Qty Pending for COC
                    </Badge>
                  )}
                </div>

                {/* Serial Warning if duplicate serial */}
                {serialWarning && (
                  <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900 flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight">{serialWarning}</span>
                  </div>
                )}
              </div>

              {/* Sales Order & Customer Part Configuration Card */}
              <div className="rounded-xl border border-brand-200 bg-white p-3.5 shadow-xs space-y-3">
                {/* Sales Order Dropdown */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5 text-brand-600" />
                      Sales Order Number
                    </label>
                    <span className="text-[11px] text-brand-700 font-medium">
                      {loadingSalesOrders ? "Querying D365..." : `${salesOrders.length} matching order(s)`}
                    </span>
                  </div>
                  <div className="text-[10px] text-ink-400 font-mono">
                    Cross-checked by Item: {selectedPO.ItemNumber}
                  </div>

                  {isCustomSO ? (
                    <div className="flex gap-1.5">
                      <Input
                        value={customSOValue || selectedPO.SalesOrder}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomSOValue(v);
                          setSelectedPO({ ...selectedPO, SalesOrder: v });
                        }}
                        placeholder="Enter custom SO..."
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCustomSO(false)}
                        className="text-xs px-2 shrink-0"
                      >
                        Back
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={salesOrders.some((s) => s.SalesOrder === selectedPO.SalesOrder) ? selectedPO.SalesOrder : (salesOrders[0]?.SalesOrder || "__custom__")}
                      onChange={(e) => handleSelectSalesOrder(e.target.value)}
                      className="font-medium text-xs bg-slate-50 border-brand-200 focus:border-brand-500 w-full"
                    >
                      {salesOrders.map((so) => {
                        let prefix = "🟢";
                        let statusText = `${so.Quantity} pcs available`;
                        if (so.isFullyAssigned) {
                          prefix = "🔴 FULLY ASSIGNED:";
                          statusText = `${so.assignedQuantity}/${so.Quantity} pcs used (${so.assignedCocs?.map((c) => c.coc_number).join(", ")})`;
                        } else if (so.assignedQuantity) {
                          prefix = "🟡 PARTIAL:";
                          statusText = `${so.assignedQuantity}/${so.Quantity} assigned, ${so.remainingSalesQty} pending (${so.assignedCocs?.map((c) => c.coc_number).join(", ")})`;
                        }
                        return (
                          <option key={so.SalesOrder} value={so.SalesOrder}>
                            {prefix} {so.SalesOrder} • {(so.DeliveryAddressName || so.CustomerName)?.slice(0, 16)} • Cust Part: {so.ExternalItemNumber || "160072"} • [{statusText}]
                          </option>
                        );
                      })}
                      <option value="__custom__">+ Enter Custom Sales Order...</option>
                    </Select>
                  )}

                  <p className="text-[10px] text-ink-500 leading-tight">
                    Cross-referenced between Production Item Number <span className="font-mono font-medium text-ink-700">{selectedPO.ItemNumber}</span> and Sales Order Line items in D365.
                  </p>

                  {/* Active Sales Order Allocation Box */}
                  {(() => {
                    const activeSO = salesOrders.find((s) => s.SalesOrder === selectedPO.SalesOrder);
                    if (!activeSO) return null;
                    return (
                      <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 text-xs space-y-2">
                        <div className="flex items-center justify-between font-bold text-ink-900 text-[11px]">
                          <span className="flex items-center gap-1 truncate">
                            <ShoppingCart className="h-3 w-3 text-brand-600 shrink-0" />
                            SO Allocation: <span className="font-mono text-brand-900">{activeSO.SalesOrder}</span>
                          </span>
                          <Badge tone={activeSO.isFullyAssigned ? "danger" : activeSO.assignedQuantity ? "warning" : "success"} className="text-[10px] px-1.5 py-0">
                            {activeSO.isFullyAssigned
                              ? "Fully Assigned"
                              : activeSO.assignedQuantity
                              ? `${activeSO.assignedQuantity}/${activeSO.Quantity} Assigned`
                              : "Available"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-ink-700 bg-white/90 p-1.5 rounded border border-brand-100 text-center">
                          <div>Total: <strong className="text-ink-900 block">{activeSO.Quantity} Pcs</strong></div>
                          <div>Certified: <strong className="text-emerald-700 block">{activeSO.assignedQuantity || 0} Pcs</strong></div>
                          <div>Pending: <strong className="text-brand-800 block">{activeSO.remainingSalesQty !== undefined ? activeSO.remainingSalesQty : activeSO.Quantity} Pcs</strong></div>
                        </div>

                        {activeSO.assignedCocs && activeSO.assignedCocs.length > 0 && (
                          <div className="pt-1 text-[10px] space-y-1">
                            <p className="font-semibold text-ink-800">Assigned COCs:</p>
                            <div className="flex flex-wrap gap-1">
                              {activeSO.assignedCocs.map((c) => (
                                <Link
                                  key={c.id}
                                  href={`/coc/${c.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-brand-300 text-brand-900 font-mono font-bold hover:bg-brand-100 text-[10px]"
                                >
                                  <span>{c.coc_number}</span>
                                  <ExternalLink className="h-2.5 w-2.5 text-brand-600" />
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Customer Part Number (External Item Number) */}
                <div className="space-y-1.5 pt-2 border-t border-ink-100">
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
                    placeholder="e.g. 160072 or 29274288"
                    className="font-mono font-bold text-brand-900 bg-brand-50/50 border-brand-300 text-xs"
                  />
                  <p className="text-[10px] text-brand-700">
                    Populated from <strong>ExternalItemNumber</strong> on Sales Line.
                  </p>
                </div>
              </div>

              {/* Order Key Metadata Box */}
              <div className="rounded-xl border border-ink-200 bg-white p-3 text-xs space-y-1.5 text-ink-700 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-500 text-[11px]">Customer:</span>
                  <span className="font-semibold text-ink-900 text-right truncate max-w-[200px]" title={selectedPO.CustomerName}>
                    {selectedPO.CustomerName || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500 text-[11px]">Customer PO:</span>
                  <span className="font-mono font-semibold text-ink-900">{selectedPO.CustomerPO || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500 text-[11px]">Total Quantity:</span>
                  <span className="font-semibold text-ink-900">{selectedPO.Quantity} {selectedPO.UnitOfMeasure}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500 text-[11px]">Delivery Date:</span>
                  <span className="font-mono text-ink-800">{manualFields.DeliveryDate || selectedPO.DeliveryDate || "—"}</span>
                </div>
                {selectedPO.dataAreaId && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500 text-[11px]">Legal Entity:</span>
                    <span className="font-mono font-bold text-brand-800">{selectedPO.dataAreaId}</span>
                  </div>
                )}
              </div>

              {/* Product Continuous Serial Sequence Status */}
              {productSequence ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-2.5 text-xs space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold text-emerald-900 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                      Continuous Series: {productSequence.rule.itemNumber}
                    </span>
                    <Badge tone={productSequence.rule.mode === "auto" ? "success" : "warning"} className="text-[9px] px-1 py-0 font-bold uppercase">
                      {productSequence.rule.mode}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-700">Serial for this COC:</span>
                    <span className="font-mono font-bold text-emerald-950">
                      {manualFields.SerialNumber || productSequence.samplePreview}
                    </span>
                  </div>
                  <div className="text-[9.5px] text-emerald-700">
                    Pattern: <code className="font-mono">{productSequence.rule.pattern}</code> &bull; Unit #{productSequence.rule.nextNumber}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-ink-200 bg-white p-2.5 text-xs flex items-center justify-between text-ink-600 shadow-2xs">
                  <span className="text-[11px] text-ink-500">Assigned Serial:</span>
                  <span className="font-mono font-bold text-ink-900 text-[11px]">
                    {manualFields.SerialNumber || "—"}
                  </span>
                </div>
              )}

              {/* Step Companion status */}
              {step > 1 && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-xs space-y-1.5 text-sky-900 shadow-xs">
                  <div className="font-bold text-sky-950 flex items-center justify-between text-[11px]">
                    <span>Active Step: Step {step}</span>
                    <Badge tone="info" className="text-[10px]">
                      {step === 2 ? "Quality Checks" : step === 3 ? "Digital Sign" : "Review & Issue"}
                    </Badge>
                  </div>
                  {step === 2 && (
                    <div className="text-[11px] text-sky-800">
                      Inspector: <strong>{manualFields.InspectorName}</strong> • Date: <strong>{manualFields.InspectionDate}</strong>
                    </div>
                  )}
                  {step === 3 && (
                    <div className="text-[11px] text-sky-800">
                      Signature: {hasSignature ? <strong className="text-emerald-700">Captured ✓</strong> : <strong className="text-amber-700">Pending drawing...</strong>}
                    </div>
                  )}
                  {step === 4 && (
                    <div className="text-[11px] text-sky-800">
                      Certificate ready for official issuance and SharePoint upload.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 my-auto h-full">
              <div className="h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 shadow-xs">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-ink-900">No Order Selected</h4>
              <p className="text-xs text-ink-500 max-w-[240px]">
                Select a production order from the list on the left to verify sales orders and proceed directly.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openManualOrder(poQuery)}
                className="text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Enter Custom Order
              </Button>
            </div>
          )}
        </div>

        {/* Right Sidebar Pinned Footer */}
        <div className="border-t border-ink-200 p-4 bg-white shrink-0 space-y-2 shadow-xs">
          {step === 1 ? (
            <div className="space-y-2">
              {selectedPO?.isFullyCertified ? (
                <>
                  <div className="text-[11px] font-semibold text-emerald-950 bg-emerald-100/70 p-2 rounded border border-emerald-300 text-center">
                    Fully certified ({selectedPO.certifiedQuantity}/{selectedPO.Quantity}). Not qualified for another COC.
                  </div>
                  {selectedPO.cocList?.[0] && (
                    <Link
                      href={`/coc/${selectedPO.cocList[0].id}`}
                      target="_blank"
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Certificate ({selectedPO.cocList[0].coc_number})
                    </Link>
                  )}
                  <Button disabled className="w-full justify-center opacity-50 text-xs">
                    Next: Quality Checks <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </>
              ) : (
                <Button
                  disabled={!selectedPO}
                  onClick={() => setStep(2)}
                  className="w-full justify-center gap-2 font-bold py-2.5 shadow-sm text-sm"
                >
                  Next: Quality Checks <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : step === 2 ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1 justify-center text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Orders
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1 justify-center text-xs font-bold">
                Next: Sign <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          ) : step === 3 ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1 justify-center text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Quality
              </Button>
              <Button onClick={() => { generatePreview(); setStep(4); }} className="flex-1 justify-center text-xs font-bold">
                Next: Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1 justify-center text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Sign
              </Button>
              <Button loading={generating} onClick={handleCreateCoc} className="flex-1 justify-center text-xs font-bold bg-brand-500 hover:bg-brand-600 text-ink-900">
                Issue COC <FileCheck className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </aside>

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
