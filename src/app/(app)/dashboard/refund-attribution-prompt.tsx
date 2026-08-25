"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarRange, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setRefundAttributionAction } from "@/server/actions/workspace";
import { REFUND_ATTRIBUTION_COPY, type RefundAttribution } from "@/lib/finance/types";

/**
 * The one-time question from the reference product, kept because it is a
 * genuinely good piece of product design: it asks the single accounting
 * decision that changes every number, up front, with a worked example.
 *
 * Dismissal is remembered locally — the setting always remains changeable in
 * Settings → General, which the copy states.
 */
export function RefundAttributionPrompt({
  workspaceId, current,
}: {
  workspaceId: string;
  current: RefundAttribution;
}) {
  const [dismissed, setDismissed] = React.useState(true);
  const [pending, setPending] = React.useState<RefundAttribution | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const storageKey = `di-refund-attribution-answered-${workspaceId}`;

  React.useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  const choose = async (value: RefundAttribution) => {
    setPending(value);
    const result = await setRefundAttributionAction(value);
    setPending(null);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't save that", description: result.error });
      return;
    }

    localStorage.setItem(storageKey, "1");
    setDismissed(true);
    toast({
      tone: "success",
      title: "Saved",
      description: `Refund losses now count in ${REFUND_ATTRIBUTION_COPY[value].title.toLowerCase()}.`,
    });
    router.refresh();
  };

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  if (dismissed) return null;

  const options: { value: RefundAttribution; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "REFUND_MONTH", icon: CalendarClock },
    { value: "ORDER_MONTH", icon: CalendarRange },
  ];

  return (
    <section className="relative rounded-xl border border-brand/20 bg-brand-soft/50 p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss — keep the current setting"
        className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-subtle hover:bg-surface/60 hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>

      <h2 className="pr-8 text-lg font-semibold">One quick choice: which month should a refund&rsquo;s loss count in?</h2>
      <p className="mt-1 max-w-3xl text-md text-ink-muted">
        This sets how your dashboard, analytics and reports <em>date</em> refund losses. Pick whichever
        matches how you close your months — nothing stored changes, and you can switch it any time in Settings.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {options.map(({ value, icon: Icon }) => {
          const copy = REFUND_ATTRIBUTION_COPY[value];
          const active = current === value;
          return (
            <div
              key={value}
              className={cn(
                "flex flex-col rounded-xl border bg-surface p-4",
                active ? "border-brand ring-1 ring-brand/25" : "border-line",
              )}
            >
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                {copy.title}
              </h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">
                <strong className="font-medium text-ink">{copy.example}</strong> {copy.rationale}
              </p>
              <Button
                variant={active ? "subtle" : "secondary"}
                size="sm"
                className="mt-3 self-start"
                loading={pending === value}
                disabled={active}
                onClick={() => choose(value)}
              >
                {active ? "Currently using this" : "Use this"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
