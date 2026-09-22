import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/provider";
import { LANG_COOKIE, parseLangCookie } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: { default: "COC Platform", template: "%s · COC Platform" },
  description: "Certificate of Conformity automation and document template designer",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = parseLangCookie((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang === "zh" ? "zh-CN" : lang} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
