<div align="center">

# DropInsight

**Track. Analyse. Grow.**

The operating system for an eBay dropshipping business — real profit after fees,
costs and refunds, and the money your suppliers still owe you.

</div>

---

## What it is

eBay tells you what you sold. It does not tell you what you *made*.

DropInsight connects your eBay accounts and works out the number that actually
matters: revenue, minus eBay's fees, minus the price you paid your supplier,
minus the refunds you have given — plus whatever you have managed to claw back
from suppliers on those refunds.

That last part is where the money usually hides. When you refund a buyer, you
have generally already paid a supplier for the item. DropInsight asks whether
you got that money back, keeps asking until you answer, and folds the answer
straight into your profit.

## What makes it different

**It never presents an incomplete number as a complete one.** eBay supplies the
sale price and the fees; the supplier's buying price is something you enter.
Until you have, an order's cost is unknown — so DropInsight excludes it from the
profit figure entirely and says so, rather than quietly treating the cost as
zero and reporting a profit that is too high.

Everything follows from that:

| | |
|---|---|
| **Supplier refund recovery** | Every buyer refund raises one question — *did the supplier pay you back?* Four answers, one click, and the order's profit updates immediately. |
| **Break-even prices** | The lowest price each product can sell at and still cover its cost plus eBay's cut, using the fee rate your own orders actually paid. |
| **Cancellations are not losses** | An order cancelled before you bought anything cost you nothing. It is counted, never charged. |
| **Refund-loss dating** | Choose whether a refund reduces the month it arrived in or the month of the original sale. It changes every figure, so it is asked once, up front, with a worked example. |
| **A P&L that adds up** | Income minus costs equals net profit, exactly. There is a test that fails if it ever does not. |
| **Spreadsheet-speed costing** | Paste a block from Excel, `Enter` to move down, `⌘D` to fill a column. Each row is pre-filled with that product's last known cost. |
| **A verdict on every listing** | Each listing is judged on its own numbers — *losing money*, *priced too low*, *refunded often*, *thin margin*, *needs a cost*, *winner* or *steady* — with the reason, the fix, and the money at stake. Sort by profit if you like; the point is you should not have to. |

---

## Quick start

```bash
npm install
cp .env.example .env          # then set ENCRYPTION_KEY (see below)
npm run db:migrate            # create the database
npm run db:seed               # six months of realistic demo data
npm run dev
```

Open <http://localhost:3000> and sign in with any of:

| Email | Password | Role | What they see |
|---|---|---|---|
| `owner@dropinsight.test` | `dropinsight-demo` | Owner | Everything |
| `va@dropinsight.test` | `dropinsight-demo` | VA | Orders and refunds — no profit totals |
| `accountant@dropinsight.test` | `dropinsight-demo` | Accountant | The numbers and expenses — cannot touch orders |

Signing in as each is the fastest way to see that role-based access is enforced
by the server, not just hidden in the UI.

### Generating an encryption key

eBay OAuth tokens are encrypted at rest, so this is required:

```bash
openssl rand -base64 32
```

Put the result in `ENCRYPTION_KEY`. The app refuses to start the eBay integration
without a valid 32-byte key rather than storing tokens in the clear.

---

## Connecting eBay

### Development — no credentials needed

`EBAY_ADAPTER=mock` (the default) runs a development adapter that generates a
complete, deterministic eBay account: orders, line items, fees, refunds,
cancellations, dispatch timings and seller standards.

It is **not** sample JSON pasted into the UI. It feeds the same sync engine the
live client feeds, so every screen, filter, export and calculation runs against
real application code. Accounts created this way are flagged as demo data
throughout the app and are refused outright when the live adapter is configured.

### Production — real eBay APIs

1. Create an application keyset at <https://developer.ebay.com>.
2. Register a redirect URI (RuName) pointing at `{APP_URL}/connect/callback`.
3. Set:

```bash
EBAY_ADAPTER=live
EBAY_ENV=production          # or "sandbox"
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
EBAY_REDIRECT_URI=...
```

The integration uses read-only scopes on the Sell APIs — Fulfillment for orders,
Finances for the transaction-level fees that make profit accurate, and Analytics
for seller standards. DropInsight cannot list, relist, reprice or message anyone.

