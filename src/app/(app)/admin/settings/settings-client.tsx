"use client";

import { useState } from "react";
import { PageHeader, Card, CardHeader, CardBody, Badge, Button, Input } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { SettingRow } from "@/lib/db/repositories/settings";

interface Integrations {
  entra: boolean; supabase: boolean; automation: boolean;
  d365: { mode: string; configured: boolean };
  sharepoint: { mode: string; configured: boolean };
}

const Status = ({ ok, label }: { ok: boolean; label: string }) => <Badge tone={ok ? "success" : "warning"}>{label}: {ok ? "configured" : "not configured"}</Badge>;

export function SettingsClient({ settings, integrations }: { settings: SettingRow[]; integrations: Integrations }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(settings.map((s) => [s.key, JSON.stringify(s.value)])));
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: string) => {
    setBusy(key);
    try {
      const value = JSON.parse(values[key]);
      await api("/api/settings", { method: "PUT", json: { key, value } });
      toast.success(`${key} saved`);
    } catch (e) {
      toast.error("Could not save", (e as Error).message.includes("JSON") ? "Value must be valid JSON (strings in quotes)." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="System Settings" description="Application-level configuration. Secrets are never stored here – they live in Vercel environment variables." />
      <Card className="mb-6">
        <CardHeader title="Integrations (from environment)" />
        <CardBody className="flex flex-wrap gap-2">
          <Status ok={integrations.entra} label="Entra ID sign-in" />
          <Status ok={integrations.supabase} label="Supabase" />
          <Badge tone={integrations.d365.mode === "live" ? (integrations.d365.configured ? "success" : "danger") : "warning"}>D365FO: {integrations.d365.mode}{integrations.d365.mode === "live" && !integrations.d365.configured ? " (missing variables)" : ""}</Badge>
          <Badge tone={integrations.sharepoint.mode === "live" ? (integrations.sharepoint.configured ? "success" : "danger") : "warning"}>SharePoint: {integrations.sharepoint.mode}{integrations.sharepoint.mode === "live" && !integrations.sharepoint.configured ? " (missing variables)" : ""}</Badge>
          <Status ok={integrations.automation} label="Automation API key" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Application settings" description="Values are JSON: strings need quotes, booleans are true/false." />
        <CardBody className="grid gap-4">
          {settings.map((s) => (
            <div key={s.key} className="grid gap-1 md:grid-cols-[260px_1fr_auto] md:items-center">
              <div>
                <div className="font-mono text-xs font-semibold text-ink-800">{s.key}</div>
                <div className="text-[11px] text-ink-500">{s.description}</div>
              </div>
              <Input value={values[s.key] ?? ""} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} className="font-mono text-xs" />
              <Button variant="outline" size="sm" loading={busy === s.key} onClick={() => save(s.key)}>Save</Button>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
