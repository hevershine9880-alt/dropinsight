"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireAuthOrThrow } from "@/lib/auth/guard";
import { hashPassword, verifyPassword, checkPasswordStrength } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  avatarColor: z.enum(["indigo", "emerald", "amber", "rose", "navy"]),
});

export async function updateProfileAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    avatarColor: formData.get("avatarColor"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  await prisma.user.update({ where: { id: auth.user.id }, data: parsed.data });
  revalidatePath("/", "layout");
  return ok();
}

const passwordSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  next: z.string().min(1, "Enter a new password."),
  confirm: z.string().min(1, "Confirm your new password."),
});

export async function changePasswordAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();

  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  if (parsed.data.next !== parsed.data.confirm) {
    return fail("The new passwords don't match.", { confirm: "Both must be the same." });
  }

  const strength = checkPasswordStrength(parsed.data.next);
  if (!strength.ok) return fail("That password is not strong enough.", { next: strength.problems[0] });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (!(await verifyPassword(user.passwordHash, parsed.data.current))) {
    return fail("That is not your current password.", { current: "Check it and try again." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "auth.password_reset",
    summary: `${user.name} changed their password.`,
  });

  return ok();
}
