"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ConnectionStatusBadge, SyncStatusBadge } from "@/components/domain/status";
import { marketplaceName } from "../dashboard/accounts-panel";
import {
  startEbayConnectAction, syncAccountAction, syncAllAccountsAction,
  importHistoryAction, disconnectAccountAction,
} from "@/server/actions/ebay";
import { cn } from "@/lib/cn";
import {
  Link2, RefreshCw, History, Trash2, Plus, AlertTriangle, FlaskConical,
  CheckCircle2, Store, Award, ChevronDown, Info,
} from "lucide-react";

interface SyncJobView {
  id: string;
  type: string;
  status: string;
  ordersImported: number;
  ordersUpdated: number;
  error: string | null;
  queuedAt: string;
  finishedAt: string | null;
}

interface AccountView {
  id: string;
  username: string;
  marketplaceId: string;
  currency: string;
  status: string;
  statusDetail: string | null;
  isMock: boolean;
  connectedAt: string;
  lastSyncAt: string | null;
  historyFrom: string | null;
  orderCount: number;
  sellerLevel: string | null;
  lateDispatchRate: number | null;
  transactionDefectRate: number | null;
  syncJobs: SyncJobView[];
}

export function AccountsClient({
  accounts, canManage, entitlements, usingMockAdapter, connectError, connectedUsername, autoSyncAll,
}: {
  accounts: AccountView[];
  canManage: boolean;
  entitlements: {
    planName: string;
    accountLimit: number;
    accountsUsed: number;
    canConnectAnother: boolean;
    syncingActive: boolean;
  };
  usingMockAdapter: boolean;
  connectError: string | null;
  connectedUsername: string | null;
  autoSyncAll: boolean;
}) {
  const [connecting, setConnecting] = React.useState(false);
  const [syncingAll, setSyncingAll] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const announced = React.useRef(false);

  // Surface the callback's outcome once, then clean the URL so a refresh does
  // not repeat the message.
  React.useEffect(() => {
    if (announced.current) return;
    if (connectError) {
      announced.current = true;
      toast({ tone: "error", title: "That account wasn't connected", description: connectError, durationMs: 9000 });
      router.replace("/ebay-accounts");
    } else if (connectedUsername) {
      announced.current = true;
      toast({
        tone: "success",
        title: `${connectedUsername} connected`,
        description: "Importing the last 90 days of orders now. It appears as it arrives.",
      });
      router.replace("/ebay-accounts");
    }
  }, [connectError, connectedUsername, toast, router]);

  const syncAll = React.useCallback(async () => {
    setSyncingAll(true);
    const result = await syncAllAccountsAction();
    setSyncingAll(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't start the sync", description: result.error });
      return;
    }
    toast({
      tone: result.data!.queued > 0 ? "success" : "info",
      title: result.data!.queued > 0 ? `Syncing ${result.data!.queued} accounts` : "Nothing to sync",
      description:
        result.data!.queued > 0
          ? "New orders appear within a minute."
          : "No accounts are currently connected.",
    });
    router.refresh();
  }, [toast, router]);

  React.useEffect(() => {
    if (autoSyncAll && canManage && !announced.current) {
      announced.current = true;
      void syncAll();
      router.replace("/ebay-accounts");
    }
  }, [autoSyncAll, canManage, syncAll, router]);

  const connect = async () => {
    setConnecting(true);
    const result = await startEbayConnectAction();
    setConnecting(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Can't connect another account", description: result.error, durationMs: 9000 });
      return;
    }
    window.location.href = result.data!.url;
  };

  const active = accounts.filter((a) => a.status !== "DISCONNECTED");
  const disconnected = accounts.filter((a) => a.status === "DISCONNECTED");

  return (
    <>
      {!entitlements.syncingActive ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-caution/30 bg-caution-soft px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-caution" aria-hidden />
          <p className="min-w-0 flex-1 text-md text-caution-ink">
            <strong className="font-semibold">Syncing is paused.</strong> Your trial has ended.
            Nothing has been deleted — new orders will start arriving again as soon as you subscribe.
          </p>
          <Link
            href="/settings/billing"
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-caution px-3.5 text-base font-medium text-white hover:brightness-95"
          >
            Choose a plan
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-md text-ink-muted">
          <span className="tabular font-medium text-ink">
            {entitlements.accountsUsed} of {entitlements.accountLimit}
          </span>{" "}
          accounts on your {entitlements.planName} plan
        </p>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {active.length > 0 ? (
              <Button variant="secondary" onClick={() => void syncAll()} loading={syncingAll}>
                <RefreshCw className="size-4" aria-hidden />
                Sync all
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => void connect()}
              loading={connecting}
              disabled={!entitlements.canConnectAnother}
              title={entitlements.canConnectAnother ? undefined : "Your plan's account limit is reached"}
            >
              <Plus className="size-4" aria-hidden />
              Connect an eBay account
            </Button>
          </div>
        ) : null}
      </div>

      {usingMockAdapter && active.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Running against the development adapter. These accounts generate deterministic demo data
            through the same sync engine the live integration uses. Set{" "}
            <code className="rounded bg-surface px-1">EBAY_ADAPTER=live</code> with an eBay keyset to
            connect real stores.
          </span>
        </p>
      ) : null}

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={Link2}
            title="No eBay account connected"
            description="Everything in DropInsight comes from your eBay orders. Connect a store and the last 90 days import automatically — you can pull more history afterwards."
            action={
              canManage ? (
                <Button variant="primary" onClick={() => void connect()} loading={connecting}>
                  <Plus className="size-4" aria-hidden />
                  Connect your eBay account
                </Button>
              ) : (
                <p className="text-sm text-ink-muted">Ask an owner or manager to connect one.</p>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {active.map((account) => (
            <AccountCard key={account.id} account={account} canManage={canManage} />
          ))}
        </div>
      )}

      {disconnected.length > 0 ? (
        <Card>
          <CardHeader
            title="Disconnected"
            description="Their orders, costs and refund answers are all still here. Reconnecting picks up where it left off."
          />
          <CardBody>
            <ul className="space-y-2">
              {disconnected.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2.5">
                  <Store className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{account.username}</span>
                    <span className="block text-xs text-ink-muted">
                      {account.orderCount.toLocaleString()} orders kept ·{" "}
                      {marketplaceName(account.marketplaceId)}
                    </span>
                  </span>
                  {canManage ? (
                    <Button size="sm" variant="secondary" onClick={() => void connect()}>
                      Reconnect
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function AccountCard({ account, canManage }: { account: AccountView; canManage: boolean }) {
  const [syncing, setSyncing] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [logOpen, setLogOpen] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const sync = async () => {
    setSyncing(true);
    const result = await syncAccountAction(account.id);
    setSyncing(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't start the sync", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: `Syncing ${account.username}`,
      description: "New and changed orders appear within a minute.",
    });
    router.refresh();
  };

  const disconnect = async () => {
    setBusy(true);
    const result = await disconnectAccountAction(account.id);
    setBusy(false);
    setDisconnecting(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't disconnect", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: `${account.username} disconnected`,
      description: `Its ${account.orderCount.toLocaleString()} orders and all your costs are still here.`,
    });
    router.refresh();
  };

  const broken = account.status !== "CONNECTED";

  return (
    <>
      <Card className={cn("overflow-hidden", broken && "border-negative/30")}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{account.username}</h2>
              <ConnectionStatusBadge status={account.status} />
              {account.isMock ? <Badge tone="info" icon={FlaskConical}>Demo data</Badge> : null}
              {account.sellerLevel === "TOP_RATED" ? (
                <Badge tone="positive" icon={Award}>Top Rated</Badge>
              ) : null}
            </div>

            <p className="mt-1 text-sm text-ink-muted">
              {marketplaceName(account.marketplaceId)} · {account.currency} ·{" "}
              {account.orderCount.toLocaleString()} orders ·{" "}
              {account.lastSyncAt
                ? `last synced ${formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true })}`
                : "not synced yet"}
            </p>

            {broken && account.statusDetail ? (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {account.statusDetail} Your existing orders and costs are safe — reconnect to start
                  receiving new ones again.
                </span>
              </p>
            ) : null}

            {account.historyFrom ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
                <Info className="size-3.5" aria-hidden />
                History imported from {format(new Date(account.historyFrom), "d MMMM yyyy")}
              </p>
            ) : null}
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => void sync()} loading={syncing} disabled={broken}>
                <RefreshCw className="size-3.5" aria-hidden />
                Sync now
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setHistoryOpen(true)} disabled={broken}>
                <History className="size-3.5" aria-hidden />
                Import history
              </Button>
              <button
                type="button"
                onClick={() => setDisconnecting(true)}
                aria-label={`Disconnect ${account.username}`}
                className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-muted shadow-sm transition-colors hover:bg-negative-soft hover:text-negative"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setLogOpen((v) => !v)}
          aria-expanded={logOpen}
          className="flex w-full items-center justify-between gap-2 border-t border-line px-5 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-hover"
        >
          <span>Recent sync activity</span>
          <ChevronDown className={cn("size-4 transition-transform", logOpen && "rotate-180")} aria-hidden />
        </button>

        {logOpen ? (
          <div className="border-t border-line bg-surface-sunken/50 px-5 py-3">
            {account.syncJobs.length === 0 ? (
              <p className="text-sm text-ink-muted">No syncs recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {account.syncJobs.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <SyncStatusBadge status={job.status} />
                    <span className="text-xs font-medium tracking-wide text-ink-subtle uppercase">{job.type}</span>
                    <span className="text-ink-muted">
                      {job.status === "FAILED" || job.status === "PARTIAL"
                        ? (job.error ?? "No detail recorded")
                        : `${job.ordersImported} new, ${job.ordersUpdated} updated`}
                    </span>
                    <time dateTime={job.queuedAt} className="ml-auto text-xs text-ink-subtle">
                      {formatDistanceToNow(new Date(job.queuedAt), { addSuffix: true })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Card>

      <ImportHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        account={account}
      />

      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        onConfirm={() => void disconnect()}
        title={`Disconnect ${account.username}?`}
        message={`New orders will stop arriving from this store. Its ${account.orderCount.toLocaleString()} existing orders, every buying price you have entered and every supplier answer you have recorded all stay exactly as they are. You can reconnect at any time.`}
        confirmLabel="Disconnect"
        loading={busy}
      />
    </>
  );
}

function ImportHistoryDialog({
  open, onClose, account,
}: {
  open: boolean;
  onClose: () => void;
  account: AccountView;
}) {
  const [days, setDays] = React.useState("365");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const run = async () => {
    setSaving(true);
    const result = await importHistoryAction(account.id, Number(days));
    setSaving(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't start the import", description: result.error });
      return;
    }
    onClose();
    toast({
      tone: "success",
      title: "History import queued",
      description: "Older orders arrive in the background. Nothing you have already entered is touched.",
    });
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Import older history for ${account.username}`}
      description="Pulls orders older than the 90 days imported when you connected. Orders already here are updated, never duplicated."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void run()} loading={saving}>Start import</Button>
        </>
      }
    >
      <Field label="How far back" htmlFor="history-days">
        <Select id="history-days" data-autofocus value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="90">90 days</option>
          <option value="180">6 months</option>
          <option value="365">1 year</option>
          <option value="730">2 years</option>
        </Select>
      </Field>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        Large imports run in pages in the background — you can keep working. eBay only keeps about two
        years of order history available.
      </p>
    </Dialog>
  );
}
