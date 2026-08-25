/**
 * Role-based access control.
 *
 * This file is the single source of truth. The server checks against
 * `can()` on every mutation and page load, and Settings → Team renders its
 * "What each role can do" table from `ABILITIES` — so the table cannot drift
 * away from what is actually enforced.
 */

export const ROLES = ["OWNER", "MANAGER", "VA", "ACCOUNTANT", "READ_ONLY"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  VA: "VA",
  ACCOUNTANT: "Accountant",
  READ_ONLY: "Read-only",
};

/** Roles that can be granted by invitation. Owner is not invitable. */
export const INVITABLE_ROLES: Role[] = ["MANAGER", "VA", "ACCOUNTANT", "READ_ONLY"];

export const ROLE_SUMMARIES: Record<Role, string> = {
  OWNER: "Full access, including billing and the team.",
  MANAGER: "Runs the business day to day. Everything except billing and the team.",
  VA: "Enters buying prices and answers refund questions. Sees orders, not totals.",
  ACCOUNTANT: "Reads the numbers and manages expenses. Cannot touch orders or accounts.",
  READ_ONLY: "Looks, downloads reports, changes nothing.",
};

export const PERMISSIONS = [
  "dashboard.view",
  "orders.view",
  "costs.write",
  "refunds.answer",
  "products.manage",
  "expenses.manage",
  "reports.download",
  "analytics.view",
  "accounts.manage",
  "billing.manage",
  "team.manage",
  "automation.manage",
  "settings.manage",
  "support.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  MANAGER: new Set<Permission>([
    "dashboard.view",
    "orders.view",
    "costs.write",
    "refunds.answer",
    "products.manage",
    "expenses.manage",
    "reports.download",
    "analytics.view",
    "accounts.manage",
    "automation.manage",
    "settings.manage",
    "support.manage",
  ]),
  VA: new Set<Permission>(["orders.view", "costs.write", "refunds.answer", "support.manage"]),
  ACCOUNTANT: new Set<Permission>([
    "dashboard.view",
    "orders.view",
    "expenses.manage",
    "reports.download",
    "analytics.view",
  ]),
  READ_ONLY: new Set<Permission>(["dashboard.view", "orders.view", "reports.download", "analytics.view"]),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The rows of the Settings → Team matrix, in the order they are shown.
 * Owner is deliberately excluded from the columns — it can do everything, and
 * the table says so in prose instead of repeating a column of ticks.
 */
export const ABILITIES: ReadonlyArray<{ label: string; permission: Permission }> = [
  { label: "See the dashboard and profit totals", permission: "dashboard.view" },
  { label: "See orders", permission: "orders.view" },
  { label: "Enter buying prices", permission: "costs.write" },
  { label: "Answer refund and return questions", permission: "refunds.answer" },
  { label: "Manage products and suppliers", permission: "products.manage" },
  { label: "Manage business expenses", permission: "expenses.manage" },
  { label: "Download reports", permission: "reports.download" },
  { label: "See analytics", permission: "analytics.view" },
  { label: "Connect and manage eBay accounts", permission: "accounts.manage" },
  { label: "Build automations", permission: "automation.manage" },
];

export const MATRIX_COLUMNS: Role[] = ["MANAGER", "VA", "ACCOUNTANT", "READ_ONLY"];
