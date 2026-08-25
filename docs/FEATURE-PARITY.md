# Feature parity with the reference product

Every materially relevant capability demonstrated in the supplied videos and
screenshots, traced to where it lives in DropInsight and to the test that covers
it.

Requirement IDs (R1–R19) and improvement IDs (I1–I11) are defined in
[`VIDEO-REQUIREMENTS.md`](VIDEO-REQUIREMENTS.md), which quotes the source
commentary with timestamps.

**Legend** — Built: ✅ shipped · ➕ shipped and extended beyond the reference ·
⚠️ blocked by an external dependency, documented.

---

## Core promise

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R1.1 | Track profit, loss, expenses and refunds for eBay dropshipping | V1 00:22 | Whole product | ✅ | `pnl-reconciles.test.ts` |
| R1.2 | Close the loop on supplier refunds | V1 00:42–00:53 | `/profit-protection`, `/returns` | ➕ | `refunds.spec.ts` |

## Onboarding and connection

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R2.1 | Sign up → connect eBay → data flows | V1 01:06 | `/onboarding` 4-step flow | ➕ | `auth.spec.ts` |
| R2.2 | Automatic sync on a short interval | V1 01:22 | `lib/sync/scheduler.ts`, 5-min cadence | ✅ | `workflows.spec.ts` |
| R2.3 | Manual **Sync now** and **Import history** | Connections tab | `/ebay-accounts` | ✅ | `workflows.spec.ts` |
| R2.4 | Currency from marketplace, never converted | Settings → General | `connect/callback`, `lib/money.ts` | ✅ | `money.test.ts` |

## Refund-loss attribution — the headline business rule

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R3.1 | Two modes, refund-arrival default | V1 01:58–05:10 | Dashboard prompt, onboarding step 4 | ✅ | `workflows.spec.ts` |
| R3.2 | Affects reporting only; nothing stored changes | V1 02:10 | `totalsForPeriod` dates losses at read time | ✅ | `aggregate.test.ts` |
| R3.3 | Explained with the July/August example | V1 02:21 | `REFUND_ATTRIBUTION_COPY` | ✅ | `workflows.spec.ts` |

## Buying price — the user-supplied half

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R4.1 | User enters supplier buying price | V1 05:25 | `CostEntry` ledger | ✅ | `orders.spec.ts` |
| R4.2 | "N orders awaiting buying price · £X not in this profit yet" | Dashboard | Both period cards, outstanding tiles, P&L notice | ➕ | `dashboard.spec.ts`, `finance.spec.ts` |
| R4.3a | Inline **Add cost** | Orders table | `InlineCostCell`, with cost-history suggestion | ➕ | `orders.spec.ts` |
| R4.3b | **Spreadsheet mode** — paste, Enter, ⌘D | V2 00:07 | `SpreadsheetModeDialog` | ✅ | `orders.spec.ts` |
| R4.3c | **CSV import** with column mapping | V2 00:33–01:34 | `ImportCostsDialog` + `/api/costs/import` | ➕ | `orders.spec.ts` |
| R4.4 | Price is per unit × quantity | Spreadsheet header | `calculateOrderProfit` | ✅ | `profit.test.ts` |
| R4.5 | Payout/profit columns in the sheet ignored | V2 01:07 | Import maps only order no., price, supplier | ✅ | `orders.spec.ts` |

## Supplier refund recovery — "a game changer"

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R5.1 | Four answers: received / expecting / partial / no | V2 02:41–02:55 | `SupplierClaimAnswer` | ➕ | `refunds.spec.ts` |
| R5.2 | Answers update order profit immediately | Chase queue subtitle | Revalidates every profit surface | ✅ | `refunds.spec.ts` |
| R5.3 | Tabs: Refunds / Returns / Cancelled; Needs answer / Expecting / Settled / All | Refunds page | `/returns` | ✅ | `refunds.spec.ts` |
| R5.4 | Columns incl. fee credit, recovered, order profit | Refunds table | `RefundsTable` | ✅ | `refunds.spec.ts` |
| R5.5 | KPIs: recovered / recoverable / overdue / written off | Profit Protection | `ProtectionKpis` | ✅ | `refunds.spec.ts` |
| R5.6 | Chase queue with age and four record-answer controls | Profit Protection | `ChaseQueue` + bulk answering | ➕ | `refunds.spec.ts` |

