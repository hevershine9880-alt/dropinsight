"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/table/filter-chips";
import { useToast } from "@/components/ui/toast";
import { useQueryState } from "@/lib/use-query-state";
import {
  markNotificationReadAction, markAllNotificationsReadAction, deleteNotificationAction,
} from "@/server/actions/notifications";
import { cn } from "@/lib/cn";
import {
  BellOff, CheckCheck, AlertOctagon, AlertTriangle, Info, ArrowRight, Trash2, Check, Circle,
} from "lucide-react";

interface NotificationView {
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
  CRITICAL: { icon: AlertOctagon, chip: "bg-negative-soft text-negative", label: "Critical" },
  WARNING: { icon: AlertTriangle, chip: "bg-caution-soft text-caution", label: "Warning" },
  INFO: { icon: Info, chip: "bg-surface-sunken text-ink-muted", label: "Information" },
};

export function AlertsList({
  notifications, counts, filter,
}: {
  notifications: NotificationView[];
  counts: { all: number; unread: number; critical: number };
  filter: string;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { set } = useQueryState();

  const markAll = async () => {
    setMarkingAll(true);
    const result = await markAllNotificationsReadAction();
    setMarkingAll(false);
    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't mark those read", description: result.error });
      return;
    }
    toast({ tone: "success", title: `${result.data!.marked} alerts marked read` });
    router.refresh();
  };

  const toggleRead = async (notification: NotificationView) => {
    setPending(notification.id);
    await markNotificationReadAction(notification.id, notification.readAt === null);
    setPending(null);
    router.refresh();
  };

  const remove = async (notification: NotificationView) => {
    setPending(notification.id);
    const result = await deleteNotificationAction(notification.id);
    setPending(null);
    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't remove that", description: result.error });
      return;
    }
    toast({ tone: "success", title: "Alert removed" });
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Alert filter"
          value={filter}
          onChange={(next) => set({ filter: next === "all" ? null : next })}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "unread", label: "Unread", count: counts.unread },
            { value: "critical", label: "Needs attention", count: counts.critical },
          ]}
        />
        {counts.unread > 0 ? (
          <Button variant="secondary" onClick={() => void markAll()} loading={markingAll}>
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={BellOff}
            tone="positive"
            title={filter === "unread" ? "Nothing unread" : "Nothing needs you"}
            description={
              filter === "unread"
                ? "You are on top of everything. New alerts appear here as they happen."
                : "DropInsight raises an alert when a sync fails, a refund needs an answer, a margin drops or an automation fires. Nothing has."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {notifications.map((notification) => {
              const severity = SEVERITY[notification.severity as keyof typeof SEVERITY] ?? SEVERITY.INFO;
              const unread = notification.readAt === null;

              return (
                <li
                  key={notification.id}
                  className={cn("flex items-start gap-3 px-5 py-3.5", unread && "bg-brand-soft/30")}
                >
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", severity.chip)}>
                    <severity.icon className="size-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={cn("text-base", unread ? "font-semibold text-ink" : "font-medium text-ink-muted")}>
                        {notification.title}
                      </h2>
                      {unread ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-medium text-brand">
                          <Circle className="size-1.5 fill-current" aria-hidden />
                          <span className="sr-only">Unread</span>
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-md leading-relaxed text-ink-muted">{notification.body}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <time
                        dateTime={notification.createdAt}
                        title={format(new Date(notification.createdAt), "d MMM yyyy 'at' HH:mm")}
                        className="text-xs text-ink-subtle"
                      >
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </time>
                      {notification.actionHref ? (
                        <Link
                          href={notification.actionHref}
                          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                        >
                          {notification.actionLabel ?? "Open"}
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void toggleRead(notification)}
                      disabled={pending === notification.id}
                      aria-label={unread ? `Mark as read: ${notification.title}` : `Mark as unread: ${notification.title}`}
                      className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-50"
                    >
                      {unread ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(notification)}
                      disabled={pending === notification.id}
                      aria-label={`Remove: ${notification.title}`}
                      className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-negative-soft hover:text-negative disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
