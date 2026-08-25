import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { AlertTriangle, Ban } from "lucide-react";
import type { OrderProfit } from "@/lib/finance/types";

/**
 * How this order's profit was arrived at, line by line.
 *
 * Every row is a real stored amount, and the rows add up to the total — you can
 * check it with a calculator. That is the whole point: a seller who cannot
 * reconcile the number will not trust anything else in the product.
 */
export function ProfitBreakdown({ profit, currency }: { profit: OrderProfit; currency: string }) {
  if (profit.isNonLossCancellation) {
    return (
      <Card>
        <CardHeader title="Profit" />
        <CardBody>
          <div className="flex gap-2.5 rounded-lg bg-surface-sunken p-3">
            <Ban className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
            <div>
              <p className="text-base font-medium">Cancelled before fulfilment</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Nothing was bought from a supplier, so this order carries no revenue, no cost and no
                loss. It is counted but never charged against your profit.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  const rows: { label: string; minor: number; kind: "in" | "out"; hint?: string }[] = [
    { label: "Item sales", minor: profit.itemSubtotalMinor, kind: "in" },
    ...(profit.shippingChargedMinor > 0
      ? [{ label: "Postage charged", minor: profit.shippingChargedMinor, kind: "in" as const }]
      : []),
    {
      label: "Supplier cost",
      minor: -profit.costOfGoodsMinor,
      kind: "out",
      hint: "Your buying price multiplied by quantity.",
    },
    { label: "eBay fees", minor: -profit.ebayFeesMinor, kind: "out", hint: "Final value fee and the per-order fixed charge." },
    ...(profit.adFeesMinor > 0
      ? [{ label: "Ad fees", minor: -profit.adFeesMinor, kind: "out" as const, hint: "Promoted Listings spend on this order." }]
      : []),
  ];

  const refundRows =
    profit.buyerRefundMinor > 0
      ? [
          { label: "Refunded to buyer", minor: -profit.buyerRefundMinor, kind: "out" as const },
          ...(profit.feeCreditMinor > 0
            ? [{ label: "eBay fee credit", minor: profit.feeCreditMinor, kind: "in" as const, hint: "Fees eBay gave back on the refund." }]
            : []),
          ...(profit.recoveredMinor > 0
            ? [{ label: "Recovered from supplier", minor: profit.recoveredMinor, kind: "in" as const }]
            : []),
        ]
      : [];

  return (
    <Card aria-label="How this profit was calculated">
      <CardHeader
        title="How this profit was calculated"
        description="Every line is a stored amount. They add up."
      />
      <CardBody>
        <dl className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <Row key={row.label} {...row} currency={currency} />
          ))}

          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
            <dt className="font-medium">Gross profit</dt>
            <dd className="text-base font-semibold">
              <Money minor={profit.grossProfitMinor} currency={currency} signed />
            </dd>
          </div>

          {refundRows.length > 0 ? (
            <>
              <div className="pt-2">
                {refundRows.map((row) => (
                  <Row key={row.label} {...row} currency={currency} />
                ))}
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="flex items-center gap-1 text-ink-muted">
                  Refund loss
                  <InfoTip label="refund loss">
                    What the refund actually cost you: what the buyer got back, less the fees eBay
                    credited and anything your supplier returned. It can never be less than zero.
                  </InfoTip>
                </dt>
                <dd className="font-medium text-negative">
                  <Money minor={-profit.refundLossMinor} currency={currency} muteZero />
                </dd>
              </div>
            </>
          ) : null}

          <div className="mt-2 flex items-baseline justify-between gap-3 rounded-lg bg-surface-sunken px-3 py-2.5">
            <dt className="font-semibold">Net profit</dt>
            <dd className="text-xl font-semibold">
              <Money minor={profit.netProfitMinor} currency={currency} signed />
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3 px-3">
            <dt className="text-ink-muted">Margin on revenue</dt>
            <dd
              className={cn(
                "font-medium",
                (profit.marginRatio ?? 0) < 0 ? "text-negative" :
                (profit.marginRatio ?? 0) < 0.08 ? "text-caution-ink" : "text-positive",
              )}
            >
              <Percent ratio={profit.marginRatio} />
            </dd>
          </div>
        </dl>

        {!profit.isPriced ? (
          <p className="mt-4 flex gap-2 rounded-lg bg-caution-soft px-3 py-2.5 text-sm text-caution-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {profit.unpricedLineCount === 1
                ? "One line has no buying price yet"
                : `${profit.unpricedLineCount} lines have no buying price yet`}
              , so this profit is missing its supplier cost. Add it below and every figure updates.
            </span>
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Row({
  label, minor, kind, hint, currency,
}: {
  label: string;
  minor: number;
  kind: "in" | "out";
  hint?: string;
  currency: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-ink-muted">
        {label}
        {hint ? <InfoTip label={label}>{hint}</InfoTip> : null}
      </dt>
      <dd className={cn("tabular", kind === "out" ? "text-negative" : "text-ink")}>
        <Money minor={minor} currency={currency} />
      </dd>
    </div>
  );
}
