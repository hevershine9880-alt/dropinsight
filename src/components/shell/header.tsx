"use client";

import * as React from "react";
import { PanelLeft, Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { AuthContext } from "@/lib/auth/session";

export function Header({
  auth, unreadCount, onToggleSidebar, onOpenMobileNav,
}: {
  auth: AuthContext;
  unreadCount: number;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        aria-controls="app-sidebar"
        className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Collapse or expand navigation"
        aria-controls="app-sidebar"
        className="hidden size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink lg:grid"
      >
        <PanelLeft className="size-4.5" aria-hidden />
      </button>

      <WorkspaceSwitcher current={auth.workspace} workspaces={auth.workspaces} />

      <div className="mx-auto hidden max-w-md flex-1 md:block">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-0.5 md:ml-0">
        <div className="md:hidden">
          <GlobalSearch compact />
        </div>
        <NotificationBell initialUnread={unreadCount} />
        <ThemeToggle />
        <UserMenu user={auth.user} role={auth.workspace.role} />
      </div>
    </header>
  );
}
