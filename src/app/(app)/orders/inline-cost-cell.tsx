"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney, toDecimalString } from "@/lib/money";
import { setCostAction, suggestCostAction } from "@/server/actions/costs";
import { useToast } from "@/components/ui/toast";
import type { OrderRow } from "@/lib/finance/orders-query";

/**
 * Inline "Add cost" from the orders table.
 *
 * Built for volume, because entering a few hundred buying prices is the single
 * most repetitive thing this product asks of anyone:
 *  - opens pre-filled with the suggestion from that product's own cost history
 *  - Enter saves, Escape cancels, focus stays where the hand already is
 *
 * A multi-line order cannot be costed from one cell — its lines have different
 * products and different suppliers — so it links to the detail page instead of
 * pretending a single number would do.
 */
export function InlineCostCell({
  row, currency, editable, onSaved,
}: {
  row: OrderRow;
  currency: string;
  editable: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<{ unitCostMinor: number; basis: string } | null>(null);
  // The suggestion arrives asynchronously. If the user has already started
  // typing by then, their value wins — never overwrite what somebody typed.
  const touched = React.useRef(false);
  const { toast } = useToast();

  const priced = row.profit.isPriced;
  const costMinor = row.profit.costOfGoodsMinor;
  const singleLine = row.lines.length === 1 ? row.lines[0] : null;

  if (row.profit.isNonLossCancellation) {
    return <span className="text-ink-subtle" title="Cancelled before anything was bought from a supplier">—</span>;
  }

  if (!editable) {
    return priced
      ? <span className="tabular">{formatMoney(costMinor, currency)}</span>
      : <span className="text-ink-subtle">—</span>;
  }

  if (!singleLine) {
    return (
      <Link
        href={`/orders/${row.id}`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-brand hover:bg-brand-soft"
      >
        {priced ? formatMoney(costMinor, currency) : `Cost ${row.lines.length} lines`}
      </Link>
    );
  }

  const open = async () => {
    touched.current = false;
    setEditing(true);
    setValue(singleLine.unitCostMinor !== null ? toDecimalString(singleLine.unitCostMinor, currency) : "");

    const result = await suggestCostAction(singleLine.id);
    if (result.ok && result.data) {
      setSuggestion({ unitCostMinor: result.data.unitCostMinor, basis: result.data.basis });
      // Pre-fill only when the field is empty and untouched.
      if (singleLine.unitCostMinor === null && !touched.current) {
        setValue(toDecimalString(result.data.unitCostMinor, currency));
      }
    }
  };

  const close = () => { setEditing(false); setSuggestion(null); touched.current = false; };

  const save = async () => {
    if (!value.trim()) { close(); return; }
    setSaving(true);
    const result = await setCostAction({ orderItemId: singleLine.id, unitCost: value });
    setSaving(false);

    if (!result.ok) {
      toast({
        tone: "error",
        title: "Couldn't save that price",
        description: result.fieldErrors?.unitCost ?? result.error,
      });
      return;
    }
    close();
    toast({
      tone: "success",
      title: "Buying price saved",
      description: `${row.ebayOrderId} now has a profit figure.`,
    });
    onSaved();
  };

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <div className="relative">
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => { touched.current = true; setValue(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void save(); }
              if (e.key === "Escape") { e.preventDefault(); close(); }
            }}
            aria-label={`Buying price per unit for order ${row.ebayOrderId}`}
            placeholder="0.00"
            className="tabular h-7 w-20 rounded-md border border-brand bg-surface px-2 text-right text-sm ring-2 ring-brand/20 outline-none"
          />
          {suggestion ? (
            <span className="animate-fade-in absolute top-full right-0 z-20 mt-1 flex items-center gap-1 rounded-md bg-navy-900 px-1.5 py-1 text-2xs whitespace-nowrap text-white shadow-overlay">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              Suggested from {suggestion.basis}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          aria-label="Save buying price"
          className="grid size-6 place-items-center rounded-md bg-positive text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3 animate-spin-slow" aria-hidden /> : <Check className="size-3" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Cancel"
          className="grid size-6 place-items-center rounded-md text-ink-subtle hover:bg-surface-hover"
        >
          <X className="size-3" aria-hidden />
        </button>
      </div>
    );
  }

  if (singleLine.unitCostMinor !== null) {
    return (
      <button
        type="button"
        onClick={() => void open()}
        className="tabular rounded-md px-1 py-0.5 transition-colors hover:bg-surface-hover"
        aria-label={`Change buying price for ${row.ebayOrderId}, currently ${formatMoney(costMinor, currency)}`}
      >
        {formatMoney(costMinor, currency)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-caution-ink",
        "transition-colors hover:bg-caution-soft",
      )}
      aria-label={`Add a buying price for ${row.ebayOrderId}`}
    >
      <Plus className="size-3" aria-hidden />
      Add cost
    </button>
  );
}
