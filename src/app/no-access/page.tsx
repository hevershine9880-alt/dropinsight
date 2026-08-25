import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/guard";
import { ROLE_LABELS, ROLE_SUMMARIES } from "@/lib/auth/permissions";
import { Wordmark } from "@/components/brand/logo";
import { Lock } from "lucide-react";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage() {
  const auth = await requireAuth();

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />

        <div className="mt-8 grid size-12 place-items-center justify-self-center rounded-2xl bg-caution-soft text-caution">
          <Lock className="size-6" aria-hidden />
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">That page isn&rsquo;t part of your role</h1>
        <p className="mt-2 text-md text-ink-muted">
          You are a <strong className="font-medium text-ink">{ROLE_LABELS[auth.workspace.role]}</strong> in{" "}
          {auth.workspace.name}. {ROLE_SUMMARIES[auth.workspace.role]}
        </p>
        <p className="mt-2 text-sm text-ink-subtle">
          If you need more access, ask an owner to change your role in Settings → Team.
        </p>

        <Link
          href="/orders"
          className="mt-6 inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
        >
          Back to what you can see
        </Link>
      </div>
    </main>
  );
}
