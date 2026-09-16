"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Input,
  Field,
  Label,
  Dialog,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import {
  ProductSequenceRule,
  SequencesConfig,
  formatSequenceSerial,
  DEFAULT_SEQUENCES_CONFIG,
} from "@/lib/sequences/types";
import {
  Hash,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  Sparkles,
  Search,
  Check,
  AlertCircle,
  Play,
  Settings,
} from "lucide-react";

export function NumberSequencesPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SequencesConfig>(DEFAULT_SEQUENCES_CONFIG);
  const [searchFilter, setSearchFilter] = useState("");

  // Add / Edit Modal State
  const [editingRule, setEditingRule] = useState<ProductSequenceRule | null>(null);
  const [isNewRule, setIsNewRule] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form fields inside modal
  const [formItemNumber, setFormItemNumber] = useState("");
  const [formProductName, setFormProductName] = useState("");
  const [formMode, setFormMode] = useState<"auto" | "manual">("auto");
  const [formPattern, setFormPattern] = useState("{ItemNumber} - SN{###}");
  const [formNextNumber, setFormNextNumber] = useState(1);
  const [formPadding, setFormPadding] = useState(3);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; config: SequencesConfig }>("/api/admin/sequences");
      if (res.ok && res.config) {
        setConfig(res.config);
      }
    } catch (e) {
      toast.error("Could not load sequence rules", (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveGlobalDefaults = async () => {
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; config: SequencesConfig }>("/api/admin/sequences", {
        method: "PUT",
        json: { config },
      });
      if (res.ok) {
        toast.success("Global sequence defaults updated!");
      }
    } catch (e) {
      toast.error("Failed to save global defaults", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddModal = () => {
    setIsNewRule(true);
    setEditingRule(null);
    setFormItemNumber("");
    setFormProductName("");
    setFormMode(config.defaultMode || "auto");
    setFormPattern(config.defaultPattern || "{ItemNumber} - SN{###}");
    setFormNextNumber(1);
    setFormPadding(config.defaultPadding || 3);
    setShowModal(true);
  };

  const handleOpenEditModal = (rule: ProductSequenceRule) => {
    setIsNewRule(false);
    setEditingRule(rule);
    setFormItemNumber(rule.itemNumber);
    setFormProductName(rule.productName || "");
    setFormMode(rule.mode);
    setFormPattern(rule.pattern || "{ItemNumber} - SN{###}");
    setFormNextNumber(rule.nextNumber || 1);
    setFormPadding(rule.padding || 3);
    setShowModal(true);
  };

  const handleSaveModal = async () => {
    const cleanItem = formItemNumber.trim();
    if (!cleanItem) {
      toast.error("Please enter a valid Item / Product Number");
      return;
    }

    const rule: ProductSequenceRule = {
      itemNumber: cleanItem,
      productName: formProductName.trim() || cleanItem,
      mode: formMode,
      pattern: formPattern.trim() || "{ItemNumber} - SN{###}",
      nextNumber: Math.max(1, Number(formNextNumber) || 1),
      padding: Math.max(1, Number(formPadding) || 3),
      lastGeneratedSerial: editingRule?.lastGeneratedSerial || null,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const res = await api<{ ok: boolean; rule: ProductSequenceRule }>("/api/admin/sequences", {
        method: isNewRule ? "POST" : "PUT",
        json: isNewRule ? rule : { rule },
      });

      if (res.ok) {
        toast.success(
          isNewRule
            ? `Product sequence for ${cleanItem} created successfully!`
            : `Product sequence for ${cleanItem} updated!`
        );
        setShowModal(false);
        fetchConfig();
      }
    } catch (e) {
      toast.error("Failed to save product sequence rule", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMode = async (rule: ProductSequenceRule) => {
    const nextMode = rule.mode === "auto" ? "manual" : "auto";
    const updated: ProductSequenceRule = {
      ...rule,
      mode: nextMode,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await api<{ ok: boolean }>("/api/admin/sequences", {
        method: "PUT",
        json: { rule: updated },
      });
      if (res.ok) {
        toast.success(`${rule.itemNumber} mode switched to ${nextMode.toUpperCase()}`);
        setConfig((prev) => ({
          ...prev,
          productRules: {
            ...prev.productRules,
            [rule.itemNumber]: updated,
          },
        }));
      }
    } catch (e) {
      toast.error("Could not update mode", (e as Error).message);
    }
  };

  const handleDeleteRule = async (itemNumber: string) => {
    if (!confirm(`Are you sure you want to delete the sequence rule for product ${itemNumber}?`)) {
      return;
    }

    try {
      const res = await api<{ ok: boolean }>(`/api/admin/sequences?itemNumber=${encodeURIComponent(itemNumber)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Sequence rule for ${itemNumber} deleted.`);
        setConfig((prev) => {
          const nextRules = { ...prev.productRules };
          delete nextRules[itemNumber];
          return { ...prev, productRules: nextRules };
        });
      }
    } catch (e) {
      toast.error("Failed to delete sequence rule", (e as Error).message);
    }
  };

  const handleResetCounter = async (rule: ProductSequenceRule) => {
    const input = prompt(`Enter new starting number for ${rule.itemNumber}:`, "1");
    if (input === null) return;
    const num = parseInt(input, 10);
    if (isNaN(num) || num < 1) {
      toast.error("Please enter a valid positive number");
      return;
    }

    const updated: ProductSequenceRule = {
      ...rule,
      nextNumber: num,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await api<{ ok: boolean }>("/api/admin/sequences", {
        method: "PUT",
        json: { rule: updated },
      });
      if (res.ok) {
        toast.success(`${rule.itemNumber} counter reset to ${num}`);
        setConfig((prev) => ({
          ...prev,
          productRules: {
            ...prev.productRules,
            [rule.itemNumber]: updated,
          },
        }));
      }
    } catch (e) {
      toast.error("Could not reset counter", (e as Error).message);
    }
  };

  const rulesList = Object.values(config.productRules || {});
  const filteredRules = rulesList.filter((r) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      r.itemNumber.toLowerCase().includes(q) ||
      (r.productName && r.productName.toLowerCase().includes(q)) ||
      r.pattern.toLowerCase().includes(q)
    );
  });

  const previewModalSerial = formatSequenceSerial(
    formPattern,
    formItemNumber || "1070.0049",
    formNextNumber || 1,
    formPadding || 3
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Global Defaults Card */}
      <Card>
        <CardHeader
          title="Product Serial Number Sequences"
          description="Configure automatic continuous serial number sequences per product series. Each product item maintains its own independent sequence."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveGlobalDefaults}
              loading={saving}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5 text-brand-600" />
              Save Global Defaults
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Field
              label="Default Generation Mode"
              hint="Applied to newly auto-created product series"
            >
              <select
                value={config.defaultMode}
                onChange={(e) =>
                  setConfig({ ...config, defaultMode: e.target.value as "auto" | "manual" })
                }
                className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
              >
                <option value="auto">Auto (Continuous sequential)</option>
                <option value="manual">Manual (Operator entered)</option>
              </select>
            </Field>

            <Field
              label="Default Pattern"
              hint="Tokens: {ItemNumber}, {###}, {seq:N}, {yyyy}"
            >
              <Input
                value={config.defaultPattern}
                onChange={(e) => setConfig({ ...config, defaultPattern: e.target.value })}
                placeholder="{ItemNumber} - SN{###}"
              />
            </Field>

            <Field label="Default Number Padding" hint="Width of zero-padding (e.g. 3 &rarr; 001)">
              <Input
                type="number"
                min={1}
                max={8}
                value={config.defaultPadding}
                onChange={(e) =>
                  setConfig({ ...config, defaultPadding: Math.max(1, Number(e.target.value) || 3) })
                }
              />
            </Field>

            <div className="flex flex-col justify-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoCreateProductSeries}
                  onChange={(e) =>
                    setConfig({ ...config, autoCreateProductSeries: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-ink-300 accent-ink-900"
                />
                <span className="text-xs font-semibold text-ink-900">
                  Auto-create series for new products
                </span>
              </label>
              <p className="text-[11px] text-ink-500 mt-1">
                When an order for an unconfigured product is selected, auto-initialize its sequence starting from 1.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Product Series Catalog */}
      <Card>
        <CardHeader
          title={`Configured Product Series (${rulesList.length})`}
          description="Manage independent continuous sequences for specific product items (e.g. 1070.0049, 29110478R05)."
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter product #..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button size="sm" onClick={handleOpenAddModal} className="gap-1.5 h-8 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add Product Sequence
              </Button>
            </div>
          }
        />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-ink-700">
              <thead className="bg-ink-50/80 text-[11px] font-semibold text-ink-500 uppercase tracking-wider border-b border-ink-100">
                <tr>
                  <th className="px-4 py-3">Product / Item No.</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Sequence Pattern</th>
                  <th className="px-4 py-3">Next Number</th>
                  <th className="px-4 py-3">Next Serial Preview</th>
                  <th className="px-4 py-3">Last Issued Serial</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                      {searchFilter ? "No matching product sequences found." : "No product sequences configured yet."}
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((rule) => {
                    const nextSerial = formatSequenceSerial(
                      rule.pattern,
                      rule.itemNumber,
                      rule.nextNumber,
                      rule.padding
                    );

                    return (
                      <tr key={rule.itemNumber} className="hover:bg-ink-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-ink-900">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                              {rule.itemNumber}
                            </span>
                            {rule.productName && rule.productName !== rule.itemNumber && (
                              <span className="text-ink-500 text-[11px] truncate max-w-[150px]">
                                {rule.productName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleToggleMode(rule)}
                            className="inline-flex items-center cursor-pointer group"
                            title="Click to toggle between Auto and Manual mode"
                          >
                            <Badge
                              tone={rule.mode === "auto" ? "success" : "warning"}
                              className="group-hover:opacity-80 transition-opacity font-bold uppercase text-[10px]"
                            >
                              {rule.mode} ⟳
                            </Badge>
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-800">
                          {rule.pattern}
                        </td>
                        <td className="px-4 py-3 font-bold text-ink-900">
                          <div className="flex items-center gap-1.5">
                            <span>#{rule.nextNumber}</span>
                            <button
                              type="button"
                              onClick={() => handleResetCounter(rule)}
                              className="text-ink-400 hover:text-brand-700"
                              title="Set or reset next number counter"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50/40">
                          {nextSerial}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-500">
                          {rule.lastGeneratedSerial || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditModal(rule)}
                              className="h-7 w-7 p-0 text-ink-600 hover:text-brand-700"
                              title="Edit sequence rule"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRule(rule.itemNumber)}
                              className="h-7 w-7 p-0 text-ink-400 hover:text-red-600"
                              title="Delete rule"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Add / Edit Product Sequence Dialog */}
      {showModal && (
        <Dialog
          open={showModal}
          onClose={() => setShowModal(false)}
          title={isNewRule ? "Add Product Number Sequence" : `Edit Sequence: ${formItemNumber}`}
        >
          <div className="space-y-4 pt-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product / Item Number *" hint="e.g. 1070.0049">
                <Input
                  value={formItemNumber}
                  onChange={(e) => setFormItemNumber(e.target.value)}
                  disabled={!isNewRule}
                  placeholder="e.g. 1070.0049"
                  required
                />
              </Field>

              <Field label="Product Description / Name" hint="Optional description">
                <Input
                  value={formProductName}
                  onChange={(e) => setFormProductName(e.target.value)}
                  placeholder="e.g. Baseframe Module"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Generation Mode" hint="Auto continuous vs Manual entry">
                <select
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value as "auto" | "manual")}
                  className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
                >
                  <option value="auto">Auto (Continuous Serial Generation)</option>
                  <option value="manual">Manual (Operator Enters Serial)</option>
                </select>
              </Field>

              <Field label="Next Sequence Number" hint="Current counter value">
                <Input
                  type="number"
                  min={1}
                  value={formNextNumber}
                  onChange={(e) => setFormNextNumber(Math.max(1, Number(e.target.value) || 1))}
                />
              </Field>
            </div>

            <Field label="Sequence Pattern" hint="Pattern placeholders: {ItemNumber}, {###}, {####}, {yyyy}">
              <Input
                value={formPattern}
                onChange={(e) => setFormPattern(e.target.value)}
                placeholder="{ItemNumber} - SN{###}"
              />
            </Field>

            {/* Pattern Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-ink-500 font-medium">Quick Patterns:</span>
              {[
                "{ItemNumber} - SN{###}",
                "SN{####}",
                "{ItemNumber}-SN{###}",
                "HSRE-{ItemNumber}-{###}",
              ].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormPattern(p)}
                  className="px-2 py-0.5 rounded border border-ink-200 bg-ink-50 text-[11px] font-mono text-ink-700 hover:bg-brand-50 hover:border-brand-300 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Live Serial Preview Box */}
            <div className="rounded-lg border-2 border-brand-300 bg-brand-50/50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-900">
                Generated Serial Preview:
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-brand-950 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-600 shrink-0" />
                <span>{previewModalSerial}</span>
              </div>
              <p className="text-[10px] text-ink-600 mt-1">
                When generating a COC for this product, the system will {formMode === "auto" ? "automatically assign" : "suggest"} this serial and then advance to #{formNextNumber + 1}.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveModal} loading={saving} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {isNewRule ? "Create Sequence" : "Save Changes"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
