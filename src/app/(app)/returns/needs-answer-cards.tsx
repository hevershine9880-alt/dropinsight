"use client";

import Link from "next/link";
import { format } from "date-fns";
import { SupplierClaimAnswer } from "@/components/domain/supplier-claim-answer";
import { formatMoney } from "@/lib/money";
import { HelpCircle, ArrowRight } from "lucide-react";

/**
 * The unanswered refunds, surfaced as cards at the top of the page.
 *
 * Straight from the reference product, and rightly so: the question is the
 * whole point of the page, and burying it in a table row means it never gets
 * answered. Only the two oldest are shown — the rest live in the chase queue,
 * which is built for volume.
 */
export function NeedsAnswerCards({
  refunds, currency, totalNeedingAnswer,
}: {
  refunds: {
    id: string;
    ebayOrderId: string;
    orderId: string;
    productTitle: string;
    orderedAt: string;
    buyerRefundMinor: number;
    feeCreditMinor: number;
    recoveredMinor: number;
    supplierClaim: string;
  }[];
  currency: string;
  totalNeedingAnswer: number;
}) {
  return (
    <section aria-labelledby="needs-answer-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="needs-answer-heading" className="sr-only">Refunds needing an answer</h2>
        {totalNeedingAnswer > refunds.length ? (
          <Link
            href="/profit-protection"
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            {totalNeedingAnswer - refunds.length} more waiting in the chase queue
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {refunds.map((refund) => (
        <div key={refund.id} className="rounded-xl border border-caution/25 bg-caution-soft/60 p-4">
          <div className="flex items-start gap-2.5">
            <HelpCircle className="mt-0.5 size-5 shrink-0 text-caution" aria-hidden />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-ink">Did you receive a supplier refund?</h3>
              <p className="mt-0.5 text-sm text-ink-muted">
                eBay refunded{" "}
                <strong className="font-semibold text-ink">{formatMoney(refund.buyerRefundMinor, currency)}</strong>
                {" "}on order{" "}
                <Link href={`/orders/${refund.orderId}`} className="tabular font-medium text-brand hover:underline">
                  {refund.ebayOrderId}
                </Link>
                {" · "}
                <span className="text-ink-muted">{refund.productTitle}</span>
                {" · ordered "}
                {format(new Date(refund.orderedAt), "d MMM")}
              </p>

              <div className="mt-3">
                <SupplierClaimAnswer
                  target={{
                    refundId: refund.id,
                    orderLabel: refund.ebayOrderId,
                    buyerRefundMinor: refund.buyerRefundMinor,
                    feeCreditMinor: refund.feeCreditMinor,
                    recoveredMinor: refund.recoveredMinor,
                    currency,
                    supplierName: null,
                    currentClaim: refund.supplierClaim,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
