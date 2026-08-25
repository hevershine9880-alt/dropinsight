/**
 * Expense categories.
 *
 * Deliberately in its own module rather than exported from the server-actions
 * file: everything exported from a "use server" module becomes an async server
 * function, so a plain array exported from there arrives on the client as an
 * unusable stub.
 */
export const EXPENSE_CATEGORIES = [
  "Software",
  "Payroll",
  "Advertising",
  "Packaging",
  "Postage",
  "Marketplace fees",
  "Professional fees",
  "Equipment",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
