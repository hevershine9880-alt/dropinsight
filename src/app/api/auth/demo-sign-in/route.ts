import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const DEMO_EMAILS = new Set([
  "owner@dropinsight.test",
  "va@dropinsight.test",
  "accountant@dropinsight.test",
]);

/**
 * Signs in one of the seeded demo users. Restricted to the three known demo
 * addresses and disabled in production unless explicitly allowed, so it cannot
 * become a back door.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SIGN_IN !== "true") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  if (!DEMO_EMAILS.has(email)) {
    return NextResponse.json({ error: "Not a demo account." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return NextResponse.json({ error: "Demo sign-in failed." }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
