"use client";

import { format } from "date-fns";
import { Card, CardHeader } from "@/components/ui/card";
import { SupplierClaimBadge } from "@/components/domain/status";
import { SupplierClaimAnswer } from "@/components/domain/supplier-claim-answer";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

interface RefundView {
  id: string;
  type: string;
  refundedAt: string;
  buyerRefundMinor: number;
  feeCreditMinor: number;
  recoveredMinor: number;
  supplierClaim: string;
  supplierName: string | null;
  reason: string | null;
  notes: string | null;
  promisedByDate: string | null;
}

export function RefundPanel({
  refunds, currency, editable,
}: {
  refunds: RefundView[];
  currency: string;
  editable: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={refunds.length === 1 ? "Refund" : `${refunds.length} refunds`}
        description="What the buyer got back, and whether your supplier has repaid you."
      />
      <ul className="divide-y divide-line border-t border-line">
        {refunds.map((refund) => {
          const lossMinor = Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor - refund.recoveredMinor);
          const notApplicable = refund.supplierClaim === "NOT_APPLICABLE";

          return (
            <li key={refund.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium">
                      {formatMoney(refund.buyerRefundMinor, currency)} refunded to the buyer
                    </p>
                    {refund.type === "RETURN" ? <Badge tone="info">Return</Badge> : null}
                    {refund.type === "CANCELLATION" ? <Badge tone="neutral">Cancellation</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    <time dateTime={refund.refundedAt}>{format(new Date(refund.refundedAt), "d MMM yyyy")}</time>
                    {refund.reason ? ` · ${refund.reason}` : ""}
                  </p>
                </div>
                <SupplierClaimBadge claim={refund.supplierClaim} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-4">
                <Figure label="Buyer refund" value={formatMoney(refund.buyerRefundMinor, currency)} tone="negative" />
                <Figure label="eBay fee credit" value={formatMoney(refund.feeCreditMinor, currency)} tone="positive" />
                <Figure label="Supplier repaid" value={formatMoney(refund.recoveredMinor, currency)} tone="positive" />
                <Figure
                  label="Your loss"
                  value={formatMoney(lossMinor, currency)}
                  tone={lossMinor > 0 ? "negative" : "positive"}
                  emphasis
                />
              </dl>

              {refund.promisedByDate ? (
                <p className="mt-2 text-sm text-ink-muted">
                  Supplier promised by {format(new Date(refund.promisedByDate), "d MMM yyyy")}.
                </p>
              ) : null}

              {refund.notes ? (
                <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm whitespace-pre-wrap text-ink-muted">
                  {refund.notes}
                </p>
              ) : null}

              {notApplicable ? (
                <p className="mt-3 text-sm text-ink-muted">
                  This order was cancelled before anything was bought, so there is no supplier claim to make.
                </p>
              ) : editable ? (
                <div className="mt-4">
                  <p className="mb-2 text-base font-medium">Did you receive a supplier refund?</p>
                  <SupplierClaimAnswer
                    target={{
                      refundId: refund.id,
                      orderLabel: "This order",
                      buyerRefundMinor: refund.buyerRefundMinor,
                      feeCreditMinor: refund.feeCreditMinor,
                      recoveredMinor: refund.recoveredMinor,
                      currency,
                      supplierName: refund.supplierName,
                      currentClaim: refund.supplierClaim,
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Figure({
  label, value, tone, emphasis,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-ink-muted">{label}</dt>
      <dd
        className={`tabular mt-0.5 ${emphasis ? "text-lg font-semibold" : "text-base font-medium"} ${
          tone === "negative" ? "text-negative" : "text-positive"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
