import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { getOrInitProductSequence } from "@/lib/sequences/repository";

export const GET = route(async (req) => {
  await requireSession();
  const itemNumber = req.nextUrl.searchParams.get("itemNumber") || "";
  const itemDescription = req.nextUrl.searchParams.get("itemDescription") || "";
  const company = req.nextUrl.searchParams.get("company") || "";

  if (!itemNumber.trim()) {
    return json({ ok: false, error: "itemNumber is required" }, { status: 400 });
  }

  const { rule, nextSerial, nextNumber, isNew } = await getOrInitProductSequence(itemNumber, itemDescription, company);

  return json({
    ok: true,
    rule: {
      itemNumber: rule.itemNumber,
      mode: rule.mode,
      pattern: rule.pattern,
      nextNumber,
      padding: rule.padding,
    },
    samplePreview: nextSerial,
    company: company.trim().toUpperCase() || null,
    source: isNew ? "default_auto" : "db_configured",
  });
});
