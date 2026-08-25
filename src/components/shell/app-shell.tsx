"use client";

import * as React from "react";
import { Sidebar, type SidebarCounts, type ConnectionSummary, type PlanSummary } from "./sidebar";
import { Header } from "./header";
import { SyncPoller } from "./sync-poller";
import type { AuthContext } from "@/lib/auth/session";

export function AppShell({
  auth, counts, connections, plan, unreadCount, syncingActive, children,
}: {
  auth: AuthContext;
  counts: SidebarCounts;
  connections: ConnectionSummary[];
  plan: PlanSummary;
  unreadCount: number;
  syncingActive: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Persist the collapse preference; a wide table is worth 12rem to some
  // people and not to others.
  React.useEffect(() => {
    setCollapsed(localStorage.getItem("di-sidebar-collapsed") === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("di-sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-100 rounded-lg bg-brand px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <Sidebar
        role={auth.workspace.role}
        counts={counts}
        connections={connections}
        plan={plan}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          auth={auth}
          unreadCount={unreadCount}
          onToggleSidebar={toggleCollapsed}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      {syncingActive ? <SyncPoller /> : null}
    </div>
  );
}
