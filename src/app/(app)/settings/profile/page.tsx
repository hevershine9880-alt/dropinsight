import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guard";
import { ROLE_LABELS, ROLE_SUMMARIES } from "@/lib/auth/permissions";
import { ProfileForm } from "./profile-form";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const auth = await requireAuth();

  return (
    <>
      <ProfileForm
        name={auth.user.name}
        email={auth.user.email}
        avatarColor={auth.user.avatarColor}
      />

      <Card>
        <CardHeader title="Your access" description="What your role lets you do in this workspace." />
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{ROLE_LABELS[auth.workspace.role]}</Badge>
            <p className="text-md text-ink-muted">{ROLE_SUMMARIES[auth.workspace.role]}</p>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
