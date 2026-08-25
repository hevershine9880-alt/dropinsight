"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Drives the background worker from the browser while someone is using the app.
 *
 * In production this endpoint is called by cron or a queue runner and this
 * component is unnecessary; in development it is what makes "it refreshes every
 * minute" true without asking the user to run a second process. It backs off
 * completely when the tab is hidden, so a forgotten tab is not a load source.
 */
const INTERVAL_MS = 60_000;

export function SyncPoller() {
  const router = useRouter();
  const running = React.useRef(false);

  React.useEffect(() => {
    let timer: number;

    const runTick = async () => {
      if (running.current || document.hidden) return;
      running.current = true;
      try {
        const response = await fetch("/api/jobs/tick", { method: "POST" });
        if (response.ok) {
          const result = (await response.json()) as { ordersImported?: number };
          // Only disturb the page when something actually changed.
          if ((result.ordersImported ?? 0) > 0) router.refresh();
        }
      } catch {
        // A failed tick is not worth telling the user about; the next one retries.
      } finally {
        running.current = false;
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await runTick();
        schedule();
      }, INTERVAL_MS);
    };

    schedule();
    const onVisible = () => { if (!document.hidden) void runTick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
