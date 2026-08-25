"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireAuthOrThrow } from "@/lib/auth/guard";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const ticketSchema = z.object({
  subject: z.string().trim().min(4, "Say what you need help with.").max(150),
  body: z.string().trim().min(10, "A little more detail helps us answer faster.").max(4000),
});

export async function openTicketAction(input: {
  subject: string;
  body: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuthOrThrow();

  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const ticket = await prisma.supportTicket.create({
    data: {
      workspaceId: auth.workspace.id,
      subject: parsed.data.subject,
      messages: { create: { authorId: auth.user.id, body: parsed.data.body } },
    },
  });

  revalidatePath("/support");
  return ok({ id: ticket.id });
}

export async function replyToTicketAction(input: {
  ticketId: string;
  body: string;
}): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();

  const body = z.string().trim().min(1, "Write a reply.").max(4000).safeParse(input.body);
  if (!body.success) return fail("Write a reply first.");

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: input.ticketId, workspaceId: auth.workspace.id },
    select: { id: true },
  });
  if (!ticket) return fail("That ticket no longer exists.");

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorId: auth.user.id, body: body.data },
    }),
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "OPEN" } }),
  ]);

  revalidatePath("/support");
  return ok();
}

export async function closeTicketAction(ticketId: string): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();
  const { count } = await prisma.supportTicket.updateMany({
    where: { id: ticketId, workspaceId: auth.workspace.id },
    data: { status: "CLOSED" },
  });
  if (count === 0) return fail("That ticket no longer exists.");
  revalidatePath("/support");
  return ok();
}
