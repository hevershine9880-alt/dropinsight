import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/cn";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * Money on screen.
 *
 * `signed` colours the value by sign, but always alongside a sign character —
 * a red number and a green number must still be distinguishable in greyscale.
 */
export function Money({
  minor, currency, signed = false, compact = false, className, muteZero = false,
}: {
  minor: number;
  currency: string;
  signed?: boolean;
  compact?: boolean;
  className?: string;
  /** Render an em dash instead of a formatted zero. */
  muteZero?: boolean;
}) {
  if (muteZero && minor === 0) {
    return <span className={cn("tabular text-ink-subtle", className)}>—</span>;
  }
  const tone = !signed ? "" : minor > 0 ? "text-positive" : minor < 0 ? "text-negative" : "text-ink-muted";
  // An amount never breaks across lines: "−" left hanging above "£51.47" reads
  // as a dash and a number rather than a negative figure.
  return (
    <span className={cn("tabular whitespace-nowrap", tone, className)}>
      {formatMoney(minor, currency, { compact })}
    </span>
  );
}

/** A percentage that may legitimately be unknown. */
export function Percent({ ratio, digits = 1, className }: { ratio: number | null; digits?: number; className?: string }) {
  if (ratio === null) return <span className={cn("tabular text-ink-subtle", className)}>—</span>;
  return <span className={cn("tabular", className)}>{formatPercent(ratio, { digits })}</span>;
}

/**
 * Period-over-period delta. `invert` is for metrics where up is bad — refunds,
 * losses, expenses — so growth in a loss reads red, not green.
 */
export function Delta({
  ratio, comparedTo, invert = false, className, showLabel = true,
}: {
  ratio: number | null;
  comparedTo?: string;
  invert?: boolean;
  className?: string;
  showLabel?: boolean;
}) {
  if (ratio === null) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-ink-subtle", className)}>
        <Minus className="size-3" aria-hidden />
        no comparison
      </span>
    );
  }

  const flat = Math.abs(ratio) < 0.0005;
  const good = invert ? ratio < 0 : ratio > 0;
  const Icon = flat ? Minus : ratio > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-ink-muted" : good ? "text-positive" : "text-negative";

  // Comparing against a near-empty period produces figures like "4,162.9%",
  // which nobody reads as a quantity. Past ten-fold, a multiplier is the
  // honest shape of the number.
  const change = flat
    ? "no change"
    : ratio >= 10
      ? `${Math.round(1 + ratio).toLocaleString()}×`
      : formatPercent(Math.abs(ratio));

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <span className={cn("inline-flex items-center gap-0.5 font-medium", tone)}>
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="tabular">{change}</span>
      </span>
      {showLabel && comparedTo ? <span className="text-ink-subtle">vs {comparedTo}</span> : null}
    </span>
  );
}
