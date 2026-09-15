import { route } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { downloadAsset, getAsset } from "@/lib/db/repositories/assets";
import { Errors } from "@/lib/errors";

/** Streams a private asset to any signed-in user (backgrounds are needed by the designer & PDF viewer). */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireSession();
  const asset = await getAsset(params.id);
  if (!asset) throw Errors.notFound("Asset");
  const bytes = await downloadAsset(asset);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${asset.file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
