# Architecture

How DropInsight is put together, and why.

---

## 1. The problem shaping the design

eBay knows the sale price and the fees. It does not know what you paid your
supplier — that lives in the seller's head, a spreadsheet, or an AliExpress
order confirmation. Profit is therefore only knowable once a human supplies the
missing half.

Almost every design decision below follows from that single fact:

- Costs need a **write path that is fast at volume** (a few hundred entries at a
  sitting), which is why there is a spreadsheet mode, a CSV importer and inline
  editing — all writing through one ledger.
- Profit figures need to be **honest about their own completeness**, which is why
  `PeriodTotals` carries a parallel priced-only basis.
- Refunds need **a second half** — did the supplier pay you back — which is a
  workflow, not a field.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router | Server components keep financial aggregation on the server; server actions give mutations without a hand-written API layer |
| Language | TypeScript, `strict` | Money bugs are type bugs surprisingly often |
| Styling | Tailwind v4 | Token-driven; the semantic layer makes dark mode a palette swap |
| Database | Prisma 6 + SQLite → Postgres | One provider change; no application code moves |
| Charts | Recharts 3 | Composable, and colours resolve from CSS variables so charts follow the theme |
| Validation | Zod | Same schema shapes the parse and the error message |
| Tests | Vitest + Playwright | Fast unit loop, real-browser workflows |

**Prisma 6, not 7.** Prisma 7 requires driver adapters and moves the datasource
URL into a config file — added native dependencies and setup friction for no
benefit at this size.

**No Redis, no queue broker.** The job queue is a database table and a tick
endpoint. That is genuinely enough for the load a dropshipping business
generates, and it removes an entire piece of infrastructure from the deployment.
The seam is narrow enough to swap later.

---

## 3. Money

`src/lib/money.ts` is the only place a currency string is parsed.

Every monetary column is an `Int` of **minor units** — pence, cents. Parsing
works on the decimal string rather than multiplying a float, because
`1.15 * 100` is `114.99999999999999` and a P&L that is a penny out is a P&L
nobody trusts.

`allocate(total, weights)` splits an amount across parts without losing or
inventing a unit — the remainder goes to the largest fractional parts. Used when
apportioning order-level fees down to line items. There is a 500-case fuzz test.

Currencies are stored next to the amounts that own them. Amounts are **never
converted**: the display currency is a reporting label, set from the first
connected marketplace, exactly as the reference product does.

---

## 4. The profit engine

```
revenue        = itemSubtotal + shippingCharged        (tax excluded; eBay remits it)
costOfGoods    = Σ unitCost × quantity                 (only lines that have a cost)
grossProfit    = revenue − costOfGoods − ebayFees − adFees
refundLoss     = max(0, buyerRefund − feeCredit − recovered)
netProfit      = grossProfit − refundLoss
margin         = netProfit ÷ revenue                   (null when revenue is 0)
```

`calculateOrderProfit` in `src/lib/finance/profit.ts` is the only implementation.

### Four invariants, each with a test

1. **A refund can never become a gain.** `refundLoss` is floored at zero. If eBay
   credits back more than the buyer received, that is a fee correction, not
   profit.

2. **Unpriced orders are excluded, not zero-costed.** An order with no buying
   price would otherwise contribute revenue and fees but no cost — inflating
   profit. `PeriodTotals` therefore carries a parallel `priced*` basis, and the
   UI reports which one it is showing and over how many orders.

3. **The P&L adds up.** `income − costs === netProfit`, exactly. To make that
   hold while still listing fee credits and supplier recovery as separate income
   lines, each is capped so the pair can never exceed what the refund cost:
   `buyerRefund − effectiveFeeCredit − effectiveRecovered = refundLoss`.

4. **Cancelled-before-fulfilment orders are counted, never charged.** Nothing was
   bought, so there is no revenue, no cost and no loss.

`tests/integration/pnl-reconciles.test.ts` asserts all of these against the
seeded database, so a regression fails the build rather than reaching a user.

### Refund-loss attribution

A July sale refunded in August: which month carries the loss?

| Mode | Rule | Who picks it |
|---|---|---|
| `REFUND_MONTH` *(default)* | August | Anyone who closes and locks a month, then handles later refunds in the month they arrive |
| `ORDER_MONTH` | July | Anyone who wants each month to show what its orders truly earned |

This affects only how dashboards, analytics and reports *date* a loss. Nothing
stored changes, which is why it is safe to switch — and the UI says so.

---

## 5. The eBay integration

```
          ┌─────────────────┐
          │   EbayClient    │  the contract
          └────────┬────────┘
         ┌─────────┴─────────┐
   LiveEbayClient      MockEbayClient
   (Sell APIs)         (deterministic generator)
         └─────────┬─────────┘
              Sync engine  ──▶  upsert  ──▶  Prisma
```

Everything above the interface — sync, profit, UI — is written against
`EbayClient` alone. Swapping the implementation changes nothing else, which is
what makes the mock worth having: it exercises the same code path rather than a
parallel one.

### The live client

- **Fulfillment API** for orders. `filter=lastmodifieddate:[…]` is what makes
  incremental sync possible; `creationdate` misses status changes on old orders.
- **Finances API** for fees, keyed by order id. Without this, profit is
  overstated by the marketplace's cut — the single most important detail in the
  integration.
- **Analytics API** for seller standards, shown with eBay's own thresholds.

