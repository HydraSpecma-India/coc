"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { LANGUAGES, type Lang } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

/** English · 中文 · Svenska · Dansk */
export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  const router = useRouter();
  return (
    <label className={cn("inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-1.5 text-ink-700", className)} title={t("lang.label")}>
      <Languages className="h-3.5 w-3.5 shrink-0 text-ink-500" />
      <select
        aria-label={t("lang.label")}
        value={lang}
        onChange={(e) => {
          setLang(e.target.value as Lang);
          router.refresh(); // server-rendered page titles pick up the new language
        }}
        className={cn("h-7 cursor-pointer bg-transparent text-xs font-medium outline-none", compact ? "w-12" : "pr-1")}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {compact ? l.short : l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
