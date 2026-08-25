"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/table/filter-chips";
import { useToast } from "@/components/ui/toast";
import { refreshInsightsAction, dismissInsightAction, restoreInsightAction } from "@/server/actions/insights";
import { useQueryState } from "@/lib/use-query-state";
import { cn } from "@/lib/cn";
import {
  RefreshCw, X, ArrowRight, Lightbulb, TrendingDown, RotateCcw,
  Coins, AlertTriangle, Tag, Clock, Undo2,
} from "lucide-react";

interface InsightView {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  actionHref: string | null;
  generatedAt: string;
  dismissed: boolean;
}

const KIND_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  DECLINING_MARGIN: { icon: TrendingDown, label: "Margins" },
  RISING_SUPPLIER_COST: { icon: Coins, label: "Supplier costs" },
  REFUND_PRONE: { icon: RotateCcw, label: "Refunds" },
  BELOW_BREAK_EVEN: { icon: AlertTriangle, label: "Pricing" },
  UNPRICED_BACKLOG: { icon: Tag, label: "Costing" },
  STALE_CHASE: { icon: Clock, label: "Recovery" },
};

const SEVERITY_TONE = {
  CRITICAL: { chip: "bg-negative-soft text-negative", badge: "negative" as const, label: "Needs action" },
  WARNING: { chip: "bg-caution-soft text-caution", badge: "caution" as const, label: "Worth a look" },
  INFO: { chip: "bg-brand-soft text-brand", badge: "brand" as const, label: "For information" },
};

export function InsightsList({
  insights, showDismissed, dismissedCount,
}: {
  insights: InsightView[];
  showDismissed: boolean;
  dismissedCount: number;
}) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { set } = useQueryState();

  const refresh = async () => {
    setRefreshing(true);
    const result = await refreshInsightsAction();
    setRefreshing(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't refresh", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: "Insights refreshed",
      description: `${result.data!.count} findings checked against your latest orders.`,
    });
    router.refresh();
  };

  const dismiss = async (insight: InsightView) => {
    setPending(insight.id);
    const result = await dismissInsightAction(insight.id);
    setPending(null);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't dismiss", description: result.error });
      return;
    }
    toast({
      tone: "info",
      title: "Dismissed",
      description: insight.title,
      onUndo: async () => {
        await restoreInsightAction(insight.id);
        router.refresh();
      },
    });
    router.refresh();
  };

  const restore = async (insight: InsightView) => {
    setPending(insight.id);
    await restoreInsightAction(insight.id);
    setPending(null);
    toast({ tone: "success", title: "Restored", description: insight.title });
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Insight state"
          value={showDismissed ? "dismissed" : "active"}
          onChange={(next) => set({ show: next === "dismissed" ? "dismissed" : null })}
          options={[
            { value: "active", label: "Active" },
            { value: "dismissed", label: "Dismissed", count: dismissedCount },
          ]}
        />
        <Button variant="secondary" onClick={() => void refresh()} loading={refreshing}>
          <RefreshCw className="size-4" aria-hidden />
          Refresh insights
        </Button>
      </div>

      {insights.length === 0 ? (
        <Card>
          <EmptyState
            icon={Lightbulb}
            tone={showDismissed ? "neutral" : "positive"}
            title={showDismissed ? "Nothing dismissed" : "Nothing worth flagging"}
            description={
              showDismissed
                ? "Findings you dismiss are kept here in case you change your mind."
                : "Margins are holding, supplier costs are steady and no product is refunding unusually often. Insights are rechecked as new orders arrive."
            }
            action={
              !showDismissed ? (
                <Button variant="secondary" onClick={() => void refresh()} loading={refreshing}>
                  <RefreshCw className="size-4" aria-hidden />
                  Check again now
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {insights.map((insight) => {
            const meta = KIND_META[insight.kind] ?? { icon: Lightbulb, label: "Insight" };
            const tone = SEVERITY_TONE[insight.severity as keyof typeof SEVERITY_TONE] ?? SEVERITY_TONE.INFO;

            return (
              <li key={insight.id}>
                <Card className={cn("p-4", insight.dismissed && "opacity-70")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tone.chip)}>
                      <meta.icon className="size-4.5" aria-hidden />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-ink">{insight.title}</h2>
                        <Badge tone={tone.badge}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1 text-md leading-relaxed text-ink-muted">{insight.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <time dateTime={insight.generatedAt} className="text-xs text-ink-subtle">
                          Found {formatDistanceToNow(new Date(insight.generatedAt), { addSuffix: true })}
                        </time>
                        {insight.actionHref ? (
                          <Link
                            href={insight.actionHref}
                            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                          >
                            Take a look
                            <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {insight.dismissed ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        loading={pending === insight.id}
                        onClick={() => void restore(insight)}
                      >
                        <Undo2 className="size-3.5" aria-hidden />
                        Restore
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void dismiss(insight)}
                        disabled={pending === insight.id}
                        aria-label={`Dismiss: ${insight.title}`}
                        className="-m-1 shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-50"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
