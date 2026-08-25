import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { SupportClient } from "./support-client";
import { LifeBuoy } from "lucide-react";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const auth = await requireAuth();

  const tickets = await prisma.supportTicket.findMany({
    where: { workspaceId: auth.workspace.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Support"
        description="Ask us anything. We can see your account, so you rarely need to explain the setup."
        icon={LifeBuoy}
      />

      <SupportClient
        tickets={tickets.map((ticket) => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          createdAt: ticket.createdAt.toISOString(),
          messages: ticket.messages.map((message) => ({
            id: message.id,
            body: message.body,
            fromStaff: message.fromStaff,
            authorName: message.author?.name ?? "DropInsight support",
            createdAt: message.createdAt.toISOString(),
          })),
        }))}
      />
    </PageContainer>
  );
}
