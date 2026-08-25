"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveAutomationRuleAction } from "@/server/actions/automation";
import {
  TRIGGERS, TRIGGER_LABELS, TRIGGER_DESCRIPTIONS, CONDITION_FIELDS,
  OPERATOR_LABELS, ACTIONS, ACTION_LABELS,
  type Trigger, type Condition, type Action, type ActionKind,
} from "@/lib/automation/types";
import { cn } from "@/lib/cn";
import { ArrowLeft, Plus, Trash2, Zap, Filter, Play } from "lucide-react";

/**
 * The rule builder: trigger → conditions → actions, in that order, one step per
 * card. The available conditions change with the trigger, so it is impossible
 * to build a rule that compares a field the trigger never provides.
 */
export function RuleBuilder({
  rule,
}: {
  rule?: {
    id: string;
    name: string;
    description: string | null;
    trigger: string;
    conditions: Condition[];
    actions: Action[];
    enabled: boolean;
  };
}) {
  const [name, setName] = React.useState(rule?.name ?? "");
  const [description, setDescription] = React.useState(rule?.description ?? "");
  const [trigger, setTrigger] = React.useState<Trigger>((rule?.trigger as Trigger) ?? "SUPPLIER_REFUND_OVERDUE");
  const [conditions, setConditions] = React.useState<Condition[]>(rule?.conditions ?? []);
  const [actions, setActions] = React.useState<Action[]>(
    rule?.actions ?? [{ kind: "NOTIFY", message: "", severity: "WARNING" }],
  );
  const [enabled, setEnabled] = React.useState(rule?.enabled ?? true);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { toast } = useToast();
  const router = useRouter();

  const fields = CONDITION_FIELDS[trigger];

  // Changing the trigger invalidates any condition on a field it does not offer.
  const changeTrigger = (next: Trigger) => {
    setTrigger(next);
    const allowed = new Set(CONDITION_FIELDS[next].map((f) => f.field));
    setConditions((current) => current.filter((c) => allowed.has(c.field)));
  };

  const addCondition = () => {
    if (fields.length === 0) return;
    setConditions((current) => [...current, { field: fields[0].field, operator: "gte", value: 0 }]);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});

    const result = await saveAutomationRuleAction({
      id: rule?.id,
      name,
      description: description || undefined,
      trigger,
      conditions,
      actions,
      enabled,
    });
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast({ tone: "error", title: "Couldn't save", description: result.error });
      return;
    }

    toast({
      tone: "success",
      title: rule ? "Automation updated" : "Automation created",
      description: enabled ? "It will run with each sync." : "It is saved but paused.",
    });
    router.push("/automation");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/automation" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden />
        All automations
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        {rule ? `Edit “${rule.name}”` : "New automation"}
      </h1>

      <Card>
        <CardHeader title="Name it" description="Something you will recognise in an alert three weeks from now." />
        <CardBody className="space-y-4">
          <Field label="Name" htmlFor="rule-name" error={errors.name} required>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chase suppliers after 10 days"
              invalid={!!errors.name}
            />
          </Field>
          <Field label="What it's for" htmlFor="rule-description" hint="Optional, but future-you will thank you.">
            <Textarea
              id="rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything still unanswered after ten days gets raised so it does not quietly become a write-off."
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Zap className="size-4 text-brand" aria-hidden />When this happens</span>}
          description="The event that starts the rule."
        />
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRIGGERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeTrigger(option)}
                aria-pressed={trigger === option}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  trigger === option
                    ? "border-brand bg-brand-soft ring-1 ring-brand/25"
                    : "border-line hover:border-line-strong hover:bg-surface-hover",
                )}
              >
                <span className="block text-base font-medium text-ink">{TRIGGER_LABELS[option]}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{TRIGGER_DESCRIPTIONS[option]}</span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Filter className="size-4 text-brand" aria-hidden />Only if</span>}
          description={
            fields.length === 0
              ? "This trigger has nothing to filter on — it fires whenever the event happens."
              : "Every condition must be true. Leave empty to fire on every event."
          }
          action={
            fields.length > 0 && conditions.length < 6 ? (
              <Button size="sm" variant="secondary" onClick={addCondition}>
                <Plus className="size-3.5" aria-hidden />
                Add condition
              </Button>
            ) : null
          }
        />
        <CardBody>
          {conditions.length === 0 ? (
            <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
              {fields.length === 0
                ? "Nothing to configure here."
                : "No conditions — this rule will fire every time the event happens."}
            </p>
          ) : (
            <ul className="space-y-2">
              {conditions.map((condition, index) => {
                const field = fields.find((f) => f.field === condition.field) ?? fields[0];
                return (
                  <li key={index} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-sunken p-3">
                    <Field label="Field" htmlFor={`cf-${index}`} className="min-w-40 flex-1">
                      <Select
                        id={`cf-${index}`}
                        value={condition.field}
                        onChange={(e) =>
                          setConditions((c) =>
                            c.map((item, i) => (i === index ? { ...item, field: e.target.value } : item)),
                          )
                        }
                      >
                        {fields.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                      </Select>
                    </Field>

                    <Field label="Is" htmlFor={`co-${index}`} className="min-w-36">
                      <Select
                        id={`co-${index}`}
                        value={condition.operator}
                        onChange={(e) =>
                          setConditions((c) =>
                            c.map((item, i) =>
                              i === index ? { ...item, operator: e.target.value as Condition["operator"] } : item,
                            ),
                          )
                        }
                      >
                        {Object.entries(OPERATOR_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
                    </Field>

                    <Field
                      label={field.type === "money" ? "Amount (in pence)" : field.type === "percent" ? "Percent" : "Value"}
                      htmlFor={`cv-${index}`}
                      className="w-32"
                    >
                      <Input
                        id={`cv-${index}`}
                        inputMode="numeric"
                        value={String(condition.value)}
                        onChange={(e) =>
                          setConditions((c) =>
                            c.map((item, i) => (i === index ? { ...item, value: Number(e.target.value) || 0 } : item)),
                          )
                        }
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => setConditions((c) => c.filter((_, i) => i !== index))}
                      aria-label={`Remove condition ${index + 1}`}
                      className="mb-1.5 grid size-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-negative-soft hover:text-negative"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>

                    <p className="w-full text-xs text-ink-muted">{field.help}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Play className="size-4 text-brand" aria-hidden />Then do this</span>}
          description="Everything here is internal and reversible. No automation can refund a buyer, message anyone or change a listing."
          action={
            actions.length < 4 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActions((a) => [...a, { kind: "NOTIFY", message: "", severity: "INFO" }])}
              >
                <Plus className="size-3.5" aria-hidden />
                Add action
              </Button>
            ) : null
          }
        />
        <CardBody>
          {errors.actions ? <p className="mb-2 text-sm text-negative">{errors.actions}</p> : null}
          <ul className="space-y-2">
            {actions.map((action, index) => (
              <li key={index} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-sunken p-3">
                <Field label="Action" htmlFor={`ak-${index}`} className="min-w-48 flex-1">
                  <Select
                    id={`ak-${index}`}
                    value={action.kind}
                    onChange={(e) =>
                      setActions((a) =>
                        a.map((item, i) => (i === index ? { ...item, kind: e.target.value as ActionKind } : item)),
                      )
                    }
                  >
                    {ACTIONS.map((kind) => <option key={kind} value={kind}>{ACTION_LABELS[kind]}</option>)}
                  </Select>
                </Field>

                <Field label="Message" htmlFor={`am-${index}`} className="min-w-52 flex-[2]">
                  <Input
                    id={`am-${index}`}
                    value={action.message ?? ""}
                    onChange={(e) =>
                      setActions((a) => a.map((item, i) => (i === index ? { ...item, message: e.target.value } : item)))
                    }
                    placeholder="Supplier refund still outstanding"
                  />
                </Field>

                {action.kind === "NOTIFY" || action.kind === "FLAG_ORDER" ? (
                  <Field label="Severity" htmlFor={`as-${index}`} className="w-32">
                    <Select
                      id={`as-${index}`}
                      value={action.severity ?? "INFO"}
                      onChange={(e) =>
                        setActions((a) =>
                          a.map((item, i) =>
                            i === index ? { ...item, severity: e.target.value as Action["severity"] } : item,
                          ),
                        )
                      }
                    >
                      <option value="INFO">Information</option>
                      <option value="WARNING">Warning</option>
                      <option value="CRITICAL">Critical</option>
                    </Select>
                  </Field>
                ) : null}

                {actions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setActions((a) => a.filter((_, i) => i !== index))}
                    aria-label={`Remove action ${index + 1}`}
                    className="mb-1.5 grid size-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-negative-soft hover:text-negative"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Run this automation"
            description="Paused rules keep their settings and history but never fire. You can still run them by hand."
          />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2 pb-4">
        <Link
          href="/automation"
          className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-base font-medium shadow-sm hover:bg-surface-hover"
        >
          Cancel
        </Link>
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!name.trim()}>
          {rule ? "Save changes" : "Create automation"}
        </Button>
      </div>
    </div>
  );
}
