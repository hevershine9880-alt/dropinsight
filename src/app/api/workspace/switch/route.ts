import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { workspaceId } = (await request.json()) as { workspaceId?: string };
  if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId." }, { status: 400 });

  // Never trust the client about which workspaces the user belongs to.
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "No access to that workspace." }, { status: 403 });

  const jar = await cookies();
  jar.set("dropinsight_workspace", workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
