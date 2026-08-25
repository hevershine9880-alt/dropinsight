import * as React from "react";
import { cn } from "@/lib/cn";

const TONES = {
  neutral: "bg-surface-sunken text-ink-muted ring-line",
  brand: "bg-brand-soft text-brand-ink ring-brand/20",
  positive: "bg-positive-soft text-positive-ink ring-positive/25",
  negative: "bg-negative-soft text-negative-ink ring-negative/25",
  caution: "bg-caution-soft text-caution-ink ring-caution/30",
  info: "bg-info-soft text-info-ink ring-info/25",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral", icon: Icon, className, children, ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {/* An icon accompanies every tone so status is never carried by colour alone. */}
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}
