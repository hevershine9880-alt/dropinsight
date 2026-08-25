"use client";

import { Money } from "@/components/domain/money";
import { useQueryState } from "@/lib/use-query-state";
import { cn } from "@/lib/cn";
import {
  VERDICT_META, ACTIONABLE_VERDICTS, LISTING_VERDICTS, HEALTH_THRESHOLDS,
  type ListingVerdict,
} from "@/lib/finance/listing-health";
import type { ProductRow } from "@/lib/finance/products-query";
import {
  TrendingDown, AlertTriangle, RotateCcw, Minus, Tag, Trophy, CheckCircle2,
  ArrowRight, LayoutGrid,
} from "lucide-react";

export const VERDICT_ICONS: Record<ListingVerdict, React.ComponentType<{ className?: string }>> = {
  losing_money: TrendingDown,
  below_break_even: AlertTriangle,
  refund_prone: RotateCcw,
  thin_margin: Minus,
  needs_pricing: Tag,
  winner: Trophy,
  steady: CheckCircle2,
};

/**
 * Selected chips use the same filled treatment as every other filter in the
 * app, tinted by what the verdict means. "All" takes the brand fill, matching
 * the segmented controls on Orders and Returns.
 */
const ACTIVE_TONE: Record<string, string> = {
  negative: "border-negative bg-negative text-white",
  caution: "border-caution bg-caution text-white",
  positive: "border-positive bg-positive text-white",
  brand: "border-brand bg-brand text-white",
  neutral: "border-brand bg-brand text-white",
};

const IDLE_TONE: Record<string, string> = {
  negative: "text-negative-ink",
  caution: "text-caution-ink",
  positive: "text-positive-ink",
  brand: "text-brand-ink",
  neutral: "text-ink-muted",
};

/**
 * "Which listings should I deal with today?"
 *
 * One row of chips rather than a wall of cards: the table is the point of this
 * page, and a summary that pushes it below the fold is a summary that gets
 * scrolled past. Every listing is counted once, under whichever verdict matters
 * most, so the counts add up to the total.
 */
export function ListingHealthSummary({
  products, currency,
}: {
  products: ProductRow[];
  currency: string;
}) {
  const { get, set } = useQueryState();
  const active = get("health") as ListingVerdict | "";

  const groups = LISTING_VERDICTS.map((verdict) => {
    const matching = products.filter((p) => p.health.verdict === verdict);
    return {
      verdict,
      count: matching.length,
      atRiskMinor: matching.reduce((sum, p) => sum + (p.health.atRiskMinor ?? 0), 0),
      profitMinor: matching.reduce((sum, p) => sum + p.profitMinor, 0),
    };
  }).filter((g) => g.count > 0 || ACTIONABLE_VERDICTS.includes(g.verdict));

  const problems = groups.filter(
    (g) => g.verdict !== "winner" && g.verdict !== "steady" && g.count > 0,
  );
  const problemCount = problems.reduce((sum, g) => sum + g.count, 0);
  const atRiskMinor = problems.reduce((sum, g) => sum + g.atRiskMinor, 0);
  const worstVerdict = problems[0]?.verdict;

  return (
    <section aria-labelledby="listing-health-heading" className="space-y-2.5">
      <h2 id="listing-health-heading" className="sr-only">Listing performance</h2>

      {/* The banner stacks on a phone: side by side, the sentence is squeezed
          into a six-line column beside a button that refuses to shrink. */}
      {problemCount > 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-caution/25 bg-caution-soft px-4 py-2.5 sm:flex-row sm:items-center sm:gap-x-3">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caution sm:mt-0" aria-hidden />
            <p className="min-w-0 text-md text-caution-ink">
            <strong className="font-semibold">
              {problemCount === 1 ? "1 listing needs" : `${problemCount} listings need`} attention
            </strong>
            {atRiskMinor > 0 ? (
              <> — <Money minor={atRiskMinor} currency={currency} /> at stake if nothing changes.</>
            ) : (
              "."
            )}
            </p>
          </div>
          {worstVerdict && active !== worstVerdict ? (
            <button
              type="button"
              onClick={() => set({ health: worstVerdict })}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-sm font-medium text-caution-ink shadow-sm transition-colors hover:bg-surface-hover"
            >
              Start with {VERDICT_META[worstVerdict].label.toLowerCase()}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : products.length > 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-positive/25 bg-positive-soft px-4 py-2.5">
          <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden />
          <p className="text-md text-positive-ink">
            <strong className="font-semibold">Every listing is pulling its weight.</strong> Nothing is
            losing money, priced below break-even or refunding unusually often.
          </p>
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Filter listings by verdict"
        className="scroll-fade-x -mx-1 flex w-full min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5"
      >
        <Chip
          label="All listings"
          count={products.length}
          icon={LayoutGrid}
          tone="neutral"
          active={!active}
          onClick={() => set({ health: null })}
        />
        {groups.map((group) => {
          const meta = VERDICT_META[group.verdict];
          return (
            <Chip
              key={group.verdict}
              label={meta.label}
              count={group.count}
              icon={VERDICT_ICONS[group.verdict]}
              tone={meta.tone}
              active={active === group.verdict}
              disabled={group.count === 0}
              title={meta.meaning}
              onClick={() => set({ health: active === group.verdict ? null : group.verdict })}
            />
          );
        })}
      </div>

      <p className="text-xs text-ink-subtle">
        {active ? (
          <>
            <strong className="font-medium text-ink-muted">{VERDICT_META[active].label}:</strong>{" "}
            {VERDICT_META[active].meaning}
          </>
        ) : (
          <>
            Each listing is counted once, under whichever verdict matters most. Thin means under{" "}
            {(HEALTH_THRESHOLDS.thinMarginRatio * 100).toFixed(0)}% margin; refund-prone means{" "}
            {(HEALTH_THRESHOLDS.refundProneRatio * 100).toFixed(0)}% of orders coming back across at least{" "}
            {HEALTH_THRESHOLDS.minSalesForRate} sales.
          </>
        )}
      </p>
    </section>
  );
}

function Chip({
  label, count, icon: Icon, tone, active, disabled, title, onClick,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !active}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? ACTIVE_TONE[tone]
          : cn("border-line bg-surface hover:border-line-strong", IDLE_TONE[tone]),
        disabled && !active && "cursor-not-allowed opacity-45",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
      <span className={cn("tabular text-2xs", active ? "text-white/75" : "text-ink-subtle")}>
        {count.toLocaleString()}
      </span>
    </button>
  );
}
