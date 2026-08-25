import type { Metadata } from "next";
import { startOfMonth, endOfMonth, format, parse, isValid } from "date-fns";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { param, type SearchParams } from "@/lib/params";
import { loadOrders, totalsForPeriod } from "@/lib/finance/aggregate";
import { periodOrderWhere } from "@/lib/finance/aggregate";
import type { RefundAttribution } from "@/lib/finance/types";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ExpensesClient } from "./expenses-client";
import { Receipt } from "lucide-react";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("expenses.manage");
  const params = await searchParams;

  const monthParam = param(params, "month");
  const parsed = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const month = isValid(parsed) ? parsed : new Date();

  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const period = { key: "custom" as const, label: format(month, "MMMM yyyy"), from, to, unbounded: false };

  const [expenses, orders] = await Promise.all([
    prisma.expense.findMany({
      where: { workspaceId: auth.workspace.id, date: { gte: from, lte: to } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    loadOrders(periodOrderWhere(auth.workspace.id, period, auth.workspace.refundAttribution as RefundAttribution)),
  ]);

  const expensesMinor = expenses.reduce((s, e) => s + e.amountMinor, 0);
  const totals = totalsForPeriod(
    orders,
    period,
    auth.workspace.refundAttribution as RefundAttribution,
    auth.workspace.currency,
    expensesMinor,
  );

  // Gross profit for the month is the order side only; expenses are what this
  // page adds to reach true net profit.
  const grossProfitMinor = totals.unpricedOrderCount > 0
    ? totals.pricedNetProfitMinor + expensesMinor
    : totals.grossProfitMinor - totals.refundLossMinor;

  return (
    <PageContainer>
      <PageHeader
        title="Expenses"
        description="Monthly business costs — payroll, software, ads — for true net profit."
        icon={Receipt}
      />

      <ExpensesClient
        month={format(month, "yyyy-MM")}
        monthLabel={format(month, "MMMM yyyy")}
        currency={auth.workspace.currency}
        grossProfitMinor={grossProfitMinor}
        expensesMinor={expensesMinor}
        orderCount={totals.orderCount}
        pricedOrderCount={totals.pricedOrderCount}
        expenses={expenses.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          category: e.category,
          description: e.description,
          amountMinor: e.amountMinor,
          recurring: e.recurring,
          source: e.source,
        }))}
      />
    </PageContainer>
  );
}