> **Why Finances matters:** order totals from the Fulfillment API do not include
> marketplace fees. Without the Finances call, every profit figure would be
> overstated by roughly 13%.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run verify` | Typecheck, lint, tests and build — the full gate |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset and reseed demo data |
| `npm run db:studio` | Browse the database |
| `npm run audit:money` | Re-derive every financial identity from the database and prove the books reconcile |
| `npm run check:responsive` | Sweep every page at 375/768/1280 for horizontal overflow |
| `npm run check:tables` | Confirm wide tables still scroll inside their own containers |
| `npm run audit:ux` | Walk every page as an end user — headings, `NaN` leakage, unnamed controls, dead-end empty states, console errors |
| `npm run audit:interactions` | Drive filters, sorting, dialogs, focus and keyboard paths and check they behave |
| `npm run audit` | All four browser audits in one go (needs a server on :3000) |

`audit:money` runs offline against the database; the rest need a running
server, so start one with `npm run dev` first.

---

## Architecture

```
src/
  app/
    (auth)/            sign in, sign up, password reset — split-screen shell
    (app)/             the authenticated product; layout loads all chrome data once
    api/               search, notifications, exports, the job runner
    onboarding/        first-run: connect → import → the one accounting decision
  components/
    ui/                buttons, dialogs, fields, toasts — no domain knowledge
    domain/            money, statuses, KPI cards — knows about profit
    table/             the shared table, filters, pagination, URL state
    charts/            Recharts wrappers with a table alternative for every chart
    shell/             sidebar, header, search, notifications
  lib/
    money.ts           integer minor units; the only place currency is parsed
    finance/           profit, aggregation, P&L, periods, queries
    ebay/              the integration contract, live client, mock adapter
    sync/              tokens, the sync engine, the scheduler
    auth/              sessions, passwords, the permission matrix
  server/actions/      every mutation, each guarded by a permission
```

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### The rules the code follows

**Money is never a float.** Every amount is an integer of minor units — pence,
cents — parsed once at the edge in `src/lib/money.ts`. `0.1 + 0.2` cannot appear
in a P&L.

**Profit is calculated in one place.** Pages, exports, the P&L and the automation
engine all call `calculateOrderProfit`. Nothing re-derives it from raw columns,
which is what makes "every figure is traceable" true rather than aspirational.

**Permissions are a single matrix.** `src/lib/auth/permissions.ts` is checked by
the server on every page and every mutation — and Settings → Team renders its
"what each role can do" table from the same function, so the table cannot drift
away from what is enforced.

**Syncing is idempotent and non-destructive.** Orders key on
`(account, eBay order id)`, refunds on `(order, eBay refund id)`. A sync updates
eBay's fields and never touches a buying price, a supplier answer or a note.
Running the same window twice changes nothing.

---

## Testing

```bash
npm test          # 78 unit + integration
npm run test:e2e  # 46 end-to-end
```

The end-to-end suite **reseeds the database and builds the app** before it runs.
That is deliberate: these tests change data — they answer supplier claims, enter
buying prices, add expenses — so without a reset the second run would start from
whatever the first left behind. Running against a production build rather than
the dev server is both faster and closer to what ships.

Set `E2E_SKIP_SEED=1` to keep your data, or `E2E_BASE_URL` to point at a server
you are already running.

The tests worth knowing about:

- **`src/lib/__tests__/money.test.ts`** — parsing, rounding and a 500-case fuzz
  proving `allocate()` never loses or invents a penny.
- **`src/lib/finance/__tests__/profit.test.ts`** — the profit formula, including
  every case where a refund could wrongly become a gain.
- **`tests/integration/pnl-reconciles.test.ts`** — runs against the seeded
  database and asserts income − costs = net profit, exactly.
- **`tests/e2e/roles.spec.ts`** — checks that a VA is *refused* the dashboard by
  the server, not merely prevented from seeing the link.

---

## Deployment

DropInsight is a standard Next.js application. It needs a Node runtime, a
database, and something to call the worker.

**Database.** SQLite by default. For production, change the `provider` in
`prisma/schema.prisma` to `postgresql`, point `DATABASE_URL` at it, and run
`npx prisma migrate deploy`. No application code changes.

**The worker.** Syncing, insight generation and automations run in a background
tick rather than inside a page request, so a 900-order history import never
holds a page open. Drive it by calling:

```
POST /api/jobs/tick
Authorization: Bearer $JOB_RUNNER_TOKEN
```

every minute from cron, a scheduled function, or a container sidecar. In
development an in-app poller does it for you, so nothing extra is needed to try
the product.

**Secrets.** `ENCRYPTION_KEY`, `EBAY_CLIENT_SECRET` and `JOB_RUNNER_TOKEN` are
read from the environment and never reach the browser. `.env` is gitignored;
`.env.example` documents every variable.

---

## Troubleshooting

**"ENCRYPTION_KEY must decode to 32 bytes"** — generate one with
`openssl rand -base64 32`.

**"EBAY_ADAPTER=live needs EBAY_CLIENT_ID…"** — the live path refuses to start
with blank credentials rather than failing later with a confusing 401. Either
fill them in or set `EBAY_ADAPTER=mock`.

**No orders after connecting** — the import runs in the background. Watch
Settings → Connections, or call `POST /api/jobs/tick` to push it along.

**Profit looks too low** — check the orders awaiting a buying price. Until an
order has one, it is excluded from profit entirely; the dashboard says how many.

**Styles look wrong in development** — Next's dev server occasionally serves a
stale CSS chunk after many recompiles, and a newly written Tailwind utility can
be missing from the generated stylesheet entirely. `rm -rf .next` and restart.

**The dev server starts returning errors after a build** — `npm run build` and
`npm run dev` write to the same `.next` directory, so running the build (or
`npm run verify`, which ends in one) while the dev server is up leaves it
serving half-replaced chunks. Stop the dev server first, or `rm -rf .next` and
restart it afterwards.

---

## Licence

Private. Built for a specific business; not for redistribution.
