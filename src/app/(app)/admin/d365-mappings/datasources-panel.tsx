"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Link2, Database, Play, RefreshCw, Loader2, Check } from "lucide-react";
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

type FieldState = { fields: string[]; loading: boolean; error: string | null };

const emptyEntity = (n: number): DataEntity => ({
  id: newId("tbl"),
  alias: `t${n}`,
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
  const [tables, setTables] = useState<string[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [loadingTables, setLoadingTables] = useState(true);
  /** D365FO table name → its properties (keyed by table, so renaming a short name reads nothing again) */
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({});
  const loaded = useRef<Set<string>>(new Set());

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((r) => setCompanies(r.companies || []))
      .catch(() => undefined);
    api<{ ok: boolean; entities: string[]; error: string | null }>("/api/admin/d365-datasources/entities")
      .then((r) => {
        setTables(r.entities || []);
        if (r.error) setTablesError(r.error);
      })
      .catch((e) => setTablesError((e as Error).message))
      .finally(() => setLoadingTables(false));
  }, []);

  const loadFields = useCallback(async (entity: string, force = false) => {
    const name = entity.trim();
    if (!name) return;
    if (!force && loaded.current.has(name)) return;
    loaded.current.add(name);
    setFieldState((s) => ({ ...s, [name]: { fields: s[name]?.fields || [], loading: true, error: null } }));
    try {
      const res = await api<{ ok: boolean; fields: string[]; error: string | null }>(
        `/api/admin/d365-datasources/fields?entity=${encodeURIComponent(name)}`,
      );
      setFieldState((s) => ({
        ...s,
        [name]: {
          fields: res.fields || [],
          loading: false,
          error: res.error || (res.fields?.length ? null : "The table returned no rows, so its fields are unknown."),
        },
      }));
    } catch (e) {
      setFieldState((s) => ({ ...s, [name]: { fields: [], loading: false, error: (e as Error).message } }));
    }
  }, []);

  // read the fields of every chosen table once, so the relation pickers are filled in
  const chosenTables = cfg.entities.map((e) => e.entity.trim()).filter(Boolean).join("|");
  useEffect(() => {
    for (const name of chosenTables.split("|").filter(Boolean)) loadFields(name);
  }, [chosenTables, loadFields]);

  const problem = validateDataSources(cfg);

  const patchEntity = (id: string, patch: Partial<DataEntity>) =>
    setCfg((c) => ({
      ...c,
      entities: c.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      // an alias rename must follow into the relations
      links:
        patch.alias === undefined
          ? c.links
          : c.links.map((l) => {
              const old = c.entities.find((e) => e.id === id)?.alias;
              if (!old) return l;
              return {
                ...l,
                fromAlias: l.fromAlias === old ? patch.alias! : l.fromAlias,
                toAlias: l.toAlias === old ? patch.alias! : l.toAlias,
              };
            }),
    }));

  const removeEntity = (e: DataEntity) =>
    setCfg((c) => ({
      ...c,
      entities: c.entities.filter((x) => x.id !== e.id),
      links: c.links.filter((l) => l.toAlias !== e.alias && l.fromAlias !== e.alias),
    }));

  const addEntity = () =>
    setCfg((c) => ({ ...c, entities: [...c.entities, emptyEntity(c.entities.length + 1)] }));

  const addLink = (toAlias: string) =>
    setCfg((c) => ({
      ...c,
      links: [...c.links, { id: newId("rel"), fromAlias: ROOT_ALIAS, fromField: "", toAlias, toField: "", operator: "eq" }],
    }));

  const patchLink = (id: string, patch: Partial<DataLink>) =>
    setCfg((c) => ({ ...c, links: c.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const removeLink = (id: string) => setCfg((c) => ({ ...c, links: c.links.filter((l) => l.id !== id) }));

  /** the fields an alias offers – the production order has a fixed list, added tables are read from D365 */
  const fieldsOf = useCallback(
    (alias: string): string[] => {
      if (alias === ROOT_ALIAS) return [...ROOT_FIELDS];
      const table = cfg.entities.find((e) => e.alias === alias)?.entity.trim();
      return table ? fieldState[table]?.fields || [] : [];
    },
    [cfg.entities, fieldState],
  );

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

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Tables & relations"
        description="Pick a table, pick the fields, and say which field matches which. No names to type."
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
            The production order is always the first table (<span className="font-mono font-semibold text-ink-900">order</span>).
            Add a table, choose the fields you need, and relate it to the production order or to another table you added.
            Every chosen field becomes <span className="font-mono text-ink-800">shortname.FieldName</span> and can be placed in
            the template designer like any other D365FO field.
          </p>
          <Checkbox
            label="Read these tables when a COC is created"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
        </CardBody>
      </Card>

      {tablesError && (
        <Alert tone="warning" title="The table list could not be read">
          {tablesError} You can still type the table name exactly as it is in Dynamics 365.
        </Alert>
      )}
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
          tables={tables}
          loadingTables={loadingTables}
          links={cfg.links.filter((l) => l.toAlias === e.alias)}
          sourceAliases={[ROOT_ALIAS, ...cfg.entities.map((x) => x.alias).filter((a) => a && a !== e.alias)]}
          fieldsOf={fieldsOf}
          state={fieldState[e.entity.trim()]}
          onReloadFields={() => loadFields(e.entity, true)}
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

/** Table picker: type to narrow, click to choose – the exact D365 spelling is always used. */
function TablePicker({
  value, tables, loading, onChange,
}: {
  value: string;
  tables: string[];
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables.slice(0, 50);
    const starts: string[] = [];
    const has: string[] = [];
    for (const t of tables) {
      const lower = t.toLowerCase();
      if (lower.startsWith(q)) starts.push(t);
      else if (lower.includes(q)) has.push(t);
      if (starts.length >= 50) break;
    }
    return [...starts, ...has].slice(0, 50);
  }, [query, tables]);

  return (
    <div className="relative">
      <Input
        value={open ? query : value}
        placeholder={loading ? "Loading tables…" : "Search a D365FO table"}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!tables.length) onChange(e.target.value); // no list available – keep what is typed
        }}
      />
      {open && tables.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink-200 bg-white shadow-lg">
          {matches.length === 0 && <div className="px-3 py-2 text-xs text-ink-500">No table matches.</div>}
          {matches.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-brand-50 ${
                t === value ? "font-semibold text-brand-800" : "text-ink-700"
              }`}
            >
              <span className="font-mono">{t}</span>
              {t === value && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A field dropdown that still shows a value the table no longer offers. */
function FieldSelect({
  value, options, placeholder, onChange, disabled,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{disabled ? "Choose a table first" : placeholder}</option>
      {list.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </Select>
  );
}

function EntityCard({
  entity, tables, loadingTables, links, sourceAliases, fieldsOf, state,
  onReloadFields, onPatch, onRemove, onAddLink, onPatchLink, onRemoveLink,
}: {
  entity: DataEntity;
  tables: string[];
  loadingTables: boolean;
  links: DataLink[];
  sourceAliases: string[];
  fieldsOf: (alias: string) => string[];
  state?: FieldState;
  onReloadFields: () => void;
  onPatch: (patch: Partial<DataEntity>) => void;
  onRemove: () => void;
  onAddLink: () => void;
  onPatchLink: (id: string, patch: Partial<DataLink>) => void;
  onRemoveLink: (id: string) => void;
}) {
  const [filterText, setFilterText] = useState("");
  const available = state?.fields || [];
  const shown = available.filter((f) => !filterText.trim() || f.toLowerCase().includes(filterText.trim().toLowerCase()));

  const toggleField = (name: string) =>
    onPatch({ fields: entity.fields.includes(name) ? entity.fields.filter((f) => f !== name) : [...entity.fields, name] });

  return (
    <Card>
      <CardHeader
        title={entity.entity ? `${entity.alias} · ${entity.entity}` : "New table"}
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
          <Field label="D365FO table" hint="pick from Dynamics 365">
            <TablePicker
              value={entity.entity}
              tables={tables}
              loading={loadingTables}
              onChange={(v) => onPatch({ entity: v })}
            />
          </Field>
          <Field label="Short name" hint="used in the field name">
            <Input
              value={entity.alias}
              placeholder="so"
              onChange={(ev) => onPatch({ alias: ev.target.value.replace(/[^A-Za-z0-9_]/g, "") })}
            />
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

        {/* relations – both sides are chosen from the tables' own fields */}
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
              Add a relation so the app knows which row to read – for example the production order&apos;s ItemNumber matches
              this table&apos;s item number field.
            </p>
          )}
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="grid items-end gap-2 lg:grid-cols-[1fr_1fr_auto_1fr_auto]">
                <Field label="From table">
                  <Select value={l.fromAlias} onChange={(ev) => onPatchLink(l.id, { fromAlias: ev.target.value, fromField: "" })}>
                    {sourceAliases.map((a) => (
                      <option key={a} value={a}>
                        {a === ROOT_ALIAS ? "order (production order)" : a}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Its field">
                  <FieldSelect
                    value={l.fromField}
                    options={fieldsOf(l.fromAlias)}
                    placeholder="Choose a field"
                    onChange={(v) => onPatchLink(l.id, { fromField: v })}
                  />
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
                  <FieldSelect
                    value={l.toField}
                    options={available}
                    placeholder="Choose a field"
                    disabled={!entity.entity}
                    onChange={(v) => onPatchLink(l.id, { toField: v })}
                  />
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
              {state?.loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
            </div>
            <div className="flex items-center gap-2">
              {available.length > 0 && (
                <Input
                  value={filterText}
                  onChange={(ev) => setFilterText(ev.target.value)}
                  placeholder="Search fields"
                  className="h-8 w-44 text-xs"
                />
              )}
              <Button variant="outline" size="sm" onClick={onReloadFields} disabled={!entity.entity || state?.loading}>
                <RefreshCw className="h-3.5 w-3.5" /> Reload
              </Button>
            </div>
          </div>

          {state?.error && <p className="mb-2 break-all text-xs text-amber-700">{state.error}</p>}

          {available.length > 0 ? (
            <div className="max-h-56 overflow-auto rounded border border-ink-200 bg-white p-2">
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((f) => (
                  <Checkbox key={f} label={f} checked={entity.fields.includes(f)} onChange={() => toggleField(f)} />
                ))}
              </div>
            </div>
          ) : (
            !state?.loading && (
              <p className="text-xs text-ink-500">
                {entity.entity ? "No fields to show yet." : "Pick a table above and its fields appear here."}
              </p>
            )
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
            <Input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="HSIN-008598" />
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
                      {s.error && <div className="break-all text-[11px] text-red-600">{s.error}</div>}
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