Amounts arrive as decimal strings and are converted to minor units at the
boundary. Errors are classified into retryable and terminal, so the engine knows
whether to back off or to ask the user to reconnect.

### The mock adapter

Generates a full account from a seeded PRNG — same account id, same data, every
time. Fees really are 12.9% of the sale; a refunded order really does have a
refund row; a cancelled-before-dispatch order really has no tracking. The books
balance because the generator computes them the way eBay does.

It is flagged on the account, badged in the UI, and refused when
`EBAY_ADAPTER=live`.

---

## 6. Sync engine

Four properties, each deliberate:

**Idempotent.** Orders key on `(ebayAccountId, ebayOrderId)`, refunds on
`(orderId, ebayRefundId)`. Incremental syncs deliberately overlap by an hour,
because eBay's last-modified index is eventually consistent and re-reading an
order is free.

**Non-destructive.** A sync writes eBay's fields only. `supplierClaim`,
`recoveredMinor`, cost entries and notes belong to the user; eBay has no opinion
about them.

**Resumable.** Progress and a cursor are written after every page, so a job
killed halfway resumes rather than restarts. A large history import queues its
own continuation instead of monopolising the worker.

**Honest about failure.** A job that imported 300 of 900 orders finishes
`PARTIAL` with the reason attached — never `SUCCESS`, never silence. Auth
failures mark the account and raise a notification instead of retrying forever.

The worker is driven by `POST /api/jobs/tick`, authorised either by a signed-in
session (the in-app poller) or a bearer token (cron).

---

## 7. Access control

`src/lib/auth/permissions.ts` holds one matrix. `can(role, permission)` is
called by the server on every page and every mutation.

Settings → Team renders its "what each role can do" table **from that same
function**, so the documentation cannot drift away from the enforcement. The
e2e suite checks that a VA is *refused* the dashboard by the server, not merely
that the link is hidden.

Sessions are opaque random tokens; only their SHA-256 is stored, so a database
leak does not hand out live sessions. Passwords are Argon2id. eBay tokens are
AES-256-GCM encrypted and never leave the server.

---

## 8. Data model

Twenty-four tables. The ones that carry the design:

- **`CostEntry`** — the cost ledger. Inline editing, spreadsheet mode and CSV
  import all append here; the newest wins and the rest is history, which is what
  powers buying-price suggestions and the "rising supplier cost" insight.
- **`Refund`** — carries both sides: what eBay did (`buyerRefundMinor`,
  `feeCreditMinor`) and what the user knows (`supplierClaim`, `recoveredMinor`).
  Sync only ever touches the first half.
- **`Order.cancelState`** — distinguishes cancelled-before-fulfilment (costless)
  from cancelled-after (a real loss). The reference product's commentary called
  this out explicitly and it materially changes the numbers.
- **`SyncJob` / `SyncLog`** — the queue and its audit trail.
- **`AuditLog`** — anything that moved money, changed access, or touched an
  integration.

Indexed on the paths the app actually queries: `(workspaceId, orderDate)`,
`(workspaceId, fulfillmentStatus)`, `(orderItemId, createdAt)` on the cost
ledger, `supplierClaim` on refunds.

---

## 9. Query strategy

Most filtering is pushed to the database. Two predicates cannot be —
"awaiting cost" and "made a loss" both depend on the cost ledger and computed
profit — so those narrow to a bounded candidate set first and filter in memory.
The cost is real and it is bounded and commented, rather than hidden behind an
`ORM.findMany()` that pulls the whole table.

Table state lives in the URL. That makes a filtered view shareable,
bookmarkable and survivable across the back button — the three things that make
the reference product's tables frustrating. Updates batch into one `replace()`.

---

## 10. Design system

Three layers, resolved in order:

1. **Primitives** — raw colour ramps. Never referenced by a component.
2. **Semantics** — `--canvas`, `--ink`, `--positive`, `--sidebar`… what a colour
   is *for*. Components use only these.
3. **Components** — the few composites worth naming (`.card`, `.table-scroll`).

Because components never reach past the semantic layer, dark mode is a palette
swap rather than a second stylesheet.

Financial figures use tabular numerals so columns align. Status is always
**icon + word + colour**, never colour alone. Every chart offers a table
alternative. Motion is opt-out via `prefers-reduced-motion`.

Two scripts guard the responsive behaviour: `check:responsive` sweeps every page
at 375/768/1280 for horizontal overflow, and `check:tables` confirms wide tables
still scroll inside their own containers — because the fix for one can silently
break the other.

---

## 11. Deliberate limitations

Stated plainly rather than disguised:

- **No email provider.** Password-reset and invitation links are logged
  server-side and the invitation link is handed to the inviter to pass on. The
  UI says so instead of claiming an email was sent.
- **No payment processor.** Choosing a plan updates entitlements immediately but
  takes no payment, and the UI says so. Because every gate asks
  `entitlementsFor()` rather than checking a plan string, wiring Stripe means
  changing one action and adding a webhook.
- **Rate limiting is in-process.** Fine for a single Node instance. On multiple
  instances, `src/lib/rate-limit.ts` is the one module to swap for Redis; the
  interface is deliberately narrow. Sign-in is limited on two axes — tightly per
  account, loosely per IP — so a shared office behind one NAT is not locked out
  by a colleague mistyping a password.
- **Categories are derived from product titles.** eBay's category is not on the
  Fulfillment payload. Used for a breakdown chart only, never in a financial
  calculation, and the UI says it is a guide.
