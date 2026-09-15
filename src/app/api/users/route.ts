import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listUsers } from "@/lib/db/repositories/users";

export const GET = route(async () => {
  await requireCapability("manageUsers");
  return json({ users: await listUsers() });
});
