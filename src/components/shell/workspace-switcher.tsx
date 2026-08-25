"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";

export function WorkspaceSwitcher({
  current, workspaces,
}: {
  current: { id: string; name: string; role: Role };
  workspaces: { id: string; name: string; role: Role }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const switchTo = async (id: string) => {
    if (id === current.id) { setOpen(false); return; }
    setPending(id);
    await fetch("/api/workspace/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    });
    setOpen(false);
    setPending(null);
    router.push("/dashboard");
    router.refresh();
  };

  if (workspaces.length <= 1) {
    return (
      <div className="hidden min-w-0 items-center gap-2 px-2 sm:flex">
        <span className="truncate text-base font-medium text-ink">{current.name}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-base font-medium text-ink transition-colors hover:bg-surface-hover"
      >
        <span className="max-w-[7rem] truncate sm:max-w-[12rem]">{current.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Switch workspace"
          className="animate-scale-in absolute left-0 z-50 mt-1.5 w-64 origin-top-left rounded-xl border border-line bg-surface-raised p-1 shadow-overlay"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              role="option"
              aria-selected={w.id === current.id}
              disabled={pending !== null}
              onClick={() => switchTo(w.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-60",
                w.id === current.id ? "bg-brand-soft" : "hover:bg-surface-hover",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-muted">
                <Building2 className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-ink">{w.name}</span>
                <span className="block text-xs text-ink-muted">{ROLE_LABELS[w.role]}</span>
              </span>
              {w.id === current.id ? <Check className="size-4 shrink-0 text-brand" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
