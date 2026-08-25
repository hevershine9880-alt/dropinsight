import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";

export async function POST() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { count } = await prisma.notification.updateMany({
    where: { workspaceId: auth.workspace.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, marked: count });
}
