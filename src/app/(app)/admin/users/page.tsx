import { requireCapability } from "@/lib/auth/guards";
import { listUsers } from "@/lib/db/repositories/users";
import { listRoles } from "@/lib/db/repositories/roles";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const session = await requireCapability("manageUsers");
  const [users, initialRoles] = await Promise.all([listUsers(), listRoles()]);

  return <UsersClient users={users} initialRoles={initialRoles} selfId={session.user.id} />;
}
