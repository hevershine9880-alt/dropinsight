import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Standard page heading. Every page uses it, so the eye lands in the same place
 * on every navigation and the h1 is always where a screen reader expects it.
 */
export function PageHeader({
  title, description, icon: Icon, actions, children, className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 hidden size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand sm:grid">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-md text-ink-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** The consistent page frame: max width, gutters, vertical rhythm. */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-[104rem] space-y-5 px-4 py-5 sm:px-6 sm:py-6", className)} {...props} />;
}
