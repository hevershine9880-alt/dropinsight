"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  inviteTeammateAction, changeMemberRoleAction, removeMemberAction, revokeInvitationAction,
} from "@/server/actions/team";
import { INVITABLE_ROLES, ROLE_LABELS, ROLE_SUMMARIES, type Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { UserPlus, Trash2, Copy, Check, Lock, Mail } from "lucide-react";

const AVATAR_COLORS: Record<string, string> = {
  indigo: "bg-indigo-600", emerald: "bg-mint-600", amber: "bg-amber-500",
  rose: "bg-rose-500", navy: "bg-navy-600",
};

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: Role;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export function TeamClient({
  currentUserId, members, invitations, canUseTeam, planName,
}: {
  currentUserId: string;
  members: Member[];
  invitations: Invitation[];
  canUseTeam: boolean;
  planName: string;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("VA");
  const [inviting, setInviting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<Member | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviting(true);
    setErrors({});

    const result = await inviteTeammateAction({ email, role });
    setInviting(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast({ tone: "error", title: "Couldn't send that invitation", description: result.error, durationMs: 9000 });
      return;
    }

    setEmail("");
    setInviteUrl(result.data!.inviteUrl);
    router.refresh();
  };

  const changeRole = async (member: Member, next: Role) => {
    const result = await changeMemberRoleAction(member.id, next);
    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't change that role", description: result.error });
      return;
    }
    toast({ tone: "success", title: `${member.name} is now ${ROLE_LABELS[next]}` });
    router.refresh();
  };

  const remove = async (member: Member) => {
    setBusy(true);
    const result = await removeMemberAction(member.id);
    setBusy(false);
    setRemoving(null);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't remove them", description: result.error });
      return;
    }
    toast({ tone: "success", title: `${member.name} removed` });
    router.refresh();
  };

  const revoke = async (invitation: Invitation) => {
    const result = await revokeInvitationAction(invitation.id);
    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't revoke that", description: result.error });
      return;
    }
    toast({ tone: "success", title: "Invitation revoked" });
    router.refresh();
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Invite a teammate"
          description="They join with exactly the access their role grants — the table below says precisely what that is."
        />
        <CardBody>
          {!canUseTeam ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-caution-soft px-4 py-3">
              <Lock className="size-5 shrink-0 text-caution" aria-hidden />
              <p className="min-w-0 flex-1 text-md text-caution-ink">
                Team access is part of the Multi plan. You are on {planName}.
              </p>
              <Link
                href="/settings/billing"
                className="inline-flex h-9 shrink-0 items-center rounded-lg bg-caution px-3.5 text-base font-medium text-white hover:brightness-95"
              >
                See plans
              </Link>
            </div>
          ) : (
            <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
              <Field label="Email" htmlFor="invite-email" error={errors.email} className="min-w-56 flex-1">
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  invalid={!!errors.email}
                  required
                />
              </Field>

              <Field label="Role" htmlFor="invite-role" hint={ROLE_SUMMARIES[role]} className="min-w-44">
                <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </Field>

              <Button type="submit" variant="primary" loading={inviting} disabled={!email.trim()} className="mb-6">
                <UserPlus className="size-4" aria-hidden />
                Invite
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader title="Pending invitations" description="Not accepted yet." />
          <CardBody>
            <ul className="space-y-2">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2.5">
                  <Mail className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{invitation.email}</span>
                    <span className="block text-xs text-ink-muted">
                      {ROLE_LABELS[invitation.role]} · expires {format(new Date(invitation.expiresAt), "d MMM yyyy")}
                    </span>
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => void revoke(invitation)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Members"
          description={`${members.length} ${members.length === 1 ? "person" : "people"} in this workspace.`}
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {members.map((member) => {
              const isOwner = member.role === "OWNER";
              const isSelf = member.userId === currentUserId;

              return (
                <li key={member.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white",
                      AVATAR_COLORS[member.avatarColor] ?? AVATAR_COLORS.indigo,
                    )}
                    aria-hidden
                  >
                    {member.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      {member.name}
                      {isSelf ? <span className="ml-1.5 text-sm font-normal text-ink-muted">(you)</span> : null}
                    </span>
                    <span className="block truncate text-sm text-ink-muted">{member.email}</span>
                  </span>

                  {isOwner ? (
                    <Badge tone="brand">Owner</Badge>
                  ) : (
                    <Select
                      value={member.role}
                      onChange={(e) => void changeRole(member, e.target.value as Role)}
                      aria-label={`Role for ${member.name}`}
                      className="w-40"
                    >
                      {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  )}

                  {!isOwner && !isSelf ? (
                    <button
                      type="button"
                      onClick={() => setRemoving(member)}
                      aria-label={`Remove ${member.name}`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-negative-soft hover:text-negative"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  ) : (
                    <span className="size-8 shrink-0" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <InviteLinkDialog url={inviteUrl} onClose={() => setInviteUrl(null)} />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && void remove(removing)}
        title={removing ? `Remove ${removing.name}?` : ""}
        message="They lose access to this workspace immediately. Anything they entered — buying prices, refund answers, expenses — stays exactly as it is."
        confirmLabel="Remove"
        loading={busy}
      />
    </>
  );
}

/**
 * No email provider is wired up, so the invitation link is handed to the
 * inviter to pass on. Saying so plainly is better than a "check your inbox"
 * message for an email that was never sent.
 */
function InviteLinkDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog
      open={url !== null}
      onClose={onClose}
      title="Invitation created"
      description="No email provider is configured on this deployment, so send them this link yourself. It expires in 14 days."
      size="sm"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url ?? ""}
          aria-label="Invitation link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-9.5 min-w-0 flex-1 rounded-lg border border-line bg-surface-sunken px-3 font-mono text-sm"
        />
        <Button variant={copied ? "positive" : "secondary"} onClick={() => void copy()}>
          {copied ? <><Check className="size-4" aria-hidden /> Copied</> : <><Copy className="size-4" aria-hidden /> Copy</>}
        </Button>
      </div>
    </Dialog>
  );
}
