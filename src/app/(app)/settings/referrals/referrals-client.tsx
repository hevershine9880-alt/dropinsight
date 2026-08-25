"use client";

import * as React from "react";
import { format } from "date-fns";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/money";
import { Gift, Copy, Check, Users } from "lucide-react";

export function ReferralsClient({
  code, appUrl, rewardMinor, referred,
}: {
  code: string;
  appUrl: string;
  rewardMinor: number;
  referred: { id: string; name: string; joinedAt: string; plan: string; status: string }[];
}) {
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null);
  const link = `${appUrl}/sign-up?ref=${code}`;

  const copy = async (value: string, which: "code" | "link") => {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 2500);
  };

  const converted = referred.filter((r) => r.status === "ACTIVE").length;

  return (
    <>
      <Card>
        <CardHeader
          title="Refer another seller"
          description="They get their trial, you get a month's credit once they subscribe."
        />
        <CardBody className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl bg-brand-soft p-4">
            <Gift className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <p className="text-md text-brand-ink">
              Most dropshippers know three or four others. Share your link — when one of them subscribes,
              a month is credited to your account automatically.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="referral-code" className="mb-1.5 block text-sm font-medium">Your code</label>
              <div className="flex items-center gap-2">
                <input
                  id="referral-code"
                  readOnly
                  value={code}
                  onFocus={(e) => e.currentTarget.select()}
                  className="tabular h-9.5 w-full max-w-56 rounded-lg border border-line bg-surface-sunken px-3 font-mono text-base"
                />
                <Button
                  variant={copied === "code" ? "positive" : "secondary"}
                  onClick={() => void copy(code, "code")}
                >
                  {copied === "code" ? <><Check className="size-4" aria-hidden /> Copied</> : <><Copy className="size-4" aria-hidden /> Copy</>}
                </Button>
              </div>
            </div>

            <div>
              <label htmlFor="referral-link" className="mb-1.5 block text-sm font-medium">Your link</label>
              <div className="flex items-center gap-2">
                <input
                  id="referral-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9.5 min-w-0 flex-1 rounded-lg border border-line bg-surface-sunken px-3 font-mono text-sm"
                />
                <Button
                  variant={copied === "link" ? "positive" : "secondary"}
                  onClick={() => void copy(link, "link")}
                >
                  {copied === "link" ? <><Check className="size-4" aria-hidden /> Copied</> : <><Copy className="size-4" aria-hidden /> Copy</>}
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Sellers referred</p>
          <p className="tabular mt-1 text-2xl font-semibold">{referred.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Now subscribing</p>
          <p className="tabular mt-1 text-2xl font-semibold text-positive">{converted}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Credit earned</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(rewardMinor, "USD", { locale: "en-US" })}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Who you have referred" />
        {referred.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody yet"
            description="Anyone who signs up through your link appears here, along with whether they have subscribed. Most sellers know three or four others running the same kind of shop."
            className="py-10"
            action={
              <Button variant="primary" onClick={() => void copy(link, "link")}>
                {copied === "link" ? <><Check className="size-4" aria-hidden /> Link copied</> : <><Copy className="size-4" aria-hidden /> Copy your link</>}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {referred.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{entry.name}</span>
                  <span className="block text-xs text-ink-muted">
                    Joined {format(new Date(entry.joinedAt), "d MMM yyyy")}
                  </span>
                </span>
                <Badge tone={entry.status === "ACTIVE" ? "positive" : "neutral"}>
                  {entry.status === "ACTIVE" ? `Subscribed · ${entry.plan}` : "On trial"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
