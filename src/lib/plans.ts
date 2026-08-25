/**
 * Plans and entitlements.
 *
 * Every gate in the app asks this module. Nothing checks `plan === "MULTI"`
 * inline — when a limit changes it changes here, once.
 */

export const PLANS = ["TRIAL", "SOLO", "MULTI", "CUSTOM"] as const;
export type PlanId = (typeof PLANS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  monthlyMinor: number | null;
  yearlyMinor: number | null;
  currency: string;
  accountLimit: number;
  features: string[];
  purchasable: boolean;
}

export const PLAN_CATALOG: Record<PlanId, Plan> = {
  TRIAL: {
    id: "TRIAL",
    name: "Trial",
    blurb: "Everything on, one eBay account, for 14 days.",
    monthlyMinor: 0,
    yearlyMinor: 0,
    currency: "USD",
    accountLimit: 1,
    features: ["1 eBay account", "Unlimited orders", "Full profit, fees and refund tracking"],
    purchasable: false,
  },
  SOLO: {
    id: "SOLO",
    name: "Solo",
    blurb: "One eBay account. Unlimited orders.",
    monthlyMinor: 1499,
    yearlyMinor: 14390,
    currency: "USD",
    accountLimit: 1,
    features: [
      "1 eBay account",
      "Unlimited orders",
      "Full profit, fees and refund tracking",
      "Supplier refund recovery",
      "CSV and PDF reports",
    ],
    purchasable: true,
  },
  MULTI: {
    id: "MULTI",
    name: "Multi",
    blurb: "Three eBay accounts. Unlimited orders.",
    monthlyMinor: 3999,
    yearlyMinor: 38390,
    currency: "USD",
    accountLimit: 3,
    features: [
      "3 eBay accounts",
      "Unlimited orders",
      "Full profit, fees and refund tracking",
      "Supplier refund recovery",
      "CSV and PDF reports",
      "Team access with roles",
      "Automation rules",
    ],
    purchasable: true,
  },
  CUSTOM: {
    id: "CUSTOM",
    name: "Custom",
    blurb: "As many eBay accounts as you need.",
    monthlyMinor: null,
    yearlyMinor: null,
    currency: "USD",
    accountLimit: 999,
    features: [
      "As many eBay accounts as agreed",
      "Unlimited orders",
      "Everything in Multi",
      "Priority support",
    ],
    purchasable: false,
  },
};

export const PURCHASABLE_PLANS: Plan[] = [PLAN_CATALOG.SOLO, PLAN_CATALOG.MULTI, PLAN_CATALOG.CUSTOM];

export function planFor(id: string): Plan {
  return PLAN_CATALOG[(id as PlanId) in PLAN_CATALOG ? (id as PlanId) : "TRIAL"];
}

export interface Entitlements {
  plan: Plan;
  accountLimit: number;
  accountsUsed: number;
  canConnectAnotherAccount: boolean;
  /** Team invitations and automation are Multi-and-above. */
  canUseTeam: boolean;
  canUseAutomation: boolean;
  /** False once a trial lapses or a subscription goes unpaid — syncing pauses. */
  syncingActive: boolean;
  trialDaysLeft: number | null;
}

export function entitlementsFor(input: {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  accountsUsed: number;
}): Entitlements {
  const plan = planFor(input.plan);
  const now = Date.now();

  const trialDaysLeft =
    input.status === "TRIALING" && input.trialEndsAt
      ? Math.max(0, Math.ceil((+input.trialEndsAt - now) / 86_400_000))
      : null;

  const syncingActive =
    input.status === "ACTIVE" ||
    (input.status === "TRIALING" && (!input.trialEndsAt || +input.trialEndsAt > now));

  const multiOrAbove = plan.id === "MULTI" || plan.id === "CUSTOM";

  return {
    plan,
    accountLimit: plan.accountLimit,
    accountsUsed: input.accountsUsed,
    // Over-limit accounts keep working; only *new* connections are blocked. (R18.1)
    canConnectAnotherAccount: input.accountsUsed < plan.accountLimit,
    canUseTeam: multiOrAbove,
    canUseAutomation: multiOrAbove,
    syncingActive,
    trialDaysLeft,
  };
}
