"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { acceptInvitationAction } from "@/server/actions/invitations";

export function AcceptInviteButton({
  token, workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const [joining, setJoining] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const accept = async () => {
    setJoining(true);
    const result = await acceptInvitationAction(token);
    setJoining(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't join", description: result.error, durationMs: 9000 });
      return;
    }
    toast({ tone: "success", title: `You've joined ${workspaceName}` });
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Button variant="primary" size="lg" onClick={() => void accept()} loading={joining}>
      Join {workspaceName}
    </Button>
  );
}
