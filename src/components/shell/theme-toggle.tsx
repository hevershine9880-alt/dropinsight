"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

/**
 * Theme preference, persisted in localStorage. The initial class is applied by
 * an inline script in the document head (see layout.tsx) so the page never
 * flashes the wrong theme before hydration.
 */
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("system");
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setTheme((localStorage.getItem("di-theme") as Theme) ?? "system");
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (next: Theme) => {
    setTheme(next);
    setOpen(false);
    localStorage.setItem("di-theme", next);
    const dark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  };

  const options: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  const Current = options.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Theme: ${theme}. Change theme`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <Current className="size-4.5" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-scale-in absolute right-0 z-50 mt-1.5 w-36 origin-top-right rounded-xl border border-line bg-surface-raised p-1 shadow-overlay"
        >
          {options.map((option) => (
            <button
              key={option.value}
              role="menuitemradio"
              aria-checked={theme === option.value}
              onClick={() => apply(option.value)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-base transition-colors",
                theme === option.value ? "bg-brand-soft text-brand-ink" : "text-ink hover:bg-surface-hover",
              )}
            >
              <option.icon className="size-4" aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
