"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, Info, X, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Toasts. Deliberately small: a message, an optional undo, and an auto-dismiss
 * that pauses when the pointer is over the stack so a user reading one does not
 * lose it mid-sentence.
 */

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Shown as an Undo button. Dismisses the toast when invoked. */
  onUndo?: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = React.useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>.");
  return value;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const paused = React.useRef(false);
  const timers = React.useRef(new Map<string, { remaining: number; startedAt: number; handle: number }>());

  React.useEffect(() => setMounted(true), []);

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer.handle);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const schedule = React.useCallback(
    (id: string, remaining: number) => {
      const handle = window.setTimeout(() => dismiss(id), remaining);
      timers.current.set(id, { remaining, startedAt: Date.now(), handle });
    },
    [dismiss],
  );

  const toast = React.useCallback(
    (input: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      const duration = input.durationMs ?? (input.onUndo ? 8000 : input.tone === "error" ? 7000 : 4500);
      setToasts((prev) => [...prev.slice(-3), { ...input, id }]);
      schedule(id, duration);
      return id;
    },
    [schedule],
  );

  // Pause the countdown while the user is reading.
  const onEnter = () => {
    if (paused.current) return;
    paused.current = true;
    for (const [id, timer] of timers.current) {
      window.clearTimeout(timer.handle);
      timers.current.set(id, { ...timer, remaining: timer.remaining - (Date.now() - timer.startedAt) });
    }
  };
  const onLeave = () => {
    if (!paused.current) return;
    paused.current = false;
    for (const [id, timer] of [...timers.current]) {
      schedule(id, Math.max(1200, timer.remaining));
    }
  };

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
              onMouseEnter={onEnter}
              onMouseLeave={onLeave}
            >
              {/* assertive for errors is handled per-toast below */}
              <ol className="flex w-full flex-col gap-2 sm:max-w-sm" aria-live="polite" aria-atomic="false">
                {toasts.map((t) => (
                  <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
                ))}
              </ol>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { icon: React.ComponentType<{ className?: string }>; ring: string; iconClass: string }> = {
  success: { icon: CheckCircle2, ring: "ring-positive/25", iconClass: "text-positive" },
  error: { icon: AlertTriangle, ring: "ring-negative/25", iconClass: "text-negative" },
  info: { icon: Info, ring: "ring-line", iconClass: "text-ink-muted" },
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, ring, iconClass } = TONE_STYLES[toast.tone];
  return (
    <li
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "animate-rise pointer-events-auto flex items-start gap-3 rounded-xl bg-surface-raised p-3.5 shadow-overlay ring-1",
        ring,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-sm text-ink-muted">{toast.description}</p> : null}
      </div>
      {toast.onUndo ? (
        <button
          type="button"
          onClick={() => { toast.onUndo?.(); onDismiss(); }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand hover:bg-brand-soft"
        >
          <Undo2 className="size-3.5" aria-hidden />
          Undo
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 shrink-0 rounded-md p-1 text-ink-subtle hover:bg-surface-hover hover:text-ink"
        aria-label="Dismiss"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}
