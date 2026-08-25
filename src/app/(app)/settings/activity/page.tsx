import type { Metadata } from "next";
import { format, formatDistanceToNow } from "date-fns";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { History } from "lucide-react";

export const metadata: Metadata = { title: "Activity" };

const ACTION_TONES: Record<string, "neutral" | "positive" | "negative" | "caution" | "brand"> = {
  "ebay.connect": "positive",
  "ebay.disconnect": "negative",
  "member.remove": "negative",
  "member.invite": "brand",
  "member.role_change": "caution",
  "billing.plan_change": "brand",
  "workspace.refund_attribution_change": "caution",
  "auth.password_reset": "caution",
};

export default async function ActivityPage() {
  const auth = await requirePermission("settings.manage");

  const entries = await prisma.auditLog.findMany({
    where: { workspaceId: auth.workspace.id },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Activity"
        description="Everything that changed money, access or an integration — who did it and when. The most recent 200 entries."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing recorded yet"
          description="Sign-ins, buying prices, refund answers, eBay connections and plan changes are all recorded here as they happen — so you can always account for what changed and who changed it."
          action={
            <Link
              href="/ebay-accounts"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
            >
              Connect an eBay account
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3">
              <Badge tone={ACTION_TONES[entry.action] ?? "neutral"} className="mt-0.5">
                {entry.action.split(".")[0]}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-base text-ink">{entry.summary}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {entry.actor?.name ?? "System"}
                  {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                </p>
              </div>
              <time
                dateTime={entry.createdAt.toISOString()}
                title={format(entry.createdAt, "d MMM yyyy 'at' HH:mm:ss")}
                className="shrink-0 text-xs text-ink-subtle"
              >
                {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
