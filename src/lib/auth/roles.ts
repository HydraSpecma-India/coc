/** Shared (client-safe) role and capability definitions. */
export const SYSTEM_ROLES = ["Admin", "Quality", "Production", "Viewer"] as const;
export const ROLES = SYSTEM_ROLES;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type Role = string;

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && x.trim().length > 0;
}

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

export const DEFAULT_ROLE_CAPABILITIES: Record<string, Capability[]> = {
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
  ],
  Quality: [
    "viewDashboard",
    "createCoc",
    "completeCoc",
    "viewCoc",
    "viewTemplates",
    "manageSignatures",
    "viewAudit",
  ],
  Production: [
    "viewDashboard",
    "createCoc",
    "viewCoc",
    "viewTemplates",
    "manageSignatures",
  ],
  Viewer: [
    "viewDashboard",
    "viewCoc",
    "viewTemplates",
  ],
};

/** Capability matrix fallback – maps built-in roles to permissions. */
export const CAN = {
  manageTemplates: ["Admin"],
  manageFields: ["Admin"],
  manageSettings: ["Admin"],
  manageUsers: ["Admin"],
  viewAudit: ["Admin", "Quality"],
  createCoc: ["Admin", "Production", "Quality"],
  completeCoc: ["Admin", "Quality"],
  viewCoc: ["Admin", "Quality", "Production", "Viewer"],
  viewTemplates: ["Admin", "Quality", "Production", "Viewer"],
  viewDashboard: ["Admin", "Quality", "Production", "Viewer"],
  manageSignatures: ["Admin", "Quality", "Production"],
} as const satisfies Record<string, readonly string[]>;

export function can(
  role: Role | undefined,
  capability: Capability,
  userCapabilities?: readonly string[] | null
): boolean {
  if (!role) return false;
  if (role.toLowerCase() === "admin") return true;

  // Check explicit assigned capabilities from session or DB
  if (userCapabilities && Array.isArray(userCapabilities) && userCapabilities.length > 0) {
    return userCapabilities.includes(capability);
  }

  // Fallback to built-in default capabilities
  const defaults = DEFAULT_ROLE_CAPABILITIES[role];
  if (defaults) {
    return defaults.includes(capability);
  }

  // Case-insensitive check on CAN matrix
  const allowed = CAN[capability as keyof typeof CAN] as readonly string[] | undefined;
  if (allowed && allowed.some((r) => r.toLowerCase() === role.toLowerCase())) {
    return true;
  }

  return false;
}
