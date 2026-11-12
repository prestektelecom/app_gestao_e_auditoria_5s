// Central permission map. Components must ask `can(role, permission)` instead of
// checking role names directly.
export type Role = "admin" | "auditor" | "manager" | "director";

export const ROLES: Role[] = ["admin", "auditor", "manager", "director"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  auditor: "Auditor",
  manager: "Gestor da Área",
  director: "Diretoria",
};

const ALL: Role[] = ["admin", "auditor", "manager", "director"];

const PERMISSIONS = {
  "dashboard.view": ALL,
  "units.view": ALL,
  "units.manage": ["admin"],
  "people.view": ["admin"],
  "people.manage": ["admin"],
  "settings.view": ["admin"],
  "settings.manage": ["admin"],
  "audits.view": ["admin", "auditor", "manager", "director"],
  "actionPlans.view": ["admin", "auditor", "manager", "director"],
  "actionPlans.edit": ["admin", "manager"],
  "notifications.view": ALL,
  "logs.view": ["admin"],
  "checklist.view": ["admin", "auditor"],
  "checklist.manage": ["admin"],
  "checklist.propose": ["admin", "auditor"],
  "audits.edit": ["admin"],
  "audits.delete": ["admin"],
  "audits.map": ["admin", "auditor", "director"],
  "audits.logs": ["admin", "auditor", "director"],
  "qrcodes.view": ["admin"],
  "reports.view": ["admin", "auditor", "manager", "director"],
  "meetings.view": ALL,
  "meetings.manage": ["admin", "manager", "auditor"],
  "maintenance.view": ALL,
  "maintenance.manage": ["admin", "manager"],
  "maintenance.qrcodes": ["admin"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as Role[]).includes(role);
}
