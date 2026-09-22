/** Shared (client-safe) role, capability, and D365FO-style security definitions. */
export const SYSTEM_ROLES = ["Admin", "Quality", "Production", "Viewer"] as const;
export const ROLES = SYSTEM_ROLES;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type Role = string;

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && x.trim().length > 0;
}

export type PermissionAction = "read" | "create" | "update" | "delete";

export interface PageResourceDefinition {
  id: string;
  name: string;
  category: "Documents & Operations" | "Templates & Configuration" | "Administration & Security";
  route: string;
  description: string;
  supportedActions: PermissionAction[];
  actionLabels?: Partial<Record<PermissionAction, string>>;
}

export const PAGE_RESOURCES: PageResourceDefinition[] = [
  // 1. Documents & Operations
  {
    id: "dashboard",
    name: "Dashboard",
    category: "Documents & Operations",
    route: "/",
    description: "Access executive KPI metrics, recent activity feed, and operational statistics.",
    supportedActions: ["read"],
    actionLabels: {
      read: "View dashboard KPIs & charts",
    },
  },
  {
    id: "coc",
    name: "Certificates of Conformity (COC)",
    category: "Documents & Operations",
    route: "/coc/new & /coc/history",
    description: "Create new certificates, inspect order details, digitally sign, approve, and download PDFs.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View COC history & search orders",
      create: "Create & generate new COC",
      update: "Complete, sign & approve COC",
      delete: "Archive / void certificate",
    },
  },

  // 2. Templates & Configuration
  {
    id: "templates",
    name: "Certificate Templates",
    category: "Templates & Configuration",
    route: "/admin/templates",
    description: "Inspect templates, upload background PDFs, visual drag-and-drop designer, and version publishing.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View template list & preview",
      create: "Create / duplicate template",
      update: "Edit & visual canvas designer",
      delete: "Delete template or versions",
    },
  },
  {
    id: "fields",
    name: "Field Definitions",
    category: "Templates & Configuration",
    route: "/admin/fields",
    description: "Configure dynamic data fields, validation constraints, and display formats.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View field definitions",
      create: "Create new custom field",
      update: "Edit field metadata & rules",
      delete: "Delete custom field",
    },
  },
  {
    id: "d365_mappings",
    name: "D365FO Field Mapping",
    category: "Templates & Configuration",
    route: "/admin/d365-mappings",
    description: "Map COC fields to Dynamics 365 F&O OData entities (Production Orders & Sales Lines).",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View D365FO entity mappings",
      create: "Add new entity property mapping",
      update: "Edit mapping expressions & paths",
      delete: "Delete mapping configuration",
    },
  },

  // 3. Administration & Security
  {
    id: "users",
    name: "Users Directory",
    category: "Administration & Security",
    route: "/admin/users",
    description: "User directory, account provisioning, password resets, and company access.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View user accounts directory",
      create: "Create & invite user accounts",
      update: "Edit profiles & reset passwords",
      delete: "Delete / deactivate user",
    },
  },
  {
    id: "roles",
    name: "Security Roles & Permissions",
    category: "Administration & Security",
    route: "/admin/users#roles",
    description: "Define custom D365FO security roles with granular CRUD privileges across pages & menus.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View security roles matrix",
      create: "Create new custom role",
      update: "Edit role CRUD permissions",
      delete: "Delete custom role",
    },
  },
  {
    id: "signatures",
    name: "Digital Signatures",
    category: "Administration & Security",
    route: "/admin/signatures",
    description: "Authorized digital signatures, inspector drawing pad, and security PINs.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View inspector signatures",
      create: "Upload / draw new signature",
      update: "Update PIN & active status",
      delete: "Delete signature stamp",
    },
  },
  {
    id: "audit",
    name: "Audit Logs & Compliance",
    category: "Administration & Security",
    route: "/admin/audit",
    description: "Immutable compliance audit trails tracking user operations, certificate issuances, and logins.",
    supportedActions: ["read", "create"],
    actionLabels: {
      read: "View & search audit logs",
      create: "Export audit trails to CSV",
    },
  },
  {
    id: "sharepoint",
    name: "SharePoint Configuration",
    category: "Administration & Security",
    route: "/admin/sharepoint",
    description: "SharePoint Online integration, Graph API credentials, and folder path bindings.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View SharePoint sync status",
      create: "Connect document library",
      update: "Edit site ID & folder binding",
      delete: "Disconnect SharePoint site",
    },
  },
  {
    id: "settings",
    name: "System Settings & Integrations",
    category: "Administration & Security",
    route: "/admin/settings",
    description: "System parameters, number sequences, Teams webhooks, and cloud architecture blueprint.",
    supportedActions: ["read", "create", "update", "delete"],
    actionLabels: {
      read: "View system settings & topology",
      create: "Create number sequence / rule",
      update: "Edit ERP, SSO & webhook keys",
      delete: "Delete sequence or custom setting",
    },
  },
];

