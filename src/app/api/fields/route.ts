import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listFieldDefinitions } from "@/lib/db/repositories/fields";

/** Phase 1: read-only list for the designer palette. CRUD arrives in Phase 2. */
export const GET = route(async (req) => {
  await requireCapability("viewTemplates");
  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  return json({ fields: await listFieldDefinitions({ includeInactive }) });
});
