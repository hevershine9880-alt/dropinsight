"use client";

import Link from "next/link";
import { can, type Role } from "@/lib/auth/permissions";
import { RefreshCw, Upload, Receipt, RotateCcw, Truck, Workflow } from "lucide-react";

/**
 * Quick actions in the sidebar. Every one is a link to a real workflow — none
 * of them are decorative, and each is hidden when the role cannot perform it.
 */
const ACTIONS = [
  { href: "/ebay-accounts?action=sync-all", label: "Sync all accounts", icon: RefreshCw, permission: "accounts.manage" },
  { href: "/orders?mode=spreadsheet", label: "Enter buying prices", icon: Upload, permission: "costs.write" },
  { href: "/expenses?action=add", label: "Add an expense", icon: Receipt, permission: "expenses.manage" },
  { href: "/profit-protection", label: "Chase a refund", icon: RotateCcw, permission: "refunds.answer" },
  { href: "/suppliers?action=add", label: "Add a supplier", icon: Truck, permission: "products.manage" },
  { href: "/automation/new", label: "Create automation", icon: Workflow, permission: "automation.manage" },
] as const;

export function QuickActions({ role }: { role: Role }) {
  const visible = ACTIONS.filter((a) => can(role, a.permission));
  if (visible.length === 0) return null;

  return (
    <div className="pt-1">
      <h2 className="px-2.5 pb-1.5 text-2xs font-semibold tracking-wider text-sidebar-ink-muted uppercase">
        Quick actions
      </h2>
      <ul className="space-y-0.5">
        {visible.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-ink-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink"
            >
              <action.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{action.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
