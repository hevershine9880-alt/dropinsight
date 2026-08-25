import { NextResponse } from "next/server";
import { getAuth, destroySession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export async function POST() {
  const auth = await getAuth();
  if (auth) {
    await recordAudit({
      workspaceId: auth.workspace.id,
      actorUserId: auth.user.id,
      action: "auth.sign_out",
      summary: `${auth.user.name} signed out.`,
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
