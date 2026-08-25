import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";
import { sha256 } from "@/lib/crypto";
import { ROLE_LABELS, ROLE_SUMMARIES, type Role } from "@/lib/auth/permissions";
import { Wordmark } from "@/components/brand/logo";
import { AlertTriangle, UserPlus } from "lucide-react";
import { AcceptInviteButton } from "./accept-button";

export const metadata: Metadata = { title: "Join a workspace" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <Problem message="This invitation link is incomplete. Ask for a new one." />;

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { workspace: { select: { id: true, name: true } } },
  });

  if (!invitation || invitation.acceptedAt) {
    return <Problem message="This invitation has already been used, or was revoked. Ask for a new one." />;
  }
  if (invitation.expiresAt < new Date()) {
    return <Problem message="This invitation has expired. Ask whoever invited you to send another." />;
  }

  const auth = await getAuth();

  // Not signed in: send them to sign up, keeping the token so they land back here.
  if (!auth) {
    redirect(`/sign-up?invite=${encodeURIComponent(token)}`);
  }

  // The invitation is addressed to one email; joining as somebody else would
  // hand access to the wrong person.
  if (auth.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Problem
        message={`This invitation was sent to ${invitation.email}, but you are signed in as ${auth.user.email}. Sign out and sign in with the invited address.`}
      />
    );
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: auth.user.id, workspaceId: invitation.workspaceId } },
    select: { id: true },
  });
  if (existing) redirect("/dashboard");

  const role = invitation.role as Role;

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />

        <div className="mt-8 grid size-12 place-items-center justify-self-center rounded-2xl bg-brand-soft text-brand">
          <UserPlus className="size-6" aria-hidden />
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Join {invitation.workspace.name}
        </h1>
        <p className="mt-2 text-md text-ink-muted">
          You have been invited as a <strong className="font-medium text-ink">{ROLE_LABELS[role]}</strong>.
          {" "}{ROLE_SUMMARIES[role]}
        </p>

        <div className="mt-6">
          <AcceptInviteButton token={token} workspaceName={invitation.workspace.name} />
        </div>

        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-ink-muted hover:text-ink">
          Not now
        </Link>
      </div>
    </main>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />
        <div className="mt-8 grid size-12 place-items-center justify-self-center rounded-2xl bg-caution-soft text-caution">
          <AlertTriangle className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">This invitation can&rsquo;t be used</h1>
        <p className="mt-2 text-md text-ink-muted">{message}</p>
        <Link
          href="/sign-in"
          className="mt-6 inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
