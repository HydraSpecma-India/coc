/** Shared (client-safe) role definitions. */
export const ROLES = ["Admin", "Quality", "Production", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}

/** Capability matrix – the single place that maps roles to permissions. */
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
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAN;

export function can(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (CAN[capability] as readonly Role[]).includes(role);
}
