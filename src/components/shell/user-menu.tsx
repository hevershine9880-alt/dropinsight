"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Settings, CreditCard, Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, can, type Role } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";

const AVATAR_COLORS: Record<string, string> = {
  indigo: "bg-indigo-600", emerald: "bg-mint-600", amber: "bg-amber-500",
  rose: "bg-rose-500", navy: "bg-navy-600",
};

export function UserMenu({ user, role }: { user: SessionUser; role: Role }) {
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  };

  const links = [
    { href: "/settings/profile", label: "Your profile", icon: UserIcon, show: true },
    { href: "/settings", label: "Workspace settings", icon: Settings, show: can(role, "settings.manage") },
    { href: "/settings/billing", label: "Plan & billing", icon: CreditCard, show: can(role, "billing.manage") },
    { href: "/settings/referrals", label: "Refer a seller", icon: Gift, show: can(role, "billing.manage") },
  ].filter((l) => l.show);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 transition-colors hover:bg-surface-hover"
      >
        <span className="hidden text-right sm:block">
          <span className="block max-w-[9rem] truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block text-2xs text-ink-muted">{ROLE_LABELS[role]}</span>
        </span>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white",
            AVATAR_COLORS[user.avatarColor] ?? AVATAR_COLORS.indigo,
          )}
          aria-hidden
        >
          {initials}
        </span>
        <span className="sr-only">Account menu for {user.name}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-scale-in absolute right-0 z-50 mt-1.5 w-60 origin-top-right rounded-xl border border-line bg-surface-raised p-1 shadow-overlay"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-base font-medium text-ink">{user.name}</p>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
          </div>
          <div className="py-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-base text-ink transition-colors hover:bg-surface-hover"
              >
                <link.icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                {link.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-base text-negative transition-colors hover:bg-negative-soft disabled:opacity-60"
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
