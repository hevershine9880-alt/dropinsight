"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Explanatory tooltip. Opens on hover *and* on focus, so keyboard users get the
 * same explanation, and closes on Escape.
 */
export function InfoTip({ label, children, className }: { label: string; children?: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="inline-grid size-4 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink-muted"
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="animate-fade-in absolute bottom-full left-1/2 z-50 mb-1.5 w-60 -translate-x-1/2 rounded-lg bg-navy-900 px-2.5 py-2 text-xs leading-relaxed font-normal text-white shadow-overlay dark:bg-navy-800"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
