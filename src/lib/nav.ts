import {
  LayoutDashboard, ShoppingCart, RotateCcw, ShieldCheck, TrendingUp, Package,
  Truck, Receipt, BarChart3, FileText, Lightbulb, Bell, Workflow, Settings,
  LifeBuoy, Link2,
} from "lucide-react";
import type { Permission } from "./auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
  /** Which badge count, if any, this item shows. */
  counter?: "orders" | "refunds" | "alerts" | "accounts";
  /** Matched as a prefix so detail pages keep their parent highlighted. */
  match?: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
    ],
  },
  {
    label: "Trade",
    items: [
      { href: "/orders", label: "Orders", icon: ShoppingCart, permission: "orders.view", counter: "orders", match: "/orders" },
      { href: "/returns", label: "Returns & refunds", icon: RotateCcw, permission: "orders.view", counter: "refunds", match: "/returns" },
      { href: "/profit-protection", label: "Profit protection", icon: ShieldCheck, permission: "orders.view" },
      { href: "/products", label: "Listings", icon: Package, permission: "orders.view", match: "/products" },
      { href: "/suppliers", label: "Suppliers", icon: Truck, permission: "orders.view", match: "/suppliers" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/profit-and-loss", label: "Profit & loss", icon: TrendingUp, permission: "dashboard.view" },
      { href: "/expenses", label: "Expenses", icon: Receipt, permission: "expenses.manage" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.view" },
      { href: "/reports", label: "Reports", icon: FileText, permission: "reports.download" },
    ],
  },
  {
    label: "Attention",
    items: [
      { href: "/insights", label: "Insights", icon: Lightbulb, permission: "dashboard.view" },
      { href: "/alerts", label: "Alerts", icon: Bell, permission: "orders.view", counter: "alerts" },
      { href: "/automation", label: "Automation", icon: Workflow, permission: "automation.manage", match: "/automation" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/ebay-accounts", label: "eBay accounts", icon: Link2, permission: "orders.view", counter: "accounts" },
      { href: "/settings", label: "Settings", icon: Settings, permission: "orders.view", match: "/settings" },
      { href: "/support", label: "Support", icon: LifeBuoy, permission: "orders.view", match: "/support" },
    ],
  },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.match) return pathname === item.match || pathname.startsWith(`${item.match}/`);
  return pathname === item.href;
}
