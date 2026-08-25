# Video Requirements / Feature Extraction

Source material supplied with the project, now under `reference/`.

| # | File | Duration | Audio commentary | Transcript |
|---|------|----------|------------------|------------|
| V1 | `reference/videos/DASHBOARD EXPLANATION.mp4` | 9:51 | **Yes** — full spoken walkthrough | `reference/transcripts/video-1-dashboard-explanation.txt` |
| V2 | `reference/videos/All other tabs - baiord explanation.mov` | 8:45 | **Yes** — full spoken walkthrough | `reference/transcripts/video-2-all-other-tabs-explanation.txt` |
| V3 | `reference/videos/All tabs Baiord.mov` | 3:24 | **No** — silent screen recording | `reference/transcripts/video-3-all-tabs-silent-walkthrough.txt` |

## Transcription method

No Node, ffmpeg, or transcription tooling existed on the machine. Installed locally (no sudo):
Node 22 (`~/.local/node`), `ffmpeg-static` (`~/.local/tools`), and `faster-whisper` (Whisper `small`,
int8 CPU) in a venv at `~/.local/tools/whisper-venv`. Audio was demuxed to 16 kHz mono WAV and
transcribed with VAD filtering.

**V3 has no speech.** Measured mean volume −56.4 dBFS / peak −30.2 dBFS — room tone only. It was
re-transcribed with +30 dB gain, normalisation and VAD disabled; the result was two hallucinated
filler lines, confirming silence. V3 was therefore analysed **visually only**, frame by frame
(scene-change keyframes at 0.035 threshold plus a 1-frame-per-6-seconds sweep). This is a property
of the source file, not a tooling limitation.

Visual analysis covered all three videos: 221 periodic frames and 192 scene-change keyframes.

---

## The reference product

**Baiord Seller Analytics** (`app.baiord.com`) — eBay dropshipping profit tracker.
Workspace in the recording: "AI with Ezzi", one connected eBay account `click_fifty3`, UK
marketplace, GBP, Trial plan with 1 day left, 177 orders.

Primary navigation: Dashboard · Orders · Refunds & Returns · Profit Protection · Products ·
Suppliers · Expenses · Analytics · Reports · Insights · Support — with Settings and a live
connection-status pill pinned to the bottom of the sidebar.

---

## R1 — Core product premise

> "this software is for tracking your profits tracking your loss on eBay if you have an eBay
> account and if you are dropshipping" — V1 00:22

> "it gives you … even my new detail of refunds whatever refunds you have given to your buyer —
> have you taken that refund back from your supplier or not?" — V1 00:42–00:53

**R1.1** The product tracks profit, loss, expenses and refunds for eBay dropshippers.
**R1.2** The differentiating capability is closing the loop on *supplier* refunds: when you refund a
buyer on eBay, did you actually recover that money from your supplier (e.g. AliExpress)?

## R2 — Onboarding and connection

> "Firstly you have to sign up and then you have to connect your store your eBay store with this
> software once and once this is connected … it refreshes every minute and it updates whenever any
> order comes in" — V1 01:06–01:37

**R2.1** Sign up → connect eBay account (OAuth) → data flows in.
**R2.2** Sync runs automatically on a short interval (commentary says ~1 minute); users perceive it
as near-real-time. Connections tab evidences repeated `INCREMENTAL` syncs ~5 minutes apart.
**R2.3** Manual **Sync now** and **Import history…** actions per connected account.
**R2.4** Display currency is set automatically from the first connected account's marketplace
(UK → GBP, US → USD) and is a reporting label only — *amounts are never converted*.

## R3 — Refund loss attribution (business rule)

> "One quick choice: which month should a refund's loss count in?" — V1 01:58, V3 dashboard banner

Two mutually exclusive modes, chosen at onboarding and changeable in Settings → General:

| Mode | Rule | Example |
|---|---|---|
| **Refund-arrival month** (default) | The loss lands in the month the refund happened | A July sale refunded in August reduces **August** |
| **Original-order month** | The loss lands in the month of the original order | A July sale refunded in August reduces **July** |

> "most people choose this because they settle at the end of the month and they lock the sheets
> then. Whichever refund comes in for September they'll count everything in September … The sheet
> is closed. They do not edit anything what is already built." — V1 04:33–05:10

