import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { getCocDocumentById } from "@/lib/db/repositories/coc";

export const GET = route(async (_req, { params }) => {
  await requireSession();
  const { id } = await params;
  const result = await getCocDocumentById(id);
  if (!result) {
    return json({ ok: false, error: "COC document not found" }, { status: 404 });
  }
  return json({ ok: true, ...result });
});
