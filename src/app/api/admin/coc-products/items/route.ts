import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

const quote = (v: string) => v.replace(/'/g, "''");

/** Look up released products in D365FO so an admin can pick item numbers instead of typing them. */
export const GET = route(async (req) => {
  await requireCapability("manageSettings");
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const company = (req.nextUrl.searchParams.get("company") || "").trim();
  if (q.length < 2) return json({ ok: false, items: [], error: "Type at least two characters" });

  const clauses = [
    `(contains(ItemNumber, '${quote(q)}') or contains(ProductName, '${quote(q)}') or contains(SearchName, '${quote(q)}'))`,
  ];
  if (company && company.toUpperCase() !== "ALL") clauses.push(`dataAreaId eq '${quote(company.toLowerCase())}'`);

  const res = await D365Service.queryEntity({
    entity: "ReleasedProductsV2",
    filter: clauses.join(" and "),
    select: ["ItemNumber", "ProductName", "dataAreaId"],
    top: 30,
  });

  const items = res.rows.map((r) => ({
    item: String(r.ItemNumber ?? "").trim(),
    label: String(r.ProductName ?? "").trim(),
    company: String(r.dataAreaId ?? "").toUpperCase(),
  })).filter((r) => r.item);

  return json({ ok: !res.error, mode: res.mode, items, error: res.error ?? null });
});