**R3.1** Refund-arrival month is the default — closed months never change.
**R3.2** The setting affects dashboards, analytics and reports **only**; nothing stored is altered.
**R3.3** It must be explained inline with the July/August example, not just labelled.

## R4 — Buying price is user-supplied

> "we have not imported any log of costs … it's in minus right now. So it has an option to log your
> costs in each order" — V1 05:25–05:45

**R4.1** eBay supplies sale price and fees. The **supplier buying price is entered by the user** —
without it, an order has no profit and net profit reads negative (fees only).
**R4.2** Orders lacking a cost surface everywhere as "N orders awaiting buying price · £X of sales
not in this profit yet", linking to the pricing workflow.
**R4.3** Three ways to enter cost, all writing through the same cost ledger:
- inline **Add cost** on an order row
- **Spreadsheet mode** — a paste-friendly grid; Enter moves down, ⌘D fills the column downward;
  columns Order · Date · Product · Qty · Sold · Buying price/unit · Supplier order # · Supplier
- **Import costs from spreadsheet** — CSV upload with column mapping. Required: eBay Order Number,
  Buying Price. Optional: Supplier Order No. Everything else is ignored.

> "they'll just match the eBay order number and that row if it has a cost and the supplier order
> number … this will get imported automatically" — V2 01:07–01:34

**R4.4** Buying price is **per unit**, multiplied by quantity.
**R4.5** Payout and profit columns in an uploaded sheet are deliberately ignored — those come from
real eBay data.

## R5 — Supplier refund recovery ("Profit Protection")

> "this is a game changer thing" — V2 02:36

**R5.1** Every buyer refund raises the question **"Did you receive a supplier refund?"** with four
answers:

| Answer | Meaning | Effect |
|---|---|---|
| **Yes, received** | Full recovery | Recovered amount offsets the loss |
| **Expecting it** | Supplier promised | Stays open, keeps following up |
| **Partial…** | Part recovered | Prompts for the amount |
| **No** | Not coming back | Written off — counts as a loss |

> "if you click on expecting it it will keep on following up basically so that you never forget and
> it stays incomplete so that you have to either say yes or say no" — V2 02:55–03:08

**R5.2** Answers update the order's profit **immediately**.
**R5.3** Refunds & Returns tabs: Refunds · Returns · Cancelled; sub-filters Needs answer ·
Expecting · Settled · All.
**R5.4** Refund table columns: Refunded · Ordered · Order · Product · Buyer refund · Fee credit ·
Recovered · Supplier · Order profit.
**R5.5** Profit Protection page KPIs: Recovered to date · Still recoverable · Overdue from suppliers
(promised but not received) · Written off.
**R5.6** Profit Protection **chase queue**: every refund where the supplier side is unanswered or
promised, showing age ("12d ago"), status (Not asked / Asked / Promised), recoverable amount, and
four record-answer controls (Received · Supplier promised it · Partial · Not coming back).

## R6 — Cancelled orders are not losses

> "the software also has a feature that separates the cancelled orders that are actually orders
> that buyer asks to cancel and they are not really processed … you haven't processed anything from
> AliExpress either. So that doesn't need a follow-up." — V2 03:28–04:13

**R6.1** Cancelled-before-fulfilment orders are held separately and **excluded from loss figures and
from the chase queue**. Orders page shows Cancelled 19 as its own tab.

## R7 — Break-even / price floor

> "if there is any cost we have written and if there is according to the eBay calculation that
> order is in loss like below the break even and it is not giving you any profit, it basically
> tells you that you are not getting any profit and then you can adjust your prices accordingly"
> — V2 04:22–04:43

**R7.1** Compute a break-even sale price per product from cost + fee rates, and flag listings/orders
priced below it. Profit Protection subtitle: "…and the prices your products can't afford to drop
below."
**R7.2** Orders page has a **Made a loss** filter chip (21 in the recording).

## R8 — Dashboard

