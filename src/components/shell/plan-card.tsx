"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { planFor } from "@/lib/plans";
import type { PlanSummary } from "./sidebar";
import { Sparkles } from "lucide-react";

/**
 * The sidebar is the one piece of chrome on every page, and vertical space in
 * it is the scarcest thing in the app — every row this card occupies is a
 * navigation item pushed below the fold on a laptop screen.
 *
 * So the card only takes the space when it has something to say: a trial that
 * is running out, an account limit that is full, a payment that failed. A
 * settled subscription gets a single line, which is all a settled subscription
 * warrants.
 */
export function PlanCard({ plan, canManage }: { plan: PlanSummary; canManage: boolean }) {
  const details = planFor(plan.plan);
  const used = Math.min(plan.accountsUsed, plan.accountLimit);
  const pct = plan.accountLimit > 0 ? Math.min(100, (used / plan.accountLimit) * 100) : 0;
  const trialing = plan.status === "TRIALING";
  const urgent = trialing && plan.trialEndsAt !== null && Number(plan.trialEndsAt) <= 2;
  const atLimit = plan.accountLimit > 0 && plan.accountsUsed >= plan.accountLimit;
  const unpaid = plan.status === "PAST_DUE" || plan.status === "CANCELED";

  // Nothing needs deciding — one line, and the rest of the height goes to the nav.
  if (!trialing && !atLimit && !unpaid) {
    const summary = plan.renewsAt ? `Renews ${plan.renewsAt}` : details.blurb;
    const label = `${details.name} plan · ${plan.accountsUsed} of ${plan.accountLimit} eBay accounts · ${summary}`;

    if (!canManage) {
      return (
        <p className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-ink-muted" title={label}>
          <Sparkles className="size-3.5 shrink-0 text-indigo-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{details.name} plan</span>
          <span className="tabular shrink-0 text-2xs">{plan.accountsUsed}/{plan.accountLimit}</span>
        </p>
      );
    }

    return (
      <Link
        href="/settings/billing"
        title={label}
        aria-label={`${label} — manage plan`}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-ink-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink"
      >
        <Sparkles className="size-3.5 shrink-0 text-indigo-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{details.name} plan</span>
        <span className="tabular shrink-0 text-2xs">{plan.accountsUsed}/{plan.accountLimit}</span>
      </Link>
    );
  }

  return (
    <div className="rounded-xl bg-white/6 p-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-indigo-300" aria-hidden />
        <p className="text-sm font-semibold text-sidebar-ink">{details.name} plan</p>
      </div>

      <p className={cn("mt-0.5 text-xs", urgent || unpaid ? "text-amber-300" : "text-sidebar-ink-muted")}>
        {unpaid
          ? plan.status === "PAST_DUE"
            ? "Payment failed — syncing pauses until it is settled."
            : "Cancelled — your data stays, syncing has stopped."
          : trialing
            ? plan.trialEndsAt === null
              ? "Trial active"
              : `${plan.trialEndsAt} day${Number(plan.trialEndsAt) === 1 ? "" : "s"} left — nothing is deleted when it ends, syncing pauses.`
            : "Every eBay account slot is in use — add one more to connect another store."}
      </p>

      <div className="mt-2.5">
        <div className="flex items-baseline justify-between text-2xs text-sidebar-ink-muted">
          <span>eBay accounts</span>
          <span className="tabular">{plan.accountsUsed} / {plan.accountLimit}</span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={plan.accountLimit}
          aria-label="eBay accounts used"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-amber-400" : "bg-indigo-400")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {canManage ? (
        <Link
          href="/settings/billing"
          className="mt-2.5 block w-full rounded-lg bg-white/10 py-1.5 text-center text-sm font-medium text-sidebar-ink transition-colors hover:bg-white/16"
        >
          {trialing ? "Choose a plan" : unpaid ? "Fix payment" : "Manage plan"}
        </Link>
      ) : null}
    </div>
  );
}
