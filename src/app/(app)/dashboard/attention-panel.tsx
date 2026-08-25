import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, CheckCircle2, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AttentionItem } from "@/lib/finance/dashboard";

const TONES = {
  caution: { icon: AlertTriangle, chip: "bg-caution-soft text-caution" },
  negative: { icon: AlertOctagon, chip: "bg-negative-soft text-negative" },
  info: { icon: Info, chip: "bg-info-soft text-info" },
} as const;

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Needs attention"
        description="The work that is holding your numbers back."
        action={<Link href="/alerts" className="text-sm font-medium text-brand hover:underline">All alerts</Link>}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          tone="positive"
          title="Nothing needs you"
          description="Every order is priced, every refund answered, and all accounts are syncing."
          className="flex-1 py-8"
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((item) => {
            const tone = TONES[item.tone];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover"
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone.chip)}>
                    <tone.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="tabular text-lg font-semibold text-ink">{item.count.toLocaleString()}</span>
                    <span className="ml-1.5 text-sm text-ink-muted">{item.label}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-colors group-hover:text-brand" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
