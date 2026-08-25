import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/cn";
import { format } from "date-fns";
import { Award, ShieldAlert, Truck } from "lucide-react";
import type { AccountRow } from "@/lib/finance/dashboard";

/**
 * eBay's own seller standards, brought in from the Analytics API.
 *
 * Each metric shows its threshold, because "0.86%" means nothing without
 * "Top Rated needs 3% or lower". (R8.6)
 */

const THRESHOLDS = {
  lateDispatch: { topRated: 0.03, belowStandard: 0.05, label: "Late dispatch rate" },
  defect: { topRated: 0.005, belowStandard: 0.02, label: "Transaction defect rate" },
  cases: { topRated: 0.003, belowStandard: 0.003, label: "Cases closed without your help" },
} as const;

export function AccountHealthPanel({ accounts }: { accounts: AccountRow[] }) {
  const withHealth = accounts.filter((a) => a.sellerLevel);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="eBay account health"
        description="eBay's own seller standards, with the thresholds that matter."
      />

      {withHealth.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No seller standards yet"
          description="These arrive with your next sync. eBay re-evaluates on the 20th of each month."
          className="flex-1 py-8"
        />
      ) : (
        <CardBody className="space-y-5">
          {withHealth.map((account) => (
            <div key={account.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-base font-medium text-ink">{account.username}</p>
                  <Badge
                    tone={account.sellerLevel === "TOP_RATED" ? "positive" : "info"}
                    icon={Award}
                  >
                    {account.sellerLevel === "TOP_RATED"
                      ? "Top Rated"
                      : account.sellerLevel === "ABOVE_STANDARD"
                        ? "Above Standard"
                        : "Below Standard"}
                  </Badge>
                </div>
                {account.healthNextEvaluationAt ? (
                  <p className="text-xs text-ink-subtle">
                    Next evaluated {format(account.healthNextEvaluationAt, "d MMM")}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 space-y-2.5">
                <HealthBar
                  label={THRESHOLDS.lateDispatch.label}
                  value={account.lateDispatchRate ?? 0}
                  topRated={THRESHOLDS.lateDispatch.topRated}
                  belowStandard={THRESHOLDS.lateDispatch.belowStandard}
                />
                <HealthBar
                  label={THRESHOLDS.defect.label}
                  value={account.transactionDefectRate ?? 0}
                  topRated={THRESHOLDS.defect.topRated}
                  belowStandard={THRESHOLDS.defect.belowStandard}
                />
                <HealthBar
                  label={THRESHOLDS.cases.label}
                  value={account.casesClosedWithoutSellerResolutionRate ?? 0}
                  topRated={THRESHOLDS.cases.topRated}
                  belowStandard={THRESHOLDS.cases.belowStandard}
                />
              </div>

              <dl className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-surface-sunken p-2.5">
                <Stat label="On time" value={account.dispatchedOnTime} tone="positive" icon={Truck} />
                <Stat label="Late" value={account.dispatchedLate} tone={account.dispatchedLate > 0 ? "negative" : "neutral"} />
                <Stat label="To dispatch" value={account.awaitingDispatch} tone={account.awaitingDispatch > 0 ? "caution" : "neutral"} />
                <Stat label="Cancelled" value={account.cancellations} tone="neutral" />
              </dl>
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

function HealthBar({
  label, value, topRated, belowStandard,
}: {
  label: string;
  value: number;
  topRated: number;
  belowStandard: number;
}) {
  // The bar is scaled so the Below Standard line sits at 75% of the track —
  // a healthy store's bar is short, and the danger zone is visible.
  const scale = belowStandard / 0.75;
  const pct = Math.min(100, (value / scale) * 100);
  const good = value <= topRated;
  const bad = value > belowStandard;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className={cn("tabular text-sm font-medium", bad ? "text-negative" : good ? "text-positive" : "text-caution")}>
          {formatPercent(value, { digits: 2 })}
        </span>
      </div>
      <div
        className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-label={label}
        aria-valuenow={Number((value * 100).toFixed(2))}
        aria-valuemin={0}
        aria-valuemax={Number((scale * 100).toFixed(2))}
        aria-valuetext={`${formatPercent(value, { digits: 2 })}, Top Rated needs ${formatPercent(topRated, { digits: 1 })} or lower`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", bad ? "bg-negative" : good ? "bg-positive" : "bg-caution")}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
        <span
          className="absolute inset-y-0 w-px bg-line-strong"
          style={{ left: `${(topRated / scale) * 100}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-0.5 text-xs text-ink-subtle">
        Top Rated needs {formatPercent(topRated, { digits: topRated < 0.01 ? 2 : 0 })} or lower ·
        above {formatPercent(belowStandard, { digits: belowStandard < 0.01 ? 2 : 0 })} is Below Standard
      </p>
    </div>
  );
}

function Stat({
  label, value, tone, icon: Icon,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "caution" | "neutral";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    positive: "text-positive", negative: "text-negative",
    caution: "text-caution", neutral: "text-ink",
  }[tone];

  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 truncate text-xs text-ink-muted">
        {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
        {label}
      </dt>
      <dd className={cn("tabular text-lg font-semibold", toneClass)}>{value.toLocaleString()}</dd>
    </div>
  );
}
