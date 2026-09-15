import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { updateUser } from "@/lib/db/repositories/users";
import { ROLES } from "@/lib/auth/roles";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("manageUsers");
  const body = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional() }).parse(await req.json());
  if (params.id === session.user.id && (body.role !== undefined && body.role !== "Admin" || body.active === false)) {
    throw Errors.conflict("You cannot remove your own Admin access.");
  }
  const user = await updateUser(params.id, body);
  await audit({ entityType: "user", entityId: params.id, action: "ROLE_CHANGED", user: session.user, details: body });
  return json({ user });
});
