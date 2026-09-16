import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { getOrInitProductSequence } from "@/lib/sequences/repository";

export const GET = route(async (req) => {
  await requireSession();
  const itemNumber = req.nextUrl.searchParams.get("itemNumber") || "";
  const productName = req.nextUrl.searchParams.get("productName") || "";

  if (!itemNumber.trim()) {
    return json({ ok: false, error: "itemNumber is required" }, { status: 400 });
  }

  const result = await getOrInitProductSequence(itemNumber.trim(), productName.trim() || undefined);

  return json({
    ok: true,
    rule: result.rule,
    nextSerial: result.nextSerial,
    isNew: result.isNew,
  });
});
