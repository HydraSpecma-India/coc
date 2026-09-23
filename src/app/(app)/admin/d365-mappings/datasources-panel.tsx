"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Link2, Database, Play, RefreshCw, Search } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Spinner, Table, Td, Th,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import {
  EMPTY_DATASOURCES, ROOT_ALIAS, ROOT_FIELDS, newId, qualifiedName, validateDataSources,
  type DataEntity, type DataLink, type DataSourcesConfig,
} from "@/lib/d365-data/types";

interface PreviewStep {
  alias: string;
  entity: string;
  filter: string;
  rows: number;
  error?: string;
}
interface PreviewResult {
  order: Record<string, unknown>;
  related: { values: Record<string, string>; steps: PreviewStep[] };
  mode?: string;
}

const emptyEntity = (): DataEntity => ({
  id: newId("tbl"),
  alias: "",
  label: "",
  entity: "",
  fields: [],
  filter: "",
  filterByCompany: true,
  top: 1,
  active: true,
});

export function DataSourcesPanel({ initialConfig }: { initialConfig: DataSourcesConfig }) {
  const [cfg, setCfg] = useState<DataSourcesConfig>(initialConfig ?? EMPTY_DATASOURCES);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((r) => setCompanies(r.companies || []))
      .catch(() => undefined);
  }, []);

  const problem = validateDataSources(cfg);

  const patchEntity = (id: string, patch: Partial<DataEntity>) =>
    setCfg((c) => ({ ...c, entities: c.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const removeEntity = (e: DataEntity) =>
    setCfg((c) => ({
      ...c,
      entities: c.entities.filter((x) => x.id !== e.id),
      links: c.links.filter((l) => l.toAlias !== e.alias && l.fromAlias !== e.alias),
    }));

  const addEntity = () => setCfg((c) => ({ ...c, entities: [...c.entities, emptyEntity()] }));

  const addLink = (toAlias: string) =>
    setCfg((c) => ({
      ...c,
      links: [...c.links, { id: newId("rel"), fromAlias: ROOT_ALIAS, fromField: "SalesOrder", toAlias, toField: "", operator: "eq" }],
    }));

  const patchLink = (id: string, patch: Partial<DataLink>) =>
    setCfg((c) => ({ ...c, links: c.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const removeLink = (id: string) => setCfg((c) => ({ ...c, links: c.links.filter((l) => l.id !== id) }));

  const save = async () => {
    if (problem) {
      toast.error("Please fix the setup first", problem);
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/d365-datasources", { method: "PUT", json: { config: cfg } });
      toast.success("Tables and relations saved", "The fields can now be placed in the template designer.");
    } catch (err) {
      toast.error("Could not save", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** aliases a relation can start from (the production order + every other table) */
  const sourceAliases = (self: string) => [ROOT_ALIAS, ...cfg.entities.map((e) => e.alias).filter((a) => a && a !== self)];

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Tables & relations"
        description="Join more D365FO tables to the production order and use their fields on the certificate."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addEntity} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add table
            </Button>
            <Button size="sm" onClick={save} loading={saving} disabled={!!problem}>
              Save
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody className="space-y-3 text-sm text-ink-600">
          <p>
            Read extra D365FO tables for a COC. The production order is always the first table (short name{" "}
            <span className="font-mono font-semibold text-ink-900">{ROOT_ALIAS}</span>). Add another entity, choose the fields
            you need and say how it is related – for example{" "}
            <span className="font-mono text-ink-800">SalesOrderHeadersV2.SalesOrderNumber = order.SalesOrder</span>. Every
            field you pick becomes <span className="font-mono text-ink-800">alias.FieldName</span> and can be placed in the
            template designer like any other D365FO field.
          </p>
          <Checkbox
            label="Read these tables when a COC is created"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
        </CardBody>
      </Card>

      {problem && <Alert tone="warning" title="Setup is not complete">{problem}</Alert>}

      {cfg.entities.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-500">
            No extra tables yet. Add one to join more D365FO data into the certificate.
          </CardBody>
        </Card>
      )}

      {cfg.entities.map((e) => (
        <EntityCard
          key={e.id}
          entity={e}
          links={cfg.links.filter((l) => l.toAlias === e.alias)}
          sourceAliases={sourceAliases(e.alias)}
          fieldsOfAlias={(alias) =>
            alias === ROOT_ALIAS ? [...ROOT_FIELDS] : cfg.entities.find((x) => x.alias === alias)?.fields ?? []
          }
          companies={companies}
          onPatch={(patch) => patchEntity(e.id, patch)}
          onRemove={() => removeEntity(e)}
          onAddLink={() => addLink(e.alias)}
          onPatchLink={patchLink}
          onRemoveLink={removeLink}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addEntity} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add table
        </Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!!problem}>
          Save tables & relations
        </Button>
      </div>

      <PreviewBox config={cfg} companies={companies} />
    </div>
  );
}

function EntityCard({
  entity, links, sourceAliases, fieldsOfAlias, companies, onPatch, onRemove, onAddLink, onPatchLink, onRemoveLink,
}: {
  entity: DataEntity;
  links: DataLink[];
  sourceAliases: string[];
  fieldsOfAlias: (alias: string) => string[];
  companies: { code: string; name: string }[];
  onPatch: (patch: Partial<DataEntity>) => void;
  onRemove: () => void;
  onAddLink: () => void;
  onPatchLink: (id: string, patch: Partial<DataLink>) => void;
  onRemoveLink: (id: string) => void;
}) {
  const [available, setAvailable] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [filterText, setFilterText] = useState("");

  const loadFields = async () => {
    if (!entity.entity.trim()) {
      toast.error("Enter the D365FO entity name first");
      return;
    }
    setLoadingFields(true);
    setFieldError(null);
    try {
      const res = await api<{ ok: boolean; fields: string[]; error: string | null }>(
        `/api/admin/d365-datasources/fields?entity=${encodeURIComponent(entity.entity.trim())}&company=${encodeURIComponent(company)}`,
      );
      setAvailable(res.fields || []);
      if (res.error) setFieldError(res.error);
      else if (!res.fields?.length) setFieldError("The entity returned no rows, so the field list is empty.");
    } catch (err) {
      setFieldError((err as Error).message);
    } finally {
      setLoadingFields(false);
    }
  };

  const toggleField = (name: string) =>
    onPatch({ fields: entity.fields.includes(name) ? entity.fields.filter((f) => f !== name) : [...entity.fields, name] });

  const shown = available.filter((f) => !filterText.trim() || f.toLowerCase().includes(filterText.trim().toLowerCase()));

  return (
    <Card>
      <CardHeader
        title={entity.alias ? `${entity.alias} · ${entity.entity || "no entity"}` : "New table"}
        description={entity.label || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={entity.active ? "success" : "neutral"}>{entity.active ? "Active" : "Off"}</Badge>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-600">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Short name" hint="used in the field name">
            <Input
              value={entity.alias}
              placeholder="so"
              onChange={(ev) => onPatch({ alias: ev.target.value.replace(/[^A-Za-z0-9_]/g, "") })}
            />
          </Field>
          <Field label="D365FO entity" hint="OData entity set">
            <Input value={entity.entity} placeholder="SalesOrderHeadersV2" onChange={(ev) => onPatch({ entity: ev.target.value })} />
          </Field>
          <Field label="Title" hint="optional">
            <Input value={entity.label || ""} placeholder="Sales order header" onChange={(ev) => onPatch({ label: ev.target.value })} />
          </Field>
          <Field label="Rows to read">
            <Input
              type="number"
              min={1}
              max={50}
              value={entity.top}
              onChange={(ev) => onPatch({ top: Math.max(1, Math.min(50, Number(ev.target.value) || 1)) })}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Extra filter" hint="optional OData, e.g. SalesStatus eq 'Delivered'">
            <Input value={entity.filter || ""} placeholder="" onChange={(ev) => onPatch({ filter: ev.target.value })} />
          </Field>
          <div className="flex flex-wrap items-end gap-4 pb-1">
            <Checkbox
              label="Filter on the COC company (dataAreaId)"
              checked={entity.filterByCompany}
              onChange={(ev) => onPatch({ filterByCompany: ev.target.checked })}
            />
            <Checkbox label="Active" checked={entity.active} onChange={(ev) => onPatch({ active: ev.target.checked })} />
          </div>
        </div>

        {/* relations */}
        <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
              <Link2 className="h-4 w-4" /> Relation
            </div>
            <Button variant="ghost" size="sm" onClick={onAddLink} disabled={!entity.alias}>
              <Plus className="h-3.5 w-3.5" /> Add relation
            </Button>
          </div>
          {links.length === 0 && (
            <p className="text-xs text-ink-500">
              Add a relation so the app knows which row to read, e.g. this table&apos;s SalesOrderNumber must match{" "}
              <span className="font-mono">order.SalesOrder</span>.
            </p>
          )}
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_1fr_auto]">
                <Field label="From table">
                  <Select value={l.fromAlias} onChange={(ev) => onPatchLink(l.id, { fromAlias: ev.target.value, fromField: "" })}>
                    {sourceAliases.map((a) => (
                      <option key={a} value={a}>
                        {a === ROOT_ALIAS ? "order (production order)" : a}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="From field">
                  <Input
                    list={`src-${l.id}`}
                    value={l.fromField}
                    placeholder="SalesOrder"
                    onChange={(ev) => onPatchLink(l.id, { fromField: ev.target.value })}
                  />
                  <datalist id={`src-${l.id}`}>
                    {fieldsOfAlias(l.fromAlias).map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Match">
                  <Select
                    value={l.operator}
                    onChange={(ev) => onPatchLink(l.id, { operator: ev.target.value as DataLink["operator"] })}
                  >
                    <option value="eq">is equal to</option>
                    <option value="startswith">starts with</option>
                    <option value="contains">contains</option>
                  </Select>
                </Field>
                <Field label={`Field in ${entity.alias || "this table"}`}>
                  <Input
                    list={`dst-${l.id}`}
                    value={l.toField}
                    placeholder="SalesOrderNumber"
                    onChange={(ev) => onPatchLink(l.id, { toField: ev.target.value })}
                  />
                  <datalist id={`dst-${l.id}`}>
                    {(available.length ? available : entity.fields).map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </Field>
                <Button variant="ghost" size="sm" onClick={() => onRemoveLink(l.id)} className="mb-0.5 text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* fields */}
        <div className="rounded-lg border border-ink-200 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
              <Database className="h-4 w-4" /> Fields ({entity.fields.length} selected)
            </div>
            <div className="flex items-center gap-2">
              <Select value={company} onChange={(ev) => setCompany(ev.target.value)} className="h-8 w-40 text-xs">
                <option value="">Any company</option>
                {companies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </Select>
              <Button variant="outline" size="sm" onClick={loadFields} loading={loadingFields}>
                <RefreshCw className="h-3.5 w-3.5" /> Read fields
              </Button>
            </div>
          </div>

          {fieldError && <p className="mb-2 text-xs text-amber-700">{fieldError}</p>}

          {available.length > 0 && (
            <>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                <Input
                  value={filterText}
                  onChange={(ev) => setFilterText(ev.target.value)}
                  placeholder="Search fields"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <div className="max-h-56 overflow-auto rounded border border-ink-200 bg-white p-2">
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((f) => (
                    <Checkbox key={f} label={f} checked={entity.fields.includes(f)} onChange={() => toggleField(f)} />
                  ))}
                </div>
              </div>
            </>
          )}

          {entity.fields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {entity.fields.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleField(f)}
                  title="Remove this field"
                  className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-800 hover:bg-red-50 hover:text-red-700"
                >
                  {qualifiedName(entity.alias || "?", f)}
                </button>
              ))}
            </div>
          )}

          {available.length === 0 && (
            <p className="mt-2 text-xs text-ink-500">
              Read the fields from D365FO, or type the property names into the relation boxes above and add them here after
              reading.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function PreviewBox({ config, companies }: { config: DataSourcesConfig; companies: { code: string; name: string }[] }) {
  const [order, setOrder] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!order.trim()) {
      toast.error("Enter a production order to test with");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<PreviewResult & { ok: boolean; error?: string }>("/api/admin/d365-datasources/preview", {
        method: "POST",
        json: { productionOrder: order.trim(), company, config },
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const values = Object.entries(result?.related.values || {});

  return (
    <Card>
      <CardHeader title="Test with a production order" description="Reads the order and every table above, exactly as a new COC would." />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Production order" className="w-56">
            <Input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="P000123" />
          </Field>
          <Field label="Company" className="w-48">
            <Select value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">Any</option>
              {companies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} – {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" onClick={run} loading={busy} className="mb-0.5 gap-1.5">
            <Play className="h-3.5 w-3.5" /> Run test
          </Button>
          {busy && <Spinner className="mb-2" />}
        </div>

        {error && <Alert tone="danger" title="Test failed">{error}</Alert>}

        {result && (
          <>
            <div className="text-xs text-ink-500">
              Source: <span className="font-mono">{result.mode || "d365"}</span>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Table</Th>
                  <Th>Filter used</Th>
                  <Th>Rows</Th>
                </tr>
              </thead>
              <tbody>
                {result.related.steps.map((s) => (
                  <tr key={s.alias}>
                    <Td>
                      <span className="font-semibold text-ink-900">{s.alias}</span>
                      <span className="ml-1 text-xs text-ink-500">{s.entity}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] text-ink-700">{s.filter || "–"}</span>
                      {s.error && <div className="text-[11px] text-red-600">{s.error}</div>}
                    </Td>
                    <Td>
                      <Badge tone={s.rows ? "success" : "warning"}>{s.rows}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {values.length > 0 ? (
              <div className="grid gap-1 sm:grid-cols-2">
                {values.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 rounded border border-ink-200 bg-white px-2 py-1">
                    <span className="font-mono text-[11px] text-ink-600">{k}</span>
                    <span className="truncate text-xs font-semibold text-ink-900">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No values came back – check the relation fields above.</p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
