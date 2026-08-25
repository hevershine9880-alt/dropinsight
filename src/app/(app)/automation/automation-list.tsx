"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  toggleAutomationRuleAction, deleteAutomationRuleAction, runAutomationRuleNowAction,
} from "@/server/actions/automation";
import {
  TRIGGER_LABELS, OPERATOR_LABELS, ACTION_LABELS, CONDITION_FIELDS,
  parseConditions, parseActions, type Trigger,
} from "@/lib/automation/types";
import { cn } from "@/lib/cn";
import { Workflow, Play, Pencil, Trash2, ChevronDown, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface RuleView {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: string;
  actions: string;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  runs: { id: string; status: string; message: string; createdAt: string }[];
}

export function AutomationList({ rules }: { rules: RuleView[] }) {
  if (rules.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Workflow}
          title="No automations yet"
          description="A rule watches for something — a refund arriving, a margin dropping, a supplier going quiet — and raises it in Alerts so it does not slip past you."
          action={
            <Link
              href="/automation/new"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
            >
              Create your first automation
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {rules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}
    </ul>
  );
}

function RuleCard({ rule }: { rule: RuleView }) {
  const [enabled, setEnabled] = React.useState(rule.enabled);
  const [expanded, setExpanded] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const conditions = parseConditions(rule.conditions);
  const actions = parseActions(rule.actions);
  const fields = CONDITION_FIELDS[rule.trigger as Trigger] ?? [];

  const toggle = async (next: boolean) => {
    setEnabled(next);
    const result = await toggleAutomationRuleAction(rule.id, next);
    if (!result.ok) {
      setEnabled(!next);
      toast({ tone: "error", title: "Couldn't change that", description: result.error });
      return;
    }
    toast({ tone: "success", title: next ? "Automation enabled" : "Automation paused" });
    router.refresh();
  };

  const runNow = async () => {
    setRunning(true);
    const result = await runAutomationRuleNowAction(rule.id);
    setRunning(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't run that", description: result.error });
      return;
    }
    toast({
      tone: result.data!.fired > 0 ? "success" : "info",
      title:
        result.data!.fired > 0
          ? `Fired on ${result.data!.fired} item${result.data!.fired === 1 ? "" : "s"}`
          : "Nothing matched",
      description:
        result.data!.fired > 0
          ? "Check Alerts to see what it raised."
          : "Nothing currently meets these conditions. The rule is fine — there is just nothing to catch.",
    });
    setExpanded(true);
    router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    const result = await deleteAutomationRuleAction(rule.id);
    setBusy(false);
    setDeleting(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't delete that", description: result.error });
      return;
    }
    toast({ tone: "success", title: "Automation deleted" });
    router.refresh();
  };

  return (
    <>
      <li>
        <Card className={cn("overflow-hidden", !enabled && "opacity-75")}>
          <div className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{rule.name}</h2>
                <Badge tone={enabled ? "positive" : "neutral"}>{enabled ? "Active" : "Paused"}</Badge>
              </div>
              {rule.description ? (
                <p className="mt-0.5 text-sm text-ink-muted">{rule.description}</p>
              ) : null}

              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs font-semibold tracking-wide text-ink-subtle uppercase">When</dt>
                  <dd className="text-ink">{TRIGGER_LABELS[rule.trigger as Trigger] ?? rule.trigger}</dd>
                </div>
                {conditions.length > 0 ? (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-xs font-semibold tracking-wide text-ink-subtle uppercase">And</dt>
                    <dd className="text-ink">
                      {conditions.map((condition, index) => {
                        const field = fields.find((f) => f.field === condition.field);
                        return (
                          <span key={index} className="block">
                            {field?.label ?? condition.field} {OPERATOR_LABELS[condition.operator]}{" "}
                            <strong className="font-medium">
                              {formatValue(condition.value, field?.type)}
                            </strong>
                          </span>
                        );
                      })}
                    </dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Then</dt>
                  <dd className="text-ink">
                    {actions.map((action, index) => (
                      <span key={index} className="block">
                        {ACTION_LABELS[action.kind]}
                        {action.message ? <span className="text-ink-muted"> — “{action.message}”</span> : null}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-3">
              <Toggle
                checked={enabled}
                onChange={(next) => void toggle(next)}
                label={`${rule.name} enabled`}
              />
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => void runNow()} loading={running}>
                  <Play className="size-3.5" aria-hidden />
                  Run now
                </Button>
                <Link
                  href={`/automation/${rule.id}`}
                  aria-label={`Edit ${rule.name}`}
                  className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  aria-label={`Delete ${rule.name}`}
                  className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-muted shadow-sm transition-colors hover:bg-negative-soft hover:text-negative"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between gap-2 border-t border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-hover"
          >
            <span>
              {rule.runCount > 0
                ? `Fired ${rule.runCount} time${rule.runCount === 1 ? "" : "s"}`
                : "Has never fired"}
              {rule.lastRunAt
                ? ` · last checked ${formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}`
                : " · not run yet"}
            </span>
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
          </button>

          {expanded ? (
            <div className="border-t border-line bg-surface-sunken/50 px-4 py-3">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                Execution history
              </h3>
              {rule.runs.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Nothing yet. Press <strong className="font-medium">Run now</strong> to see what this rule would catch.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rule.runs.map((run) => {
                    const Icon =
                      run.status === "SUCCESS" ? CheckCircle2 : run.status === "FAILED" ? XCircle : MinusCircle;
                    const tone =
                      run.status === "SUCCESS" ? "text-positive" : run.status === "FAILED" ? "text-negative" : "text-ink-subtle";
                    return (
                      <li key={run.id} className="flex items-start gap-2 text-sm">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden />
                        <span className="min-w-0 flex-1 text-ink-muted">{run.message}</span>
                        <time dateTime={run.createdAt} className="shrink-0 text-xs text-ink-subtle">
                          {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </Card>
      </li>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => void remove()}
        title={`Delete “${rule.name}”?`}
        message="The rule and its execution history are removed. Alerts it has already raised stay in your Alerts list."
        confirmLabel="Delete automation"
        loading={busy}
      />
    </>
  );
}

function formatValue(value: number | string, type?: string): string {
  if (typeof value !== "number") return String(value);
  switch (type) {
    case "percent": return `${value}%`;
    case "days": return `${value} day${value === 1 ? "" : "s"}`;
    case "money": return (value / 100).toFixed(2);
    default: return String(value);
  }
}
