"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Trash2, Search, ListPlus, Loader2 } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import {
  EMPTY_COC_PRODUCTS, newProductId, parseItemList, validateCocProducts,
  type CocProductCompany, type CocProductsConfig, type ProductMatch,
} from "@/lib/coc-products/types";

interface LookupItem {
  item: string;
  label: string;
  company: string;
}

/** Which products get a COC, per company – the production order search is limited to them. */
export function CocProductsPanel() {
  const [cfg, setCfg] = useState<CocProductsConfig>(EMPTY_COC_PRODUCTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    api<{ ok: boolean; config: CocProductsConfig }>("/api/admin/coc-products")
      .then((r) => setCfg(r.config || EMPTY_COC_PRODUCTS))
      .catch((e) => toast.error("Could not load the product list", (e as Error).message))
      .finally(() => setLoading(false));
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((r) => setCompanies(r.companies || []))
      .catch(() => undefined);
  }, []);

  const problem = validateCocProducts(cfg);

  const patchRow = (id: string, patch: Partial<CocProductCompany>) =>
    setCfg((c) => ({ ...c, companies: c.companies.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const addRow = () =>
    setCfg((c) => ({
      ...c,
      companies: [
        ...c.companies,
        {
          id: newProductId("prd"),
          company: companies.find((x) => !c.companies.some((r) => r.company === x.code))?.code || "",
          match: "exact" as ProductMatch,
          items: [],
          active: true,
        },
      ],
    }));

  const removeRow = (id: string) => setCfg((c) => ({ ...c, companies: c.companies.filter((r) => r.id !== id) }));

  const save = async () => {
    if (problem) {
      toast.error("Please fix the product list first", problem);
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/coc-products", { method: "PUT", json: { config: cfg } });
      toast.success("COC products saved", cfg.enabled ? "The production order search now only shows these items." : "The product list is switched off.");
    } catch (err) {
      toast.error("Could not save", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalItems = cfg.companies.reduce((n, r) => n + (r.active ? r.items.length : 0), 0);

  if (loading) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 py-10 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the product list…
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="COC products per company"
          description="List the item numbers that get a Certificate of Conformity. The production order search then asks Dynamics 365 only for those products."
          actions={<Badge tone={cfg.enabled ? "success" : "neutral"}>{cfg.enabled ? `${totalItems} items` : "Off"}</Badge>}
        />
        <CardBody className="space-y-3">
          <Checkbox
            label="Only show production orders of the listed products"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          <Checkbox
            label='Let users switch to "All production orders" on the New COC page'
            checked={cfg.allowSearchAll}
            onChange={(e) => setCfg({ ...cfg, allowSearchAll: e.target.checked })}
          />
          <p className="text-xs text-ink-500">
            A company that is not listed below is never restricted. Items are matched against the production order&apos;s item
            number.
          </p>
        </CardBody>
      </Card>

      {problem && <Alert tone="warning" title="Check the product list">{problem}</Alert>}

      {cfg.companies.map((row) => (
        <CompanyRow
          key={row.id}
          row={row}
          enabled={cfg.enabled}
          companies={companies}
          onPatch={(patch) => patchRow(row.id, patch)}
          onRemove={() => removeRow(row.id)}
        />
      ))}

      {cfg.companies.length === 0 && (
        <Card>
          <CardBody className="py-8 text-center text-sm text-ink-500">
            No company listed yet – add one and enter the item numbers that need a COC.
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add company
        </Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!!problem}>
          Save COC products
        </Button>
      </div>
    </div>
  );
}

function CompanyRow({
  row, enabled, companies, onPatch, onRemove,
}: {
  row: CocProductCompany;
  enabled: boolean;
  companies: { code: string; name: string }[];
  onPatch: (patch: Partial<CocProductCompany>) => void;
  onRemove: () => void;
}) {
  const [bulk, setBulk] = useState("");
  const [lookup, setLookup] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupEntity, setLookupEntity] = useState<string | null>(null);

  const addItems = (items: { item: string; label?: string }[]) => {
    const existing = new Set(row.items.map((i) => i.item.trim().toUpperCase()));
    const fresh = items.filter((i) => i.item.trim() && !existing.has(i.item.trim().toUpperCase()));
    if (!fresh.length) {
      toast.info("Nothing new to add");
      return;
    }
    onPatch({ items: [...row.items, ...fresh.map((i) => ({ item: i.item.trim(), label: i.label?.trim() || undefined }))] });
  };

  const runLookup = async (refresh = false) => {
    if (lookup.trim().length < 2) {
      toast.error("Type at least two characters");
      return;
    }
    setSearching(true);
    setLookupError(null);
    try {
      const res = await api<{ ok: boolean; items: LookupItem[]; entity?: string | null; error: string | null }>(
        `/api/admin/coc-products/items?q=${encodeURIComponent(lookup.trim())}&company=${encodeURIComponent(row.company)}${refresh ? "&refresh=1" : ""}`,
      );
      setResults(res.items || []);
      setLookupEntity(res.entity || null);
      if (res.error) setLookupError(res.error);
    } catch (e) {
      setLookupError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={row.company || "New company"}
        description={`${row.items.length} item${row.items.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Off"}</Badge>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-600">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Company">
            <Select value={row.company} onChange={(e) => onPatch({ company: e.target.value.toUpperCase() })}>
              <option value="">Choose…</option>
              {companies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} – {c.name}
                </option>
              ))}
              {row.company && !companies.some((c) => c.code === row.company) && (
                <option value={row.company}>{row.company}</option>
              )}
            </Select>
          </Field>
          <Field label="Match" hint="how the item number is compared">
            <Select value={row.match} onChange={(e) => onPatch({ match: e.target.value as ProductMatch })}>
              <option value="exact">Whole item number</option>
              <option value="prefix">Item numbers starting with</option>
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox label="Active" checked={row.active} onChange={(e) => onPatch({ active: e.target.checked })} />
          </div>
        </div>

        {/* look up products in D365FO */}
        <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
            <Search className="h-4 w-4" /> Find a product in Dynamics 365
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runLookup(false)}
              placeholder="Item number or product name"
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={() => runLookup(false)} loading={searching}>
              Search
            </Button>
            {lookup.trim().length >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  addItems([{ item: lookup.trim() }]);
                  setLookup("");
                  setResults([]);
                  setLookupError(null);
                }}
              >
                Add &quot;{lookup.trim()}&quot; as typed
              </Button>
            )}
          </div>
          {lookupEntity && !lookupError && (
            <p className="mt-2 text-[11px] text-ink-500">
              Read from <span className="font-mono">{lookupEntity}</span>
            </p>
          )}
          {lookupError && (
            <div className="mt-2 space-y-1">
              <p className="break-all text-xs text-amber-700">
                {lookupError.length > 400 ? `${lookupError.slice(0, 400)}…` : lookupError}
              </p>
              <button type="button" onClick={() => runLookup(true)} className="text-xs font-semibold text-brand-700 hover:underline">
                Look for the product list again
              </button>
            </div>
          )}
          {results.length > 0 && (
            <div className="mt-2 max-h-48 space-y-1 overflow-auto rounded border border-ink-200 bg-white p-2">
              {results.map((r) => {
                const added = row.items.some((i) => i.item.trim().toUpperCase() === r.item.toUpperCase());
                return (
                  <button
                    key={`${r.company}-${r.item}`}
                    type="button"
                    disabled={added}
                    onClick={() => addItems([{ item: r.item, label: r.label }])}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs ${
                      added ? "cursor-default text-ink-400" : "hover:bg-brand-50"
                    }`}
                  >
                    <span>
                      <span className="font-mono font-semibold text-ink-900">{r.item}</span>
                      {r.label && <span className="ml-2 text-ink-600">{r.label}</span>}
                    </span>
                    <span className="text-[11px]">{added ? "added" : "+ add"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* paste a list */}
        <div className="rounded-lg border border-ink-200 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
            <ListPlus className="h-4 w-4" /> Paste item numbers
          </div>
          <Textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={3}
            placeholder="1071.0747, 1070.0049 — or one per line"
            className="mt-2"
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              const parsed = parseItemList(bulk);
              if (!parsed.length) {
                toast.error("Nothing to add");
                return;
              }
              addItems(parsed);
              setBulk("");
            }}
          >
            Add to the list
          </Button>
        </div>

        {/* the list */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
            <Package className="h-4 w-4" /> COC products ({row.items.length})
          </div>
          {row.items.length === 0 ? (
            <p className={`text-xs ${enabled ? "text-amber-700" : "text-ink-500"}`}>
              {enabled
                ? `No item yet, so ${row.company || "this company"} is not filtered – every production order still shows on the New COC page. Add at least one item number and save.`
                : "No item yet – search above or paste a list."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.items.map((it) => (
                <button
                  key={it.item}
                  type="button"
                  title={it.label ? `${it.label} — click to remove` : "Click to remove"}
                  onClick={() => onPatch({ items: row.items.filter((x) => x.item !== it.item) })}
                  className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-800 hover:bg-red-50 hover:text-red-700"
                >
                  {it.item}
                  {row.match === "prefix" ? "…" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
