import Link from "next/link";
import { ArrowUpRight, Tag, HelpCircle, PackageCheck, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Outstanding } from "@/lib/finance/dashboard";

/**
 * "Outstanding right now — not tied to the periods above."
 *
 * The distinction matters: these counts are live work queues, not period
 * metrics, and mixing them into the period cards would make both misleading.
 */
export function OutstandingRow({ outstanding, currency }: { outstanding: Outstanding; currency: string }) {
  const tiles = [
    {
      key: "unpriced",
      icon: Tag,
      value: outstanding.unpricedOrders.toLocaleString(),
      label: "Awaiting a buying price",
      detail: `${formatMoney(outstanding.unpricedRevenueMinor, currency)} of sales not in your profit yet`,
      href: "/orders?tab=awaiting_cost",
      tone: outstanding.unpricedOrders > 0 ? "caution" : "positive",
    },
    {
      key: "refunds",
      icon: HelpCircle,
      value: outstanding.refundsNeedingAnswer.toLocaleString(),
      label: "Refunds need your answer",
      detail: `${formatMoney(outstanding.refundsRecoverableMinor, currency)} still recoverable from suppliers`,
      href: "/profit-protection",
      tone: outstanding.refundsNeedingAnswer > 0 ? "caution" : "positive",
    },
    {
      key: "returns",
      icon: PackageCheck,
      value: outstanding.returnsAwaitingAction.toLocaleString(),
      label: "Returns awaiting action",
      detail: outstanding.returnsAwaitingAction === 0 ? "none open" : "open return cases",
      href: "/returns?tab=returns",
      tone: outstanding.returnsAwaitingAction > 0 ? "caution" : "positive",
    },
  ] as const;

  return (
    <section aria-labelledby="outstanding-heading">
      <h2 id="outstanding-heading" className="mb-2 text-sm text-ink-muted">
        Outstanding right now — not tied to the periods above
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className="card group flex items-start gap-3 p-4 transition-colors hover:border-line-strong"
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg",
                tile.tone === "caution" ? "bg-caution-soft text-caution" : "bg-positive-soft text-positive",
              )}
            >
              <tile.icon className="size-4.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="tabular block text-xl font-semibold">{tile.value}</span>
              <span className="block text-sm font-medium text-ink">{tile.label}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-muted">{tile.detail}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-ink-subtle transition-colors group-hover:text-brand" aria-hidden />
          </Link>
        ))}
      </div>

      {outstanding.recoveredToDateMinor > 0 || outstanding.stillRecoverableMinor > 0 ? (
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3",
            outstanding.stillRecoverableMinor > 0 ? "bg-caution-soft" : "bg-positive-soft",
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ShieldCheck
              className={cn("size-5 shrink-0", outstanding.stillRecoverableMinor > 0 ? "text-caution" : "text-positive")}
              aria-hidden
            />
            <span className="min-w-0">
              <span className={cn("block font-medium", outstanding.stillRecoverableMinor > 0 ? "text-caution-ink" : "text-positive-ink")}>
                {outstanding.stillRecoverableMinor > 0
                  ? `${formatMoney(outstanding.stillRecoverableMinor, currency)} still owed by your suppliers`
                  : "Supplier refunds are all settled"}
              </span>
              <span className="block text-sm text-ink-muted">
                {formatMoney(outstanding.recoveredToDateMinor, currency)} recovered to date
              </span>
            </span>
          </span>
          <Link
            href="/profit-protection"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3.5 text-sm font-medium text-ink shadow-sm ring-1 ring-line transition-colors hover:bg-surface-hover"
          >
            Profit protection
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
