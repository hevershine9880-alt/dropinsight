"use client";

import * as React from "react";
import { Check, Clock, CircleSlash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { bulkAnswerClaimsAction } from "@/server/actions/refunds";
import type { SupplierClaim } from "@/lib/finance/types";

/**
 * Answer several supplier claims at once.
 *
 * "Received" and "not coming back" both move money, so they ask for
 * confirmation and state the consequence in plain terms first.
 */
export function BulkClaimBar({
  selectedIds, onDone, onClear,
}: {
  selectedIds: string[];
  onDone: () => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = React.useState<SupplierClaim | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  const apply = async (claim: SupplierClaim) => {
    setSaving(true);
    const result = await bulkAnswerClaimsAction({ refundIds: selectedIds, claim });
    setSaving(false);
    setConfirming(null);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't update those claims", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: `${result.data!.updated} refunds updated`,
      description: "Profit figures have been recalculated.",
    });
    onDone();
  };

  const COPY: Record<string, { title: string; message: string; label: string }> = {
    RECEIVED: {
      title: `Mark ${selectedIds.length} refunds as fully recovered?`,
      message: `This records that your suppliers paid back everything on ${selectedIds.length} refunds. The losses will disappear from your profit figures. Only do this if the money has actually arrived.`,
      label: "Yes, all recovered",
    },
    WRITTEN_OFF: {
      title: `Write off ${selectedIds.length} refunds?`,
      message: `This records that no supplier money is coming back on ${selectedIds.length} refunds. Their full value will count as a loss against your profit.`,
      label: "Yes, write them off",
    },
  };

  return (
    <>
      <div className="animate-rise flex flex-wrap items-center gap-3 border-y border-brand/25 bg-brand-soft px-4 py-2.5">
        <p className="text-base font-medium text-brand-ink">
          {selectedIds.length} refund{selectedIds.length === 1 ? "" : "s"} selected
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="positive" onClick={() => setConfirming("RECEIVED")}>
            <Check className="size-3.5" aria-hidden />
            All recovered
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void apply("PROMISED")} loading={saving}>
            <Clock className="size-3.5" aria-hidden />
            Promised
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming("WRITTEN_OFF")}>
            <CircleSlash className="size-3.5" aria-hidden />
            Write off
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && void apply(confirming)}
        title={confirming ? COPY[confirming].title : ""}
        message={confirming ? COPY[confirming].message : ""}
        confirmLabel={confirming ? COPY[confirming].label : "Confirm"}
        tone={confirming === "WRITTEN_OFF" ? "danger" : "primary"}
        loading={saving}
      />
    </>
  );
}
