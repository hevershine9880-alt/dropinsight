"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAVIGATION, isActive } from "@/lib/nav";
import { can, type Role } from "@/lib/auth/permissions";
import { Wordmark, LogoMark } from "@/components/brand/logo";
import { ConnectionPill } from "./connection-pill";
import { PlanCard } from "./plan-card";
import { QuickActions } from "./quick-actions";
import { X } from "lucide-react";

/** Work waiting on the reader, one number per nav item that has any. */
export interface SidebarCounts {
  orders: number;
  refunds: number;
  alerts: number;
  accounts: number;
}

export interface ConnectionSummary {
  id: string;
  username: string;
  status: string;
  isMock: boolean;
}

export interface PlanSummary {
  plan: string;
  status: string;
  accountsUsed: number;
  accountLimit: number;
  trialEndsAt: string | null;
  renewsAt: string | null;
}

/** Every badge counts work waiting on the reader, and says so out loud. */
const COUNT_NOUNS: Record<string, string> = {
  orders: "orders with no buying price yet",
  refunds: "refunds needing an answer",
  alerts: "unread alerts",
  accounts: "accounts needing attention",
};

function countNoun(counter: string): string {
  return COUNT_NOUNS[counter] ?? "items";
}

/** Nav badges are a glance, not a figure: 2,245 becomes 2.2k. */
function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

export function Sidebar({
  role, counts, connections, plan, collapsed, mobileOpen, onCloseMobile,
}: {
  role: Role;
  counts: SidebarCounts;
  connections: ConnectionSummary[];
  plan: PlanSummary;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();

  // Close the mobile drawer whenever navigation happens, otherwise the user
  // lands on the new page with the menu still covering it.
  React.useEffect(() => { onCloseMobile(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a laptop the nav is taller than the space it has, so the page you are
  // on can sit below the fold — leaving the sidebar with nothing highlighted
  // and no clue where you are. Bring the current item into view.
  const navRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const current = navRef.current?.querySelector('[aria-current="page"]');
    if (!(current instanceof HTMLElement)) return;
    const nav = navRef.current!;
    const top = current.offsetTop;
    const bottom = top + current.offsetHeight;
    if (top < nav.scrollTop || bottom > nav.scrollTop + nav.clientHeight) {
      current.scrollIntoView({ block: "nearest" });
    }
  }, [pathname]);

  const groups = NAVIGATION
    .map((group) => ({ ...group, items: group.items.filter((i) => can(role, i.permission)) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {mobileOpen ? (
        <div
          className="animate-fade-in fixed inset-0 z-40 bg-navy-950/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col bg-sidebar text-sidebar-ink",
          "transition-[width,transform] duration-250 ease-[var(--ease-out-soft)]",
          "lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-64",
          "w-72",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className={cn("flex h-16 shrink-0 items-center justify-between px-4", collapsed && "lg:justify-center lg:px-2")}>
          <Link href="/dashboard" className="flex items-center rounded-lg" aria-label="DropInsight — go to dashboard">
            {collapsed ? <LogoMark className="hidden size-8 lg:block" /> : null}
            <span className={cn(collapsed && "lg:hidden")}>
              <Wordmark tagline inverse size="sm" />
            </span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            className="-mr-1 rounded-lg p-1.5 text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav ref={navRef} className="scroll-fade-y min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pt-1 pb-6">
          {groups.map((group, index) => (
            <div key={group.label ?? `group-${index}`}>
              {group.label ? (
                <h2
                  className={cn(
                    "px-2.5 pb-1.5 text-2xs font-semibold tracking-wider text-sidebar-ink-muted uppercase",
                    collapsed && "lg:sr-only",
                  )}
                >
                  {group.label}
                </h2>
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  const count = item.counter ? counts[item.counter] : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-base font-medium transition-colors duration-150",
                          active
                            ? "bg-sidebar-active text-white"
                            : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink",
                          collapsed && "lg:justify-center lg:px-2",
                        )}
                      >
                        <item.icon className="size-4.5 shrink-0" aria-hidden />
                        <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{item.label}</span>
                        {count > 0 ? (
                          <span
                            className={cn(
                              "tabular shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-semibold",
                              active ? "bg-white/20 text-white" : "bg-white/8 text-sidebar-ink-muted",
                              collapsed && "lg:absolute lg:top-1 lg:right-1 lg:px-1 lg:py-0",
                            )}
                          >
                            <span aria-hidden>{formatCount(count)}</span>
                            <span className="sr-only">
                              , {count.toLocaleString()} {countNoun(item.counter!)}
                            </span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className={cn(collapsed && "lg:hidden")}>
            <QuickActions role={role} />
          </div>
        </nav>

        <div className={cn("shrink-0 space-y-2 border-t border-sidebar-line p-3", collapsed && "lg:px-2")}>
          <div className={cn(collapsed && "lg:hidden")}>
            <PlanCard plan={plan} canManage={can(role, "billing.manage")} />
          </div>
          <ConnectionPill connections={connections} collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