## Cancellations, break-even, dashboard

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R6.1 | Cancelled-before-fulfilment excluded from losses | V2 03:28–04:13 | `cancelState`, zeroed in profit | ✅ | `profit.test.ts`, `pnl-reconciles.test.ts` |
| R7.1 | Below-break-even detection | V2 04:22–04:43 | `breakEvenPriceMinor`, price-floor panel | ➕ | `profit.test.ts`, `refunds.spec.ts` |
| R7.2 | **Made a loss** filter | Orders chips | Orders tab | ✅ | `orders.spec.ts` |
| R8.1 | This month + comparison window side by side | Dashboard | `PeriodCard` ×2 | ✅ | `dashboard.spec.ts` |
| R8.2 | Net profit, revenue, margin, orders, refunds with % change | Dashboard | `PeriodCard` | ✅ | `dashboard.spec.ts` |
| R8.3 | Awaiting-buying-price banner in each card | Dashboard | `PeriodCard` | ✅ | `dashboard.spec.ts` |
| R8.4 | "Outstanding right now — not tied to the periods above" | Dashboard | `OutstandingRow` | ✅ | `dashboard.spec.ts` |
| R8.5 | Supplier-refund settlement banner | Dashboard | `OutstandingRow` | ✅ | — |
| R8.6 | eBay account status with thresholds | V1 08:16 | `AccountHealthPanel` | ✅ | — |
| R8.7 | Dispatch and delivery, last 7 days | V1 08:40 | `AccountHealthPanel` | ✅ | — |
| R8.8 | Revenue and profit daily chart with tooltip | V1 09:04 | `RevenueProfitChart` | ✅ | `dashboard.spec.ts` |
| R8.9 | Needs attention, Top products | V1 09:33 | `AttentionPanel`, `TopProductsPanel` | ✅ | — |

## Orders, products, suppliers, expenses

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R9.1 | Date-range chips | Orders | `PeriodPicker` | ✅ | `orders.spec.ts` |
| R9.2 | Eight fulfilment chips with live counts | Orders | `FilterChips` | ✅ | `orders.spec.ts` |
| R9.3 | Status tabs with counts | Orders | `SegmentedControl` | ✅ | `orders.spec.ts` |
| R9.4 | Full column set, configurable | Orders | `DataTable`, responsive hiding | ✅ | `orders.spec.ts` |
| R9.5 | Search order/buyer/SKU/tracking | Orders | Server-side, URL-persisted | ➕ | `orders.spec.ts` |
| R9.6 | Spreadsheet mode + import in the header | Orders | `OrdersToolbar` | ✅ | `orders.spec.ts` |
| R10.1 | Listings built from orders | Products | `ensureProduct` during sync | ✅ | — |
| R10.2 | Cost range, last cost, margin, refunds, stock | Products | `ProductsTable` | ✅ | — |
| R10.4 | *(none — reference has no equivalent)* | — | `assessListing` verdicts, filter chips, at-stake totals | ➕ | `listing-health.test.ts` |
| R10.3 | Cost history powers buying-price suggestions | Products subtitle | `suggestCostAction`, surfaced at entry | ➕ | `orders.spec.ts` |
| R11.1–2 | Suppliers created implicitly, with spend and reliability | Suppliers | `querySuppliers` | ➕ | — |
| R11.3 | Supplier comparison in Analytics | V2 06:44 | `SupplierComparison` | ✅ | — |
| R12.1 | Month-by-month navigation | Expenses | `/expenses?month=` | ✅ | `finance.spec.ts` |
| R12.2 | Gross profit / expenses / true net profit | Expenses | `ExpensesClient` | ✅ | `finance.spec.ts` |
| R12.3 | Inline add with recurring toggle | Expenses | `AddExpenseForm` | ✅ | `finance.spec.ts` |
| R12.4 | **Copy last month's recurring** | Expenses | `copyRecurringExpensesAction` | ✅ | — |
| R12.5 | eBay fees imported, read-only | V2 05:43 | `importStoreFees`, badged | ✅ | `finance.spec.ts` |

## Analytics, reports, insights, support, settings

