"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, SplitSquareHorizontal, CircleSlash, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { answerSupplierClaimAction, undoSupplierClaimAction } from "@/server/actions/refunds";
import { formatMoney, toDecimalString } from "@/lib/money";
import type { SupplierClaim } from "@/lib/finance/types";

/**
 * "Did you receive a supplier refund?" — the four-answer control. (R5.1)
 *
 * The three unambiguous answers apply in one click. Only "partly" opens a
 * dialog, because only that one needs a number. Each answer is undoable from
 * its toast for eight seconds, so a misclick on a financial record is cheap.
 */

export interface ClaimTarget {
  refundId: string;
  orderLabel: string;
  buyerRefundMinor: number;
  feeCreditMinor: number;
  recoveredMinor: number;
  currency: string;
  supplierName: string | null;
  currentClaim: string;
}

/**
 * "Received" is the primary answer because it is by far the most common one, so
 * it carries the filled treatment. The other three are secondary.
 *
 * The *current* answer is shown by a tinted fill in that answer's own colour
 * plus a ring — never by turning every selected button green, which would make
 * "Expecting it" read as "recovered".
 */
const OPTIONS: {
  claim: SupplierClaim;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  idle: string;
  selected: string;
  description: string;
}[] = [
  {
    claim: "RECEIVED", label: "Yes, received", shortLabel: "Received", icon: Check,
    idle: "bg-positive text-white hover:brightness-95",
    selected: "bg-positive text-white ring-2 ring-offset-1 ring-positive ring-offset-surface",
    description: "The supplier paid the whole thing back. The loss disappears from your profit.",
  },
  {
    claim: "PROMISED", label: "Expecting it", shortLabel: "Promised", icon: Clock,
    idle: "bg-surface text-ink border border-line hover:bg-surface-hover",
    selected: "bg-info-soft text-info-ink border border-info/40 ring-2 ring-offset-1 ring-info/50 ring-offset-surface",
    description: "They have agreed to refund you. It stays on the chase queue until it arrives.",
  },
  {
    claim: "PARTIAL", label: "Partly…", shortLabel: "Partial", icon: SplitSquareHorizontal,
    idle: "bg-surface text-ink border border-line hover:bg-surface-hover",
    selected: "bg-caution-soft text-caution-ink border border-caution/40 ring-2 ring-offset-1 ring-caution/50 ring-offset-surface",
    description: "Some of it came back. You will be asked how much.",
  },
  {
    claim: "WRITTEN_OFF", label: "No", shortLabel: "Not coming", icon: CircleSlash,
    idle: "bg-surface text-ink border border-line hover:bg-surface-hover",
    selected: "bg-negative-soft text-negative-ink border border-negative/40 ring-2 ring-offset-1 ring-negative/50 ring-offset-surface",
    description: "Nothing is coming back. The full amount counts as a loss.",
  },
];

export function SupplierClaimAnswer({
  target, size = "md", onAnswered,
}: {
  target: ClaimTarget;
  size?: "sm" | "md";
  onAnswered?: () => void;
}) {
  const [pending, setPending] = React.useState<SupplierClaim | null>(null);
  const [partialOpen, setPartialOpen] = React.useState(false);
  const [partialAmount, setPartialAmount] = React.useState("");
  const [partialError, setPartialError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const { toast } = useToast();
  const router = useRouter();

  const maxRecoverable = Math.max(0, target.buyerRefundMinor - target.feeCreditMinor);

  const answer = async (claim: SupplierClaim, extra?: { recovered?: string; notes?: string }) => {
    setPending(claim);
    const result = await answerSupplierClaimAction({
      refundId: target.refundId,
      claim,
      recovered: extra?.recovered,
      notes: extra?.notes,
    });
    setPending(null);

    if (!result.ok) {
      if (claim === "PARTIAL") {
        setPartialError(result.fieldErrors?.recovered ?? result.error ?? "Couldn't save that.");
        return;
      }
      toast({ tone: "error", title: "Couldn't record that answer", description: result.error });
      return;
    }

    const { previousClaim, previousRecoveredMinor, recoveredMinor } = result.data!;
    setPartialOpen(false);
    setPartialAmount("");
    setPartialError(null);

    toast({
      tone: "success",
      title:
        claim === "RECEIVED" ? `${formatMoney(recoveredMinor, target.currency)} recovered`
          : claim === "PARTIAL" ? `${formatMoney(recoveredMinor, target.currency)} recovered in part`
            : claim === "PROMISED" ? "Marked as promised"
              : "Written off",
      description:
        claim === "WRITTEN_OFF"
          ? `${target.orderLabel} now carries the full loss.`
          : claim === "PROMISED"
            ? `${target.orderLabel} stays on the chase queue.`
            : `${target.orderLabel} — profit has been recalculated.`,
      onUndo: async () => {
        await undoSupplierClaimAction({
          refundId: target.refundId,
          claim: previousClaim,
          recoveredMinor: previousRecoveredMinor,
        });
        router.refresh();
      },
    });

    onAnswered?.();
    router.refresh();
  };

  const buttonSize = size === "sm" ? "h-7 px-2 text-sm gap-1" : "h-9 px-3 text-base gap-1.5";

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Supplier refund answer for ${target.orderLabel}`}>
        {OPTIONS.map((option) => {
          const active = target.currentClaim === option.claim;
          return (
            <button
              key={option.claim}
              type="button"
              title={option.description}
              disabled={pending !== null}
              aria-pressed={active}
              onClick={() => {
                if (option.claim === "PARTIAL") {
                  setPartialAmount(target.recoveredMinor > 0 ? toDecimalString(target.recoveredMinor, target.currency) : "");
                  setPartialOpen(true);
                  return;
                }
                void answer(option.claim);
              }}
              className={cn(
                "inline-flex items-center rounded-lg font-medium transition-[background-color,box-shadow] disabled:opacity-60",
                buttonSize,
                active ? option.selected : option.idle,
              )}
            >
              {pending === option.claim ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin-slow" aria-hidden />
              ) : (
                <option.icon className="size-3.5 shrink-0" aria-hidden />
              )}
              {size === "sm" ? option.shortLabel : option.label}
              {active ? <span className="sr-only"> — this is the current answer</span> : null}
            </button>
          );
        })}
      </div>

      <Dialog
        open={partialOpen}
        onClose={() => { setPartialOpen(false); setPartialError(null); }}
        title="How much did the supplier pay back?"
        description={`${target.orderLabel} — you refunded ${formatMoney(target.buyerRefundMinor, target.currency)} and eBay credited ${formatMoney(target.feeCreditMinor, target.currency)} of fees, so ${formatMoney(maxRecoverable, target.currency)} is recoverable.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPartialOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={pending === "PARTIAL"}
              disabled={!partialAmount.trim()}
              onClick={() => void answer("PARTIAL", { recovered: partialAmount, notes: notes || undefined })}
            >
              Record recovery
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label={`Amount recovered (${target.currency})`}
            htmlFor="partial-amount"
            error={partialError}
            hint={`At most ${formatMoney(maxRecoverable, target.currency)}.`}
          >
            <Input
              id="partial-amount"
              data-autofocus
              inputMode="decimal"
              value={partialAmount}
              onChange={(e) => { setPartialAmount(e.target.value); setPartialError(null); }}
              placeholder="0.00"
              invalid={!!partialError}
            />
          </Field>

          <Field label="Note" htmlFor="partial-notes" hint="Optional. Useful when you chase the rest.">
            <Textarea
              id="partial-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Agreed 50% as a goodwill gesture — the rest is not coming."
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
