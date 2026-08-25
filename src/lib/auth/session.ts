import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { randomToken, sha256 } from "@/lib/crypto";
import type { Role } from "./permissions";

/**
 * Sessions are opaque random tokens. Only the SHA-256 of a token is stored, so
 * a database leak does not hand out live sessions. The cookie is httpOnly,
 * SameSite=Lax and Secure outside development.
 */

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "dropinsight_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_WITHIN_MS = 15 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

export interface ActiveWorkspace {
  id: string;
  name: string;
  currency: string;
  refundAttribution: string;
  onboardingStep: string;
  role: Role;
}

export interface AuthContext {
  user: SessionUser;
  workspace: ActiveWorkspace;
  workspaces: { id: string; name: string; role: Role }[];
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();

  await prisma.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + TTL_MS),
      userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
      ipAddress: clientIp(h),
    },
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { id: sha256(token) } });
  }
  jar.delete(COOKIE);
}

/**
 * Resolve the caller. Cached per request so a page and its dozen server
 * components share one lookup.
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { workspace: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Slide the expiry when a session is more than halfway through its life.
  if (session.expiresAt.getTime() - Date.now() < RENEW_WITHIN_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + TTL_MS) },
    });
  }

  const memberships = session.user.memberships;
  if (memberships.length === 0) return null;

  const preferred = jar.get("dropinsight_workspace")?.value;
  const active = memberships.find((m) => m.workspaceId === preferred) ?? memberships[0];

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarColor: session.user.avatarColor,
    },
    workspace: {
      id: active.workspace.id,
      name: active.workspace.name,
      currency: active.workspace.currency,
      refundAttribution: active.workspace.refundAttribution,
      onboardingStep: active.workspace.onboardingStep,
      role: active.role as Role,
    },
    workspaces: memberships.map((m) => ({
      id: m.workspaceId,
      name: m.workspace.name,
      role: m.role as Role,
    })),
  };
});

function clientIp(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 45);
  return h.get("x-real-ip")?.slice(0, 45) ?? null;
}

/** Remove expired sessions. Called from the job tick. */
export async function pruneExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