| Ref | Reference feature | Evidence | DropInsight | Built | Tested |
|---|---|---|---|---|---|
| R13.1–2 | Period chips, trends switcher | Analytics | `AnalyticsTrends` | ✅ | — |
| R13.3 | Most / least profitable | Analytics | `ProfitableProducts` | ✅ | — |
| R14.1 | Period selector for exports | Reports | `ReportsClient` | ✅ | `finance.spec.ts` |
| R14.2a | Orders CSV | Reports | `/api/export/orders` | ✅ | `finance.spec.ts` |
| R14.2b | Monthly P&L CSV | Reports | `/api/export/pnl` | ✅ | `finance.spec.ts` |
| R14.2c | Product performance CSV | Reports | `/api/export/products` | ✅ | `finance.spec.ts` |
| R14.2d | Expenses CSV | Reports | `/api/export/expenses` | ✅ | `finance.spec.ts` |
| R14.2e | **Monthly P&L PDF** | V2 06:50 | `/api/export/pnl-pdf`, dependency-free writer | ✅ | `finance.spec.ts` |
| R15.1–3 | Automatic insights, dismissible, refreshable | Insights | `lib/insights.ts`, six kinds | ➕ | `workflows.spec.ts` |
| R16.1 | In-app ticketing with replies | Support | `/support` | ✅ | `workflows.spec.ts` |
| R17.1 | Workspace name, currency, attribution | Settings → General | `/settings` | ✅ | `workflows.spec.ts` |
| R17.2 | Team invites + role matrix from enforced rules | V2 07:45–08:07 | `/settings/team`, generated from `can()` | ➕ | `roles.spec.ts` |
| R17.3 | Connections: status, sync, history, disconnect, activity | Connections | `/ebay-accounts` | ✅ | `workflows.spec.ts` |
| R17.4 | Billing: trial countdown, usage, limits, plans | Billing | `/settings/billing` | ✅ | — |
| R17.5 | Activity log | Settings | `/settings/activity` | ✅ | — |
| R18 | Solo / Multi / Custom with account limits | Plans | `lib/plans.ts`, enforced at connect | ✅ | — |
| R19.1 | Workspace switcher, ⌘K search, notifications, theme, avatar | Header | `components/shell/` | ✅ | `workflows.spec.ts` |
| R19.2 | Sidebar collapse, live connection pill | Sidebar | `Sidebar`, `ConnectionPill` | ✅ | — |

---

## Where DropInsight goes beyond the reference

| Ref | Problem observed in the reference | What DropInsight does |
|---|---|---|
| I1 | Dashboard showed −£65.57 and 0.0% margin because 175 orders had no cost, with no explanation | Cost coverage is first-class: profit is computed over priced orders only, every figure states its basis, and the P&L excludes uncosted orders rather than under-costing them |
| I2 | Products page promises cost-history suggestions; nothing suggests anything at entry | Suggestions surface in the inline cell, the order page and every spreadsheet row |
| I3 | Chase queue shows "Not asked" with no bulk action | Bulk answering with confirmation on the two that move money |
| I4 | Refund questions only as stacked cards on one page | Also in the chase queue, the refunds table and the order page — answerable wherever you meet them |
| I5 | Notification bell with a badge and no notification centre | Real centre with severity, entity links, read state and bulk actions |
| I6 | No automation | Trigger → conditions → actions builder, run-now, execution history |
| I7 | Near-empty analytics with no guidance | Empty states that explain what is missing and link to the fix |
| I8 | Reports are download-only | Full on-screen P&L with breakdown, trend and period comparison |
| I9 | No sorting, saved views or URL-persisted filters | Server-side sort/filter/paginate, all in the URL |
| I10 | Desktop-only | Responsive to 375px, verified by an automated sweep |
| I11 | Colour alone signals status | Icon + word + colour everywhere |
| I12 | Products page is a sortable grid of numbers; you have to already know what a bad listing looks like to spot one | Every listing carries a verdict, a reason, an action and a money-at-stake figure. The page opens with "N listings need attention — £X at stake" and a button that filters straight to the worst of them. See `src/lib/finance/listing-health.ts` |

## Deliberately not built

| Reference feature | Why |
|---|---|
| Baiord branding, wordmark, copy | Explicitly out of scope — DropInsight has its own identity |
| Live chat widget | Not demonstrated in the videos; the ticket system covers the need |
| Stock batches | Mentioned once in the role matrix, never shown. The permission exists; the feature is not invented from a label |
