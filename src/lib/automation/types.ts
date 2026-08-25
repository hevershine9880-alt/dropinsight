/**
 * Automation vocabulary.
 *
 * Deliberately narrow: every action is reversible and internal. Nothing here
 * refunds a buyer, messages anyone, or changes a listing — an automation that
 * can lose money is not a feature, it is a liability.
 */

export const TRIGGERS = [
  "ORDER_REFUNDED",
  "ORDER_BELOW_MARGIN",
  "ORDER_MISSING_COST",
  "SUPPLIER_REFUND_OVERDUE",
  "SYNC_FAILED",
  "ORDER_DISPATCH_DEADLINE_NEAR",
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABELS: Record<Trigger, string> = {
  ORDER_REFUNDED: "An order is refunded",
  ORDER_BELOW_MARGIN: "An order's margin falls below a threshold",
  ORDER_MISSING_COST: "An order has had no buying price for a while",
  SUPPLIER_REFUND_OVERDUE: "A supplier refund goes unanswered",
  SYNC_FAILED: "An eBay account fails to sync",
  ORDER_DISPATCH_DEADLINE_NEAR: "A dispatch deadline is approaching",
};

export const TRIGGER_DESCRIPTIONS: Record<Trigger, string> = {
  ORDER_REFUNDED: "Fires once per refund, when it first arrives from eBay.",
  ORDER_BELOW_MARGIN: "Fires when a priced order's margin is under your threshold.",
  ORDER_MISSING_COST: "Fires when an order has been waiting for a buying price longer than you allow.",
  SUPPLIER_REFUND_OVERDUE: "Fires when a refund has sat at Not asked, Asked or Promised for too long.",
  SYNC_FAILED: "Fires when a sync job ends in failure.",
  ORDER_DISPATCH_DEADLINE_NEAR: "Fires when an undispatched order is close to eBay's deadline.",
};

export const ACTIONS = ["NOTIFY", "FLAG_ORDER", "SET_SUPPLIER_CLAIM", "ADD_NOTE"] as const;
export type ActionKind = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<ActionKind, string> = {
  NOTIFY: "Send a notification",
  FLAG_ORDER: "Raise it in Alerts",
  SET_SUPPLIER_CLAIM: "Mark the supplier claim as Asked",
  ADD_NOTE: "Add a note to the order",
};

export interface Condition {
  field: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq" | "neq";
  value: number | string;
}

export interface Action {
  kind: ActionKind;
  /** Free text for NOTIFY and ADD_NOTE. */
  message?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
}

export interface ConditionField {
  field: string;
  label: string;
  type: "number" | "percent" | "days" | "money";
  help: string;
}

/** Which conditions make sense for which trigger. */
export const CONDITION_FIELDS: Record<Trigger, ConditionField[]> = {
  ORDER_REFUNDED: [
    { field: "refundLoss", label: "Refund loss", type: "money", help: "What the refund actually cost you, after eBay's fee credit." },
    { field: "orderValue", label: "Order value", type: "money", help: "Revenue on the order, including shipping charged." },
  ],
  ORDER_BELOW_MARGIN: [
    { field: "marginPercent", label: "Margin", type: "percent", help: "Net profit as a share of revenue." },
    { field: "orderValue", label: "Order value", type: "money", help: "Revenue on the order." },
  ],
  ORDER_MISSING_COST: [
    { field: "ageDays", label: "Days waiting", type: "days", help: "How long the order has had no buying price." },
    { field: "orderValue", label: "Order value", type: "money", help: "Revenue sitting outside your profit." },
  ],
  SUPPLIER_REFUND_OVERDUE: [
    { field: "ageDays", label: "Days since the refund", type: "days", help: "How long the claim has been open." },
    { field: "recoverable", label: "Recoverable amount", type: "money", help: "What the supplier still owes you." },
  ],
  SYNC_FAILED: [],
  ORDER_DISPATCH_DEADLINE_NEAR: [
    { field: "hoursRemaining", label: "Hours left", type: "number", help: "Time until eBay's dispatch deadline." },
  ],
};

export const OPERATOR_LABELS: Record<Condition["operator"], string> = {
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
  eq: "is",
  neq: "is not",
};

export function evaluateCondition(condition: Condition, facts: Record<string, number | string>): boolean {
  const actual = facts[condition.field];
  if (actual === undefined) return false;

  if (typeof actual === "number" && typeof condition.value === "number") {
    switch (condition.operator) {
      case "lt": return actual < condition.value;
      case "lte": return actual <= condition.value;
      case "gt": return actual > condition.value;
      case "gte": return actual >= condition.value;
      case "eq": return actual === condition.value;
      case "neq": return actual !== condition.value;
    }
  }
  if (condition.operator === "eq") return String(actual) === String(condition.value);
  if (condition.operator === "neq") return String(actual) !== String(condition.value);
  return false;
}

export function parseConditions(json: string): Condition[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Condition[]) : [];
  } catch {
    return [];
  }
}

export function parseActions(json: string): Action[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Action[]) : [];
  } catch {
    return [];
  }
}