export const CAPABILITY_DEFINITIONS = [
  {
    key: "viewDashboard",
    label: "View Dashboard",
    description: "Access the overview dashboard and KPI metrics.",
    category: "Documents & Operations",
  },
  {
    key: "createCoc",
    label: "Create COC",
    description: "Generate and issue new Certificates of Conformity.",
    category: "Documents & Operations",
  },
  {
    key: "completeCoc",
    label: "Complete COC",
    description: "Finalize and approve Certificate documents.",
    category: "Documents & Operations",
  },
  {
    key: "viewCoc",
    label: "View COC & History",
    description: "View issued certificates, certificate history, and download PDFs.",
    category: "Documents & Operations",
  },
  {
    key: "viewTemplates",
    label: "View Templates",
    description: "Inspect certificate templates.",
    category: "Templates & Configuration",
  },
  {
    key: "manageTemplates",
    label: "Manage Templates",
    description: "Create, edit, duplicate, and design templates in Visual Designer.",
    category: "Templates & Configuration",
  },
  {
    key: "manageFields",
    label: "Manage Field Definitions",
    description: "Configure data field definitions and D365 ERP entity mappings.",
    category: "Templates & Configuration",
  },
  {
    key: "manageSettings",
    label: "System Settings",
    description: "Configure system integrations, SharePoint storage, and Teams channels.",
    category: "Administration & Security",
  },
  {
    key: "manageUsers",
    label: "Users & Roles",
    description: "Create users, assign roles, and define custom roles and permissions.",
    category: "Administration & Security",
  },
  {
    key: "manageSignatures",
    label: "Digital Signatures",
    description: "Manage authorized digital signatures and inspector credentials.",
    category: "Administration & Security",
  },
  {
    key: "viewAudit",
    label: "View Audit Logs",
    description: "Inspect compliance and operational audit trails.",
    category: "Administration & Security",
  },
] as const;

export type Capability = (typeof CAPABILITY_DEFINITIONS)[number]["key"];

// Granular permissions map for built-in roles
const ALL_GRANULAR_PERMISSIONS = PAGE_RESOURCES.flatMap((res) =>
  res.supportedActions.map((act) => `${res.id}:${act}`)
);

export const DEFAULT_ROLE_CAPABILITIES: Record<string, string[]> = {
  Admin: [
    "viewDashboard",
    "createCoc",
    "completeCoc",
    "viewCoc",
    "viewTemplates",
    "manageTemplates",
    "manageFields",
    "manageSettings",
    "manageUsers",
    "manageSignatures",
    "viewAudit",
    ...ALL_GRANULAR_PERMISSIONS,
  ],
  Quality: [
    "viewDashboard",
    "createCoc",
    "completeCoc",
    "viewCoc",
    "viewTemplates",
    "manageSignatures",
    "dashboard:read",
    "coc:read",
    "coc:create",
    "coc:update",
    "templates:read",
    "signatures:read",
    "signatures:create",
    "signatures:update",
  ],
  Production: [
    "viewDashboard",
    "createCoc",
    "viewCoc",
    "viewTemplates",
    "manageSignatures",
    "dashboard:read",
    "coc:read",
    "coc:create",
    "templates:read",
    "signatures:read",
    "signatures:create",
  ],
  Viewer: [
    "viewDashboard",
    "viewCoc",
    "viewTemplates",
    "dashboard:read",
    "coc:read",
    "templates:read",
  ],
};

