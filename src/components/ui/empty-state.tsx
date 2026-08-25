import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Empty states say three things, always in this order: what is empty, why it is
 * empty, and the one thing to do about it. An empty state without the middle
 * part reads as a bug.
 */
export function EmptyState({
  icon: Icon, title, description, action, secondary, className, tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
  tone?: "neutral" | "positive" | "caution";
}) {
  const ring = {
    neutral: "bg-surface-sunken text-ink-subtle",
    positive: "bg-positive-soft text-positive",
    caution: "bg-caution-soft text-caution",
  }[tone];

  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div className={cn("mb-4 grid size-12 place-items-center rounded-2xl", ring)}>
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-md text-balance text-md text-ink-muted">{description}</p>
      {action || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
