import { requireCapability } from "@/lib/auth/guards";
import { listUsers } from "@/lib/db/repositories/users";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await requireCapability("manageUsers");
  const users = await listUsers();
  return <UsersClient users={users} selfId={session.user.id} />;
}
