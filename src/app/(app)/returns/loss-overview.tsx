import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Money } from "@/components/domain/money";
import { formatPercent } from "@/lib/money";
import { ArrowRight } from "lucide-react";
import type { RefundTotals, RefundReasonRow } from "@/lib/finance/refunds-query";
import { cn } from "@/lib/cn";

const REASON_COLORS = [
  "bg-rose-400", "bg-amber-400", "bg-indigo-400", "bg-mint-400", "bg-navy-300", "bg-slate-300",
];

export function LossOverview({
  totals, reasons, currency, periodLabel,
}: {
  totals: RefundTotals;
  reasons: RefundReasonRow[];
  currency: string;
  periodLabel: string;
}) {
  const recovered = totals.recoveredMinor;
  const unrecovered = totals.netLossMinor;
  const ratio = totals.recoveryRatio;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Loss overview" description={periodLabel} />
        <CardBody className="space-y-3">
          <div>
            <p className="text-sm text-ink-muted">Total loss (unrecovered)</p>
            <p className="mt-0.5 text-2xl font-semibold text-negative">
              <Money minor={unrecovered} currency={currency} />
            </p>
          </div>

          <dl className="space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-ink-muted">
                <span className="size-2 rounded-full bg-caution" aria-hidden />
                Still owed by suppliers
              </dt>
              <dd className="font-medium"><Money minor={totals.stillRecoverableMinor} currency={currency} /></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-ink-muted">
                <span className="size-2 rounded-full bg-negative" aria-hidden />
                Written off
              </dt>
              <dd className="font-medium"><Money minor={totals.writtenOffMinor} currency={currency} /></dd>
            </div>
            {totals.overdueCount > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-ink-muted">
                  <span className="size-2 rounded-full bg-negative" aria-hidden />
                  Promised but overdue
                </dt>
                <dd className="font-medium text-negative">
                  <Money minor={totals.overdueMinor} currency={currency} />
                </dd>
              </div>
            ) : null}
          </dl>

          <Link
            href="/profit-protection"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-soft py-2 text-sm font-medium text-brand-ink transition-colors hover:brightness-97"
          >
            Go to profit protection
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recovery rate" description="Of everything recoverable, how much you got back." />
        <CardBody>
          <div className="flex items-center gap-4">
            <RecoveryDial ratio={ratio} />
            <dl className="min-w-0 flex-1 space-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">Recovered</dt>
                <dd className="text-lg font-semibold text-positive">
                  <Money minor={recovered} currency={currency} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Unrecovered</dt>
                <dd className="text-lg font-semibold text-negative">
                  <Money minor={unrecovered} currency={currency} />
                </dd>
              </div>
            </dl>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Top refund reasons" description="Where the money is going." />
        <CardBody>
          {reasons.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">No refunds in this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {reasons.map((reason, index) => (
                <li key={reason.reason}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">{reason.reason}</span>
                    <span className="tabular shrink-0 font-medium">{formatPercent(reason.share)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn("h-full rounded-full", REASON_COLORS[index % REASON_COLORS.length])}
                      style={{ width: `${Math.max(3, reason.share * 100)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {reason.count} refund{reason.count === 1 ? "" : "s"} ·{" "}
                    <Money minor={reason.lossMinor} currency={currency} /> unrecovered
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** A ring, drawn as SVG so it scales and themes cleanly. */
function RecoveryDial({ ratio }: { ratio: number | null }) {
  const value = ratio ?? 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.min(1, Math.max(0, value));

  return (
    <div className="relative shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Recovery rate ${formatPercent(ratio)}`}>
        <circle cx="44" cy="44" r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth="9" />
        <circle
          cx="44" cy="44" r={radius} fill="none"
          stroke={value >= 0.75 ? "var(--positive)" : value >= 0.4 ? "var(--caution)" : "var(--negative)"}
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 44 44)"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">
        <span className="tabular text-lg font-semibold">{ratio === null ? "—" : formatPercent(ratio, { digits: 0 })}</span>
      </span>
    </div>
  );
}
