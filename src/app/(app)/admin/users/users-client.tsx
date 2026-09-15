"use client";

import { useRouter } from "next/navigation";
import { PageHeader, Table, Th, Td, Select, Checkbox, Badge, Alert } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { ROLES } from "@/lib/auth/roles";
import type { UserRow } from "@/lib/db/repositories/users";

export function UsersClient({ users, selfId }: { users: UserRow[]; selfId: string }) {
  const router = useRouter();
  const patch = async (id: string, body: { role?: string; active?: boolean }) => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", json: body });
      toast.success("User updated");
      router.refresh();
    } catch (e) {
      toast.error("Update failed", (e as Error).message);
    }
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users" description="Users are created automatically on first sign-in. Roles set here apply unless the user carries an Entra app role (Admin, Quality, Production, Viewer), which always wins." />
      <div className="mb-4"><Alert tone="info">Admin: full access · Production: create COCs · Quality: review/complete COCs · Viewer: read-only.</Alert></div>
      <Table>
        <thead><tr><Th>User</Th><Th>Email</Th><Th>Role</Th><Th>Active</Th><Th>Last sign-in</Th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.display_name ?? "—"} {u.id === selfId && <Badge className="ml-1">you</Badge>}</Td>
              <Td className="text-ink-600">{u.email}</Td>
              <Td><Select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} className="w-36">{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Td>
              <Td><Checkbox checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} /></Td>
              <Td className="text-ink-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
