"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, AlertTriangle, Info, AlertOctagon, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDistanceToNow } from "date-fns";

interface NotificationItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionHref: string | null;
  readAt: string | null;
  createdAt: string;
}

const SEVERITY = {
  CRITICAL: { icon: AlertOctagon, className: "text-negative" },
  WARNING: { icon: AlertTriangle, className: "text-caution" },
  INFO: { icon: Info, className: "text-ink-muted" },
} as const;

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  React.useEffect(() => { setUnread(initialUnread); }, [initialUnread]);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/notifications?limit=8")
      .then((r) => r.json())
      .then((data: { notifications: NotificationItem[]; unread: number }) => {
        setItems(data.notifications);
        setUnread(data.unread);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  const markAllRead = async () => {
    setUnread(0);
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: new Date().toISOString() })) ?? null);
    await fetch("/api/notifications/read-all", { method: "POST" });
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <Bell className="size-4.5" aria-hidden />
        {unread > 0 ? (
          <span className="tabular absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-negative px-1 text-2xs font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="animate-scale-in absolute right-0 z-50 mt-1.5 w-[22rem] origin-top-right rounded-xl border border-line bg-surface-raised shadow-overlay"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-base font-semibold">Notifications</h2>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-brand hover:bg-brand-soft"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </header>

          <div className="max-h-96 overflow-y-auto">
            {loading && items === null ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                <Loader2 className="size-4 animate-spin-slow" aria-hidden />
                Loading
              </div>
            ) : items && items.length > 0 ? (
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const { icon: Icon, className } = SEVERITY[item.severity as keyof typeof SEVERITY] ?? SEVERITY.INFO;
                  return (
                    <li key={item.id} className={cn("px-4 py-3", !item.readAt && "bg-brand-soft/40")}>
                      <div className="flex gap-2.5">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-medium text-ink">{item.title}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <time className="text-xs text-ink-subtle" dateTime={item.createdAt}>
                              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </time>
                            {item.actionHref ? (
                              <Link
                                href={item.actionHref}
                                onClick={() => setOpen(false)}
                                className="text-xs font-medium text-brand hover:underline"
                              >
                                {item.actionLabel ?? "Open"}
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-10 text-center">
                <p className="text-base font-medium text-ink">Nothing needs you</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Sync failures, refunds needing an answer and thin-margin orders show up here.
                </p>
              </div>
            )}
          </div>

          <footer className="border-t border-line px-4 py-2">
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-medium text-brand hover:underline"
            >
              See all alerts
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
