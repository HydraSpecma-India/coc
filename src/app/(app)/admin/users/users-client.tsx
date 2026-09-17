"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  Table,
  Th,
  Td,
  Select,
  Checkbox,
  Badge,
  Alert,
  Button,
  Dialog,
  Input,
  Field,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { UserRow } from "@/lib/db/repositories/users";
import { UserPlus, KeyRound, Trash2, Search, UserCheck, UserX, Shield } from "lucide-react";

export function UsersClient({ users, selfId }: { users: UserRow[]; selfId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");
  const [companies, setCompanies] = useState<{ code: string; name: string }[]>([
    { code: "HSIN", name: "HydraSpecma India (India)" },
    { code: "HGCN", name: "HydraSpecma China (China)" },
    { code: "HSDK", name: "HydraSpecma Denmark (Denmark)" },
  ]);

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((res) => {
        if (res.ok && res.companies && res.companies.length > 0) {
          setCompanies(res.companies);
        }
      })
      .catch(() => {});
  }, []);

  // Create User Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    displayName: string;
    email: string;
    role: Role;
    password: string;
    active: boolean;
    allowedCompany: string;
  }>({
    displayName: "",
    email: "",
    role: "Production",
    password: "User@123",
    active: true,
    allowedCompany: "ALL",
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Reset Password Modal state
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Delete User Confirmation Modal state
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Patch role, active state, or company access
  const patchUser = async (
    id: string,
    body: { role?: string; active?: boolean; displayName?: string; allowed_companies?: string[] }
  ) => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", json: body });
      toast.success("User updated successfully");
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      toast.error("Update failed", (e as Error).message);
    }
  };

  // Create user handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email.trim()) {
      toast.error("Email required", "Please enter a valid work email.");
      return;
    }
    setCreateLoading(true);
    try {
      await api("/api/users", {
        method: "POST",
        json: {
          email: createForm.email.trim(),
          displayName: createForm.displayName.trim() || undefined,
          role: createForm.role,
          password: createForm.password.trim() || undefined,
          active: createForm.active,
          allowed_companies: [createForm.allowedCompany],
        },
      });
      toast.success("User created", `${createForm.email} has been added.`);
      setCreateOpen(false);
      setCreateForm({
        displayName: "",
        email: "",
        role: "Production",
        password: "User@123",
        active: true,
        allowedCompany: "ALL",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      toast.error("Failed to create user", (e as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  // Reset password handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPassword.length < 4) {
      toast.error("Password too short", "Password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match", "Please make sure both passwords match.");
      return;
    }
    setResetLoading(true);
    try {
      await api(`/api/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        json: { password: newPassword },
      });
      toast.success("Password reset", `New password set for ${resetTarget.email}.`);
      setResetTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error("Reset failed", (e as Error).message);
    } finally {
      setResetLoading(false);
    }
  };

  // Delete user handler
  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("User deleted", `${deleteTarget.email} was removed.`);
      setDeleteTarget(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      toast.error("Delete failed", (e as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    return (
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="User & Access Management"
        description="Manage user accounts, assign authorization roles, reset login passwords, and configure access permissions."
        actions={
          <Button
            variant="primary"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add User</span>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-ink-500">Total Users</div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{users.length}</div>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-ink-500">Active Accounts</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">
            {users.filter((u) => u.active).length}
          </div>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-ink-500">Administrators</div>
          <div className="mt-1 text-2xl font-bold text-brand-600">
            {users.filter((u) => u.role === "Admin").length}
          </div>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-ink-500">Quality & Production</div>
          <div className="mt-1 text-2xl font-bold text-sky-600">
            {users.filter((u) => u.role === "Quality" || u.role === "Production").length}
          </div>
        </div>
      </div>

      <Alert tone="info">
        <div className="space-y-1 text-xs leading-relaxed">
          <p className="font-semibold text-sky-900">Role Capability Matrix:</p>
          <p>
            <strong className="text-ink-900">Admin:</strong> Complete system control, ERP/SSO setup, user management, and template configuration. ·{" "}
            <strong className="text-ink-900">Production:</strong> Create, edit, and print Certificates of Conformity. ·{" "}
            <strong className="text-ink-900">Quality:</strong> Review, complete, and certify COCs. ·{" "}
            <strong className="text-ink-900">Viewer:</strong> Read-only access to completed COCs and audit logs.
          </p>
        </div>
      </Alert>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 w-full rounded-md border border-ink-300 bg-white pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
      </div>

      {/* Users Table */}
      <Table>
        <thead>
          <tr>
            <Th>User</Th>
            <Th>Email Address</Th>
            <Th>Assigned Role</Th>
            <Th>Company Access</Th>
            <Th>Status</Th>
            <Th>Last Sign-in</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-ink-400 border-b border-ink-100">
                No user accounts found matching &quot;{searchTerm}&quot;
              </td>
            </tr>
          ) : (
            filteredUsers.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <tr key={u.id} className="hover:bg-ink-50/50 transition-colors">
                  <Td className="font-medium text-ink-900">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700">
                        {(u.display_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span>{u.display_name || "—"}</span>
                          {isSelf && <Badge tone="brand">You</Badge>}
                        </div>
                      </div>
                    </div>
                  </Td>

                  <Td className="text-ink-600 font-mono text-xs">{u.email}</Td>

                  <Td>
                    <Select
                      value={u.role}
                      disabled={isSelf && u.role === "Admin"}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                      className="w-36 h-8 text-xs font-medium"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </Td>

                  <Td>
                    <Select
                      value={u.allowed_companies?.[0] || "ALL"}
                      onChange={(e) => patchUser(u.id, { allowed_companies: [e.target.value] })}
                      className="w-36 h-8 text-xs font-medium"
                    >
                      <option value="ALL">All Companies</option>
                      {companies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.name.split("(")[0].trim() || c.code})
                        </option>
                      ))}
                    </Select>
                  </Td>

                  <Td>
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => patchUser(u.id, { active: !u.active })}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors ${
                        u.active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-ink-100 text-ink-500 border border-ink-200 hover:bg-ink-200"
                      } ${isSelf ? "cursor-not-allowed opacity-80" : ""}`}
                      title={isSelf ? "You cannot deactivate your own account" : "Click to toggle active status"}
                    >
                      {u.active ? (
                        <>
                          <UserCheck className="h-3 w-3" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <UserX className="h-3 w-3" />
                          <span>Disabled</span>
                        </>
                      )}
                    </button>
                  </Td>

                  <Td className="text-ink-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </Td>

                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetTarget(u);
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        className="flex items-center gap-1 text-xs text-ink-700 hover:text-ink-900"
                        title="Reset user password"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-ink-500" />
                        <span>Reset Password</span>
                      </Button>

                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(u)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                          title="Delete user account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      {/* Add User Modal */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add New User"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createLoading}
              onClick={(e) => handleCreateUser(e as never)}
            >
              Create User
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Field label="Full Name">
            <Input
              placeholder="e.g. John Doe"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
            />
          </Field>

          <Field label="Work Email Address *">
            <Input
              type="email"
              required
              placeholder="name@hydraspecma.com"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            />
          </Field>

          <Field label="System Role *">
            <Select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Company Access">
            <Select
              value={createForm.allowedCompany}
              onChange={(e) => setCreateForm({ ...createForm, allowedCompany: e.target.value })}
            >
              <option value="ALL">All Companies (Global Access)</option>
              {companies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Initial Password" hint="Minimum 4 characters">
            <Input
              type="text"
              placeholder="e.g. Welcome@123"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
          </Field>

          <div className="pt-2">
            <Checkbox
              label="Account is Active (allows sign-in immediately)"
              checked={createForm.active}
              onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })}
            />
          </div>
        </form>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password: ${resetTarget?.display_name || resetTarget?.email || "User"}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={resetLoading}
              onClick={(e) => handleResetPassword(e as never)}
            >
              Update Password
            </Button>
          </>
        }
      >
        {resetTarget && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="rounded-md bg-ink-50 p-3 text-xs text-ink-600">
              Setting a new login password for{" "}
              <strong className="text-ink-900">{resetTarget.email}</strong>. The user can immediately sign in with this password.
            </div>

            <Field label="New Password *">
              <Input
                type="password"
                required
                minLength={4}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>

            <Field label="Confirm New Password *">
              <Input
                type="password"
                required
                minLength={4}
                placeholder="Re-type new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
          </form>
        )}
      </Dialog>

      {/* Delete User Confirmation Modal */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete User Account"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteLoading}
              onClick={handleDeleteUser}
            >
              Delete User
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm text-ink-700">
            <p>
              Are you sure you want to permanently delete the account for{" "}
              <strong className="text-ink-900">{deleteTarget.email}</strong>?
            </p>
            <p className="text-xs text-ink-500">
              This action cannot be undone. All audit history associated with this user ID will be retained.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
