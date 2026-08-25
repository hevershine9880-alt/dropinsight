"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db/client";
import { hashPassword, verifyPassword, checkPasswordStrength } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { randomToken, sha256 } from "@/lib/crypto";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: emailSchema,
  password: z.string().min(1, "Enter a password."),
  workspaceName: z.string().trim().min(2, "Give your business a name.").max(80),
  acceptedTerms: z.literal(true, { message: "You need to accept the terms to continue." }),
});

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "local";
  return `${prefix}:${ip}`;
}

export async function signUpAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const limit = rateLimit(await clientKey("sign-up"), LIMITS.signUp.limit, LIMITS.signUp.windowMs);
  if (!limit.ok) {
    return fail(`Too many sign-up attempts. Try again in ${limit.retryAfterSeconds} seconds.`);
  }

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceName: formData.get("workspaceName"),
    acceptedTerms: formData.get("acceptedTerms") === "on",
  });
  if (!parsed.success) return fromZod(parsed.error);

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) return fail("That password is not strong enough.", { password: strength.problems[0] });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    return fail("That email is already registered.", {
      email: "An account already exists for this email. Sign in instead, or reset your password.",
    });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      memberships: {
        create: {
          role: "OWNER",
          workspace: {
            create: {
              name: parsed.data.workspaceName,
              onboardingStep: "CONNECT",
              subscription: {
                create: { plan: "TRIAL", status: "TRIALING", trialEndsAt: addDays(new Date(), 14) },
              },
              referral: {
                create: {
                  code: `${parsed.data.workspaceName.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10) || "DROP"}-${Math.floor(1000 + Math.random() * 8999)}`,
                },
              },
            },
          },
        },
      },
    },
    include: { memberships: true },
  });

  await createSession(user.id);
  await recordAudit({
    workspaceId: user.memberships[0].workspaceId,
    actorUserId: user.id,
    action: "auth.sign_up",
    summary: `${parsed.data.name} created the workspace ${parsed.data.workspaceName}.`,
  });

  return ok(undefined, "/onboarding");
}

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export async function signInAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  // Two limits: one on the account being targeted, one on the origin. See
  // LIMITS for why an IP-only limit is the wrong shape.
  const ipKey = await clientKey("sign-in-ip");
  const perIp = rateLimit(ipKey, LIMITS.signInPerIp.limit, LIMITS.signInPerIp.windowMs);
  const perAccount = rateLimit(
    `sign-in-account:${parsed.data.email}`,
    LIMITS.signInPerAccount.limit,
    LIMITS.signInPerAccount.windowMs,
  );

  if (!perAccount.ok || !perIp.ok) {
    const retryAfter = Math.max(perAccount.retryAfterSeconds, perIp.retryAfterSeconds);
    return fail(`Too many sign-in attempts. Try again in ${retryAfter} seconds.`);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { orderBy: { createdAt: "asc" }, include: { workspace: true } } },
  });

  // Same message and roughly the same work whether the account exists or not,
  // so this endpoint cannot be used to enumerate registered emails.
  const valid = user ? await verifyPassword(user.passwordHash, parsed.data.password) : false;
  if (!user || !valid) {
    if (!user) await hashPassword(parsed.data.password);
    return fail("Those details don't match an account.", {
      password: "Check your email and password and try again.",
    });
  }

  if (user.memberships.length === 0) {
    return fail("Your account is not attached to a workspace. Contact support.");
  }

  await createSession(user.id);
  await recordAudit({
    workspaceId: user.memberships[0].workspaceId,
    actorUserId: user.id,
    action: "auth.sign_in",
    summary: `${user.name} signed in.`,
  });

  const workspace = user.memberships[0].workspace;
  return ok(undefined, workspace.onboardingStep === "DONE" ? "/dashboard" : "/onboarding");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
}

export async function requestPasswordResetAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const limit = rateLimit(await clientKey("reset"), LIMITS.passwordReset.limit, LIMITS.passwordReset.windowMs);
  if (!limit.ok) return fail(`Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`);

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return fail("Enter a valid email address.", { email: "Enter a valid email address." });

  const user = await prisma.user.findUnique({ where: { email: parsed.data }, select: { id: true } });

  if (user) {
    const token = randomToken(32);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    // No email provider is configured. Rather than silently doing nothing, the
    // link is logged server-side so the flow is genuinely usable in development.
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    console.info(`[auth] Password reset link for ${parsed.data}: ${url}`);
  }

  // Always the same answer, whether or not the address is registered.
  return ok();
}

const resetSchema = z.object({
  token: z.string().min(10, "This reset link is not valid."),
  password: z.string().min(1, "Enter a new password."),
  confirm: z.string().min(1, "Confirm your new password."),
});

export async function resetPasswordAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  if (parsed.data.password !== parsed.data.confirm) {
    return fail("The passwords don't match.", { confirm: "Both passwords must be the same." });
  }

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) return fail("That password is not strong enough.", { password: strength.problems[0] });

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
    include: { user: { include: { memberships: { take: 1 } } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return fail("This reset link has expired or has already been used. Request a new one.");
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Every other session is invalidated: a password reset is also how someone
    // locks out whoever had their old one.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  if (record.user.memberships[0]) {
    await recordAudit({
      workspaceId: record.user.memberships[0].workspaceId,
      actorUserId: record.userId,
      action: "auth.password_reset",
      summary: `${record.user.name} reset their password. All other sessions were signed out.`,
    });
  }

  await createSession(record.userId);
  return ok(undefined, "/dashboard");
}