/** Capability matrix fallback – maps built-in roles to permissions. */
export const CAN = {
  manageTemplates: ["Admin"],
  manageFields: ["Admin"],
  manageSettings: ["Admin"],
  manageUsers: ["Admin"],
  viewAudit: ["Admin"],
  createCoc: ["Admin", "Production", "Quality"],
  completeCoc: ["Admin", "Quality"],
  viewCoc: ["Admin", "Quality", "Production", "Viewer"],
  viewTemplates: ["Admin", "Quality", "Production", "Viewer"],
  viewDashboard: ["Admin", "Quality", "Production", "Viewer"],
  manageSignatures: ["Admin", "Quality", "Production"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Normalizes an array of permission strings to ensure both granular tokens
 * (e.g. `templates:read`) and legacy capability tokens (e.g. `viewTemplates`)
 * are bidirectionally populated.
 */
export function normalizePermissions(permissions: readonly string[]): string[] {
  const set = new Set<string>(permissions);

  // Granular -> Legacy
  if (set.has("dashboard:read")) set.add("viewDashboard");
  if (set.has("coc:read")) set.add("viewCoc");
  if (set.has("coc:create")) set.add("createCoc");
  if (set.has("coc:update")) set.add("completeCoc");
  if (set.has("templates:read")) set.add("viewTemplates");
  if (set.has("templates:create") || set.has("templates:update") || set.has("templates:delete")) {
    set.add("manageTemplates");
  }
  if (
    set.has("fields:create") ||
    set.has("fields:update") ||
    set.has("fields:delete") ||
    set.has("d365_mappings:create") ||
    set.has("d365_mappings:update") ||
    set.has("d365_mappings:delete")
  ) {
    set.add("manageFields");
  }
  if (
    set.has("users:create") ||
    set.has("users:update") ||
    set.has("users:delete") ||
    set.has("roles:create") ||
    set.has("roles:update") ||
    set.has("roles:delete")
  ) {
    set.add("manageUsers");
  }
  if (set.has("signatures:create") || set.has("signatures:update") || set.has("signatures:delete")) {
    set.add("manageSignatures");
  }
  if (
    set.has("settings:create") ||
    set.has("settings:update") ||
    set.has("settings:delete") ||
    set.has("sharepoint:create") ||
    set.has("sharepoint:update") ||
    set.has("sharepoint:delete")
  ) {
    set.add("manageSettings");
  }
  if (set.has("audit:read")) set.add("viewAudit");

  // Legacy -> Granular
  if (set.has("viewDashboard")) set.add("dashboard:read");
  if (set.has("createCoc")) {
    set.add("coc:read");
    set.add("coc:create");
  }
  if (set.has("completeCoc")) {
    set.add("coc:read");
    set.add("coc:update");
  }
  if (set.has("viewCoc")) set.add("coc:read");
  if (set.has("viewTemplates")) set.add("templates:read");
  if (set.has("manageTemplates")) {
    set.add("templates:read");
    set.add("templates:create");
    set.add("templates:update");
    set.add("templates:delete");
  }
  if (set.has("manageFields")) {
    set.add("fields:read");
    set.add("fields:create");
    set.add("fields:update");
    set.add("fields:delete");
    set.add("d365_mappings:read");
    set.add("d365_mappings:create");
    set.add("d365_mappings:update");
    set.add("d365_mappings:delete");
  }
  if (set.has("manageUsers")) {
    set.add("users:read");
    set.add("users:create");
    set.add("users:update");
    set.add("users:delete");
    set.add("roles:read");
    set.add("roles:create");
    set.add("roles:update");
    set.add("roles:delete");
  }
  if (set.has("manageSignatures")) {
    set.add("signatures:read");
    set.add("signatures:create");
    set.add("signatures:update");
    set.add("signatures:delete");
  }
  if (set.has("manageSettings")) {
    set.add("settings:read");
    set.add("settings:create");
    set.add("settings:update");
    set.add("settings:delete");
    set.add("sharepoint:read");
    set.add("sharepoint:create");
    set.add("sharepoint:update");
    set.add("sharepoint:delete");
  }
  if (set.has("viewAudit")) set.add("audit:read");

  return Array.from(set);
}

/**
 * Evaluates whether a role or user has a granular D365FO CRUD permission.
 * e.g. canPermission(role, "templates", "create", userCapabilities)
 */
export function canPermission(
  role: Role | undefined,
  resource: string,
  action: PermissionAction,
  userCapabilities?: readonly string[] | null
): boolean {
  if (!role) return false;
  if (role.toLowerCase() === "admin") return true;

  const targetKey = `${resource}:${action}`;

  // Check explicit user capabilities (normalized)
  if (userCapabilities && Array.isArray(userCapabilities) && userCapabilities.length > 0) {
    if (userCapabilities.includes(targetKey)) return true;
    const normalized = normalizePermissions(userCapabilities);
    if (normalized.includes(targetKey)) return true;
  }

  // Fallback to defaults
  const defaults = DEFAULT_ROLE_CAPABILITIES[role];
  if (defaults) {
    if (defaults.includes(targetKey)) return true;
    const normalized = normalizePermissions(defaults);
    if (normalized.includes(targetKey)) return true;
  }

  return false;
}

/**
 * Checks a capability with automatic resolution between legacy and granular permissions.
 */
export function can(
  role: Role | undefined,
  capability: Capability | string,
  userCapabilities?: readonly string[] | null
): boolean {
  if (!role) return false;
  if (role.toLowerCase() === "admin") return true;

  // If checking a granular permission e.g. "templates:create"
  if (capability.includes(":")) {
    const [res, act] = capability.split(":");
    return canPermission(role, res, act as PermissionAction, userCapabilities);
  }

  // Check explicit assigned capabilities
  if (userCapabilities && Array.isArray(userCapabilities) && userCapabilities.length > 0) {
    if (userCapabilities.includes(capability)) return true;
    const normalized = normalizePermissions(userCapabilities);
    if (normalized.includes(capability)) return true;
  }

  // Fallback to built-in default capabilities
  const defaults = DEFAULT_ROLE_CAPABILITIES[role];
  if (defaults) {
    if (defaults.includes(capability)) return true;
    const normalized = normalizePermissions(defaults);
    if (normalized.includes(capability)) return true;
  }

  // Case-insensitive check on CAN matrix
  const allowed = CAN[capability as keyof typeof CAN] as readonly string[] | undefined;
  if (allowed && allowed.some((r) => r.toLowerCase() === role.toLowerCase())) {
    return true;
  }

  return false;
}
