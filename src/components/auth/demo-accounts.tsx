"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronDown, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

const DEMO_USERS = [
  { email: "owner@dropinsight.test", role: "Owner", note: "Everything, including billing and the team." },
  { email: "va@dropinsight.test", role: "VA", note: "Enters costs and answers refunds. No profit totals." },
  { email: "accountant@dropinsight.test", role: "Accountant", note: "Reads the numbers, manages expenses." },
];

/**
 * Only rendered when the seeded demo workspace exists, so this never appears in
 * a real deployment. It exists because role-based access is much easier to
 * evaluate when you can be three different people in three clicks.
 */
export function DemoAccounts() {
  const [available, setAvailable] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    fetch("/api/demo-available")
      .then((r) => r.json())
      .then((d: { available: boolean }) => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const signIn = async (email: string) => {
    setPending(email);
    const body = new FormData();
    body.set("email", email);
    body.set("password", "dropinsight-demo");
    const response = await fetch("/api/auth/demo-sign-in", { method: "POST", body });
    setPending(null);
    if (response.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="mt-7 rounded-xl border border-dashed border-line bg-surface-sunken/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <UserCircle2 className="size-4 text-ink-muted" aria-hidden />
          Try the demo workspace
        </span>
        <ChevronDown className={cn("size-4 text-ink-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-muted">
            Six months of seeded orders. Each role sees a different app — that is the point.
          </p>
          {DEMO_USERS.map((user) => (
            <div key={user.email} className="flex items-center gap-2 rounded-lg bg-surface p-2 ring-1 ring-line">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{user.role}</p>
                <p className="truncate text-xs text-ink-muted">{user.note}</p>
              </div>
              <Button
                size="xs"
                variant="secondary"
                loading={pending === user.email}
                onClick={() => signIn(user.email)}
              >
                Sign in
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
