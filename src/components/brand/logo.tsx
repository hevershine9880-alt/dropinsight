import { cn } from "@/lib/cn";

/**
 * The DropInsight mark: three ascending bars — the "track, analyse, grow" idea
 * as a single glyph — with a drop notched out of the tallest bar.
 * Drawn as SVG so it stays crisp and inherits colour from its context.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id="di-mark" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-indigo-600)" />
          <stop offset="100%" stopColor="var(--color-indigo-400)" />
        </linearGradient>
      </defs>
      <rect x="2" y="20" width="7" height="10" rx="2.5" fill="url(#di-mark)" opacity="0.55" />
      <rect x="12" y="13" width="7" height="17" rx="2.5" fill="url(#di-mark)" opacity="0.8" />
      <rect x="22" y="4" width="7" height="26" rx="2.5" fill="url(#di-mark)" />
      <circle cx="25.5" cy="9" r="2.25" fill="var(--color-mint-400)" />
    </svg>
  );
}

export function Wordmark({
  className, tagline = false, size = "md", inverse = false,
}: {
  className?: string;
  tagline?: boolean;
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
}) {
  const text = { sm: "text-base", md: "text-xl", lg: "text-2xl" }[size];
  const mark = { sm: "size-6", md: "size-8", lg: "size-9" }[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={mark} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-semibold tracking-tight", text, inverse ? "text-white" : "text-ink")}>
          Drop<span className="text-brand">Insight</span>
        </span>
        {tagline ? (
          <span className={cn("mt-1 text-2xs font-medium tracking-wide", inverse ? "text-sidebar-ink-muted" : "text-ink-subtle")}>
            Track · Analyse · Grow
          </span>
        ) : null}
      </span>
    </span>
  );
}
