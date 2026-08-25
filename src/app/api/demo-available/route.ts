import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * Tells the sign-in page whether the seeded demo workspace exists, so the demo
 * shortcut never appears in a real deployment.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SIGN_IN !== "true") {
    return NextResponse.json({ available: false });
  }
  const user = await prisma.user.findUnique({
    where: { email: "owner@dropinsight.test" },
    select: { id: true },
  });
  return NextResponse.json({ available: !!user });
}
