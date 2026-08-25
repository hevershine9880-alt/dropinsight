import * as React from "react";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-hover shadow-sm",
  ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink",
  subtle: "bg-surface-sunken text-ink hover:bg-line",
  danger: "bg-negative text-white hover:brightness-95 shadow-sm",
  positive: "bg-positive text-white hover:brightness-95 shadow-sm",
  link: "text-brand hover:underline underline-offset-4 p-0 h-auto",
} as const;

const SIZES = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-2.5 text-sm gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-base gap-2 rounded-lg",
  lg: "h-11 px-5 text-md gap-2 rounded-xl",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  /** Text announced while `loading` — screen readers get progress, not silence. */
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, loadingLabel = "Working…", children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap",
        "transition-[background-color,color,box-shadow,opacity] duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        variant !== "link" && SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin-slow" aria-hidden />}
      {loading ? <span className="sr-only">{loadingLabel}</span> : null}
      {children}
    </button>
  );
});
