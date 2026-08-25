import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 20), 50);

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { workspaceId: auth.workspace.id },
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.notification.count({ where: { workspaceId: auth.workspace.id, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unread });
}
