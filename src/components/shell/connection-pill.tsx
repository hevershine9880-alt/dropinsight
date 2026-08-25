"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ConnectionSummary } from "./sidebar";
import { AlertTriangle, PlugZap } from "lucide-react";

/**
 * The live connection indicator pinned to the bottom of the sidebar.
 * A dropshipper's first question every morning is "is my store still connected",
 * so the answer sits in permanent view rather than behind a settings page.
 */
export function ConnectionPill({
  connections, collapsed,
}: {
  connections: ConnectionSummary[];
  collapsed: boolean;
}) {
  if (connections.length === 0) {
    return (
      <Link
        href="/connect"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-dashed border-sidebar-line px-2.5 py-2 text-sm text-sidebar-ink-muted transition-colors hover:border-white/25 hover:text-sidebar-ink",
          collapsed && "lg:justify-center lg:px-2",
        )}
      >
        <PlugZap className="size-4 shrink-0" aria-hidden />
        <span className={cn(collapsed && "lg:hidden")}>Connect eBay</span>
      </Link>
    );
  }

  const broken = connections.filter((c) => c.status !== "CONNECTED");
  const healthy = broken.length === 0;
  const primary = connections[0];

  return (
    <Link
      href="/ebay-accounts"
      title={collapsed ? `${connections.length} eBay accounts` : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sidebar-hover",
        collapsed && "lg:justify-center lg:px-2",
      )}
    >
      {healthy ? (
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full rounded-full bg-mint-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-mint-400" />
        </span>
      ) : (
        <AlertTriangle className="size-4 shrink-0 text-rose-400" aria-hidden />
      )}
      <span className={cn("min-w-0 flex-1 truncate text-sidebar-ink-muted", collapsed && "lg:hidden")}>
        {broken.length > 0
          ? `${broken.length} account${broken.length > 1 ? "s" : ""} need attention`
          : connections.length === 1
            ? `eBay: ${primary.username}`
            : `${connections.length} eBay accounts`}
      </span>
      <span className="sr-only">
        {healthy ? "All eBay accounts connected" : `${broken.length} eBay accounts need attention`}
      </span>
    </Link>
  );
}
