"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, parse, addMonths, subMonths } from "date-fns";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Money } from "@/components/domain/money";
import { KpiCard } from "@/components/domain/kpi-card";
import {
  addExpenseAction, updateExpenseAction, deleteExpenseAction, copyRecurringExpensesAction,
} from "@/server/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import {
  ChevronLeft, ChevronRight, Plus, Copy, Trash2, Pencil, Repeat,
  Receipt, TrendingUp, Wallet, Link2, Check, X,
} from "lucide-react";

interface ExpenseView {
  id: string;
  date: string;
  category: string;
  description: string;
  amountMinor: number;
  recurring: boolean;
  source: string;
}

export function ExpensesClient({
  month, monthLabel, currency, grossProfitMinor, expensesMinor,
  orderCount, pricedOrderCount, expenses,
}: {
  month: string;
  monthLabel: string;
  currency: string;
  grossProfitMinor: number;
  expensesMinor: number;
  orderCount: number;
  pricedOrderCount: number;
  expenses: ExpenseView[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ExpenseView | null>(null);
  const [copying, setCopying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const current = parse(month, "yyyy-MM", new Date());
  const goToMonth = (date: Date) => router.push(`/expenses?month=${format(date, "yyyy-MM")}`);

  const trueNetMinor = grossProfitMinor - expensesMinor;

  const copyRecurring = async () => {
    setCopying(true);
    const result = await copyRecurringExpensesAction(month);
    setCopying(false);

    if (!result.ok) {
      toast({ tone: "info", title: "Nothing to copy", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: `${result.data!.copied} recurring expenses copied`,
      description: result.data!.skipped > 0 ? `${result.data!.skipped} were already here.` : undefined,
    });
    router.refresh();
  };

  const remove = async (expense: ExpenseView) => {
    setBusy(true);
    const result = await deleteExpenseAction(expense.id);
    setBusy(false);
    setDeleting(null);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't remove that", description: result.error });
      return;
    }

    const restore = result.data!.restore;
    toast({
      tone: "success",
      title: "Expense removed",
      description: expense.description,
      onUndo: async () => {
        await addExpenseAction(restore);
        router.refresh();
      },
    });
    router.refresh();
  };

  const byCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of expenses) {
      map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amountMinor);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => goToMonth(subMonths(current, 1))}
            aria-label={`Go to ${format(subMonths(current, 1), "MMMM yyyy")}`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel}</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => goToMonth(addMonths(current, 1))}
            aria-label={`Go to ${format(addMonths(current, 1), "MMMM yyyy")}`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        <Button variant="secondary" onClick={() => void copyRecurring()} loading={copying}>
          <Copy className="size-4" aria-hidden />
          Copy last month&rsquo;s recurring
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Gross profit"
          icon={TrendingUp}
          tone={grossProfitMinor >= 0 ? "positive" : "negative"}
          value={<Money minor={grossProfitMinor} currency={currency} signed />}
          footer={`from ${orderCount.toLocaleString()} orders this month`}
          coverage={{ priced: pricedOrderCount, total: orderCount }}
          explain="Order profit after supplier costs, eBay fees and refund losses — before the expenses on this page."
        />
        <KpiCard
          label="Expenses"
          icon={Receipt}
          tone="negative"
          value={<Money minor={expensesMinor} currency={currency} />}
          footer={`${expenses.length} item${expenses.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="True net profit"
          icon={Wallet}
          tone={trueNetMinor >= 0 ? "positive" : "negative"}
          value={<Money minor={trueNetMinor} currency={currency} signed />}
          footer="gross profit less expenses"
        />
      </div>

      <AddExpenseForm month={month} currency={currency} onAdded={() => router.refresh()} />

      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <Card className="overflow-hidden">
          <CardHeader title={`${monthLabel} expenses`} description={`${expenses.length} recorded`} />

          {expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nothing recorded this month"
              description="Add your software subscriptions, VA hours and ad spend so your net profit is the real one. Anything you mark as recurring can be copied forward next month."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {expenses.map((expense) =>
                editing === expense.id ? (
                  <li key={expense.id} className="bg-surface-sunken/50 p-4">
                    <EditExpenseRow
                      expense={expense}
                      currency={currency}
                      onDone={() => { setEditing(null); router.refresh(); }}
                      onCancel={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <li key={expense.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <Badge tone="neutral">{expense.category}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-ink">{expense.description}</p>
                      <p className="text-xs text-ink-muted">
                        <time dateTime={expense.date}>{format(new Date(expense.date), "d MMM yyyy")}</time>
                        {expense.recurring ? " · recurring" : ""}
                      </p>
                    </div>

                    {expense.source === "EBAY" ? (
                      <Badge tone="info" icon={Link2}>from eBay</Badge>
                    ) : expense.recurring ? (
                      <Badge tone="brand" icon={Repeat}>recurring</Badge>
                    ) : null}

                    <p className="tabular w-24 shrink-0 text-right text-base font-semibold">
                      <Money minor={expense.amountMinor} currency={currency} />
                    </p>

                    <div className="flex shrink-0 items-center gap-0.5">
                      {expense.source === "EBAY" ? (
                        <span className="px-2 text-xs text-ink-subtle">read-only</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(expense.id)}
                            aria-label={`Edit ${expense.description}`}
                            className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(expense)}
                            aria-label={`Remove ${expense.description}`}
                            className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-negative-soft hover:text-negative"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="By category" />
          <CardBody>
            {byCategory.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-muted">Nothing yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {byCategory.map(([category, minor]) => (
                  <li key={category}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink-muted">{category}</span>
                      <span className="shrink-0 font-medium"><Money minor={minor} currency={currency} /></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(3, (minor / expensesMinor) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
        title="Remove this expense?"
        message={
          deleting
            ? `“${deleting.description}” will be removed from ${monthLabel} and your net profit will go up accordingly. You can undo this straight after.`
            : ""
        }
        confirmLabel="Remove"
        loading={busy}
      />
    </>
  );
}

function AddExpenseForm({
  month, currency, onAdded,
}: {
  month: string;
  currency: string;
  onAdded: () => void;
}) {
  const [category, setCategory] = React.useState<string>("Software");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [recurring, setRecurring] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { toast } = useToast();
  const descriptionRef = React.useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await addExpenseAction({
      // Default to the first of the shown month, so navigating months and
      // adding does not silently file the cost under today.
      date: `${month}-01`,
      category,
      description,
      amount,
      recurring,
    });
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast({ tone: "error", title: "Couldn't add that", description: result.error });
      return;
    }

    setDescription("");
    setAmount("");
    setRecurring(false);
    descriptionRef.current?.focus();
    toast({ tone: "success", title: "Expense added" });
    onAdded();
  };

  return (
    <Card>
      <CardHeader title="Add an expense" />
      <CardBody>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[10rem_1fr_9rem_auto] sm:items-end">
          <Field label="Category" htmlFor="expense-category">
            <Select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <Field label="Description" htmlFor="expense-description" error={errors.description}>
            <Input
              id="expense-description"
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. VA salary"
              invalid={!!errors.description}
            />
          </Field>

          <Field label={`Amount (${currency})`} htmlFor="expense-amount" error={errors.amount}>
            <Input
              id="expense-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              invalid={!!errors.amount}
            />
          </Field>

          <div className="flex items-center gap-3 pb-1.5">
            <Checkbox
              id="expense-recurring"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              label={<span className="text-sm whitespace-nowrap">Recurring</span>}
            />
            <Button type="submit" variant="primary" loading={saving} disabled={!description.trim() || !amount.trim()}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function EditExpenseRow({
  expense, currency, onDone, onCancel,
}: {
  expense: ExpenseView;
  currency: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = React.useState(expense.category);
  const [description, setDescription] = React.useState(expense.description);
  const [amount, setAmount] = React.useState((expense.amountMinor / 100).toFixed(2));
  const [date, setDate] = React.useState(expense.date);
  const [recurring, setRecurring] = React.useState(expense.recurring);
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    const result = await updateExpenseAction({ id: expense.id, date, category, description, amount, recurring });
    setSaving(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't save", description: result.error });
      return;
    }
    toast({ tone: "success", title: "Expense updated" });
    onDone();
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[9rem_10rem_1fr_8rem_auto] sm:items-end">
      <Field label="Date" htmlFor={`d-${expense.id}`}>
        <Input id={`d-${expense.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Category" htmlFor={`c-${expense.id}`}>
        <Select id={`c-${expense.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Description" htmlFor={`n-${expense.id}`}>
        <Input id={`n-${expense.id}`} data-autofocus value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={`Amount (${currency})`} htmlFor={`a-${expense.id}`}>
        <Input id={`a-${expense.id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="flex items-center gap-2 pb-1.5">
        <Checkbox
          id={`r-${expense.id}`}
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          label={<span className="text-sm whitespace-nowrap">Recurring</span>}
        />
        <Button size="sm" variant="primary" onClick={() => void save()} loading={saving}>
          <Check className="size-3.5" aria-hidden />
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Cancel editing">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