**R8.1** Two side-by-side period cards: **This month** (1st → today) and a **comparison window**
selectable as Today / Last 7 days / Last 14 days / Last month / Custom.
**R8.2** Each card: Net profit, Revenue (gross sales incl. shipping), Profit margin (avg per order),
Orders, Refunds (count in period), with % change vs the compared window.
**R8.3** "Awaiting buying price" banner inside each card.
**R8.4** **Outstanding right now — not tied to the periods above**: Awaiting buying price ·
Refunds needing your answer · Returns awaiting your action.
**R8.5** Supplier-refund settlement banner linking to Profit Protection.
**R8.6** **eBay account status** — seller level badge (Top Rated), late dispatch rate, transaction
defect rate, cases closed without seller resolution, each with its threshold ("Top Rated needs 3%
or lower · above 5% is Below Standard") and the next evaluation date.

> "all of this data is already available on eBay, but from the API it fetched everything and we got
> everything over here … so that eBay account health is also displayed" — V1 08:16–08:34

**R8.7** **Dispatch and delivery** (last 7 days, measured against eBay's own dispatch deadline):
% dispatched on time, Orders, On time, Dispatched late, Cancellations.
**R8.8** **Revenue and profit** daily bar chart with per-day tooltip.
**R8.9** **Needs attention** action list and **Top products**.

> "if you want to run a priority ad or something like that if you've got your top products over
> here" — V1 09:43

## R9 — Orders

**R9.1** Date-range chips: All time · Today · Last 7 days · Last 14 days · This month · Last month ·
Custom.
**R9.2** Fulfilment filter chips with live counts: Awaiting dispatch · Past dispatch deadline ·
Dispatched on time · Dispatched late · In transit · Delivered · Dispatched without tracking ·
Made a loss.
**R9.3** Status tabs with counts: All · Awaiting cost · Refunded · Returned · Cancelled.
**R9.4** Columns: Order · Date · Buyer · Product · Qty · Sold · Fees · Cost · Profit · Margin ·
Status. Column visibility is user-configurable ("Columns" control).
**R9.5** Search across order number, buyer, SKU and tracking.
**R9.6** Header actions: Spreadsheet mode · Import costs from spreadsheet.

## R10 — Products

> "Built automatically from your orders — cost history here powers the buying-price suggestions"
> — Products page subtitle; V2 05:12

**R10.1** Products are derived from order lines, never created by hand.
**R10.2** Columns: Product (+ SKU) · Supplier · Sold · Avg sale · Last cost · Cost range ·
Total profit · Margin · Refunds · Stock, with an **Add buying price** action.
**R10.3** Cost history drives buying-price suggestions on new orders of the same product.

## R11 — Suppliers

**R11.1** "Where your money goes — spend, order volume and average unit cost per supplier."
**R11.2** Suppliers are **created implicitly** when a buying price names one. Empty state says so.
**R11.3** Supplier comparison appears in Analytics.

## R12 — Expenses

**R12.1** Month-by-month navigation (‹ August 2026 ›).
**R12.2** Three KPIs: Gross profit (orders this month) · Expenses · True net profit (gross less
expenses).
**R12.3** Inline add form: Category · Description · Amount · Recurring toggle · Add.
**R12.4** **Copy last month's recurring** action.
**R12.5** eBay store/subscription fees are imported automatically and badged "from eBay"; those rows
are read-only.

> "if you have taken any subscription like AutoDS or something like that you can just put it over
> here and calculate it in your expense" — V2 05:48

## R13 — Analytics

**R13.1** Period chips (Today / Last 7 / Last 14 / This month / Last month / Custom).
**R13.2** **Trends** chart with metric switcher: Profit · Revenue · Refunds · Returns.
**R13.3** Most profitable / Least profitable products.
**R13.4** Supplier comparison.

## R14 — Reports

> "Monthly profit and loss statement is really important to know what actually your profit is and
> what are your expenses. We get a nice PDF format" — V2 06:50–07:02

**R14.1** Period selector applying to the exports.
**R14.2** Accountant-ready exports:
- Orders CSV — every order with fees, supplier cost, refunds, profit, margin; one row per order
- Monthly profit & loss CSV — revenue, fees, cost of goods, expenses, net profit by month
- Product performance CSV — cost history, avg sale price, units sold, total profit, refund counts per SKU
- Expenses CSV — monthly business costs by category
- **Monthly P&L PDF** — a formatted statement for one month

## R15 — Insights

**R15.1** "Automatic findings: declining margins, rising supplier costs, refund-prone products."
**R15.2** Each insight is a dismissible card with a category tag and a concrete recommendation, e.g.
"…is refunded often — 20.0% of its 5 sales ended in a refund. Check the listing description and the
supplier's quality."
**R15.3** Manual **Refresh insights**.

## R16 — Support

**R16.1** In-app ticketing: subject + details, with the hint that an order number gets a faster
answer. "Your tickets" list with replies.

## R17 — Settings

Tabs: General · Team · Connections · Billing · Activity.

**R17.1 General** — Workspace name, Display currency, Refund losses count in (R3).
**R17.2 Team** — invite by email with a role; members list; and a **"What each role can do"** matrix
that is *generated from the same rules the server enforces*:

| Ability | Manager | VA | Accountant | Read-only |
|---|---|---|---|---|
| See the dashboard and profit totals | ✓ | — | ✓ | ✓ |
| See orders | ✓ | ✓ | ✓ | ✓ |
| Enter buying prices | ✓ | ✓ | — | — |
| Answer refund and return questions | ✓ | ✓ | — | — |
| Manage products and stock batches | ✓ | — | — | — |
| Manage business expenses | ✓ | — | ✓ | — |
| Download reports | ✓ | — | ✓ | ✓ |
| See analytics | ✓ | — | ✓ | ✓ |
| Connect and manage eBay accounts | ✓ | — | — | — |

Owner can do everything, including billing and the team.

**R17.3 Connections** — per account: name, Connected badge, marketplace, last sync, Sync now,
Import history…, disconnect; recent sync activity log (time, type, orders imported); plan-limit note.
**R17.4 Billing** — plan, trial countdown ("1 day left … nothing is deleted when it ends — syncing
pauses until you subscribe"), Usage (eBay accounts x/y, orders this month), over-limit warning, plan
cards with Monthly/Yearly toggle.
**R17.5 Activity** — audit log.

## R18 — Plans

| Plan | Price | eBay accounts | Orders |
|---|---|---|---|
| Solo | $14.99/mo | 1 | Unlimited |
| Multi | $39.99/mo | 3 | Unlimited |
| Custom | Contact | As agreed | Unlimited |

All plans include full profit, fees and refund tracking. Trial precedes them.
**R18.1** Account limit is enforced; existing accounts keep working when over limit.

## R19 — Global shell

**R19.1** Workspace switcher, global search (⌘K) over orders/SKUs/buyers, notification bell with
count, theme toggle, avatar menu.
**R19.2** Sidebar collapse; live eBay connection pill at the bottom.

---

## Improvements DropInsight makes over the reference

Identified from the commentary and from gaps visible in the recordings.

| # | Problem in the reference | DropInsight |
|---|---|---|
| I1 | Profit is invisible until costs are typed; the whole dashboard reads −£65.57 and 0.0% margin | Cost coverage is a first-class metric. Every profit figure states its coverage ("based on 32 of 177 orders"), and figures are never presented as if complete when they are not |
| I2 | Nothing suggests a cost | Buying-price suggestions from the product's own cost history, offered inline (R10.3 exists but is unused in the recording) |
| I3 | Chase queue shows "Not asked" with no way to act in bulk | Bulk answer, bulk chase, and age-based escalation |
| I4 | Refund questions appear only as stacked cards at the top of one page | A single unified action inbox surfaced from the dashboard, with keyboard-driven triage |
| I5 | No alerts/notification centre despite a bell with a badge | Real notification centre with severity, entity links and preferences |
| I6 | No automation anywhere | Rule builder (trigger → conditions → actions) with execution history |
| I7 | Analytics charts are near-empty with no guidance | Honest empty states that explain what is missing and link to the fix |
| I8 | Reports are download-only; no on-screen P&L | Full on-screen Profit & Loss with breakdown, trend and period comparison |
| I9 | Tables have no sorting, saved views, or URL-persisted filters | Server-side sort/filter/paginate, URL-persisted state, saved views |
| I10 | Desktop-only layout | Responsive down to mobile with card-based table fallbacks |
| I11 | Colour alone signals financial status | Icon + text + colour on every status |
