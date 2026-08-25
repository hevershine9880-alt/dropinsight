import { PrismaClient } from "../src/generated/prisma";
import { hash } from "@node-rs/argon2";
import { subDays, subMonths, startOfMonth, addDays } from "date-fns";
import { MockEbayClient, MOCK_ACCOUNTS } from "../src/lib/ebay/mock-client";
import { CATALOG, SUPPLIERS, REFUND_REASONS } from "../src/lib/ebay/catalog";
import { upsertOrder } from "../src/lib/sync/engine";
import { encrypt } from "../src/lib/crypto";
import { generateInsights } from "../src/lib/insights";

/**
 * Development seed.
 *
 * Builds a workspace that looks like a real six-month-old dropshipping
 * business, by running the mock eBay adapter through the *actual* sync engine.
 * The seed does not hand-write orders: it connects two accounts and syncs them,
 * so the seeded database is exactly what a real connection produces.
 *
 * It then does what a real operator does — prices most orders, answers most
 * supplier-refund questions, logs expenses — leaving a realistic backlog of
 * unanswered work so the "needs attention" surfaces are not empty.
 */

const prisma = new PrismaClient();
const SEED_PASSWORD = "dropinsight-demo";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log("Seeding DropInsight…");

  await reset();

  const passwordHash = await hash(SEED_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const owner = await prisma.user.create({
    data: { email: "owner@dropinsight.test", name: "Huzaifa Malik", passwordHash, avatarColor: "indigo" },
  });
  const va = await prisma.user.create({
    data: { email: "va@dropinsight.test", name: "Priya Raman", passwordHash, avatarColor: "emerald" },
  });
  const accountant = await prisma.user.create({
    data: { email: "accountant@dropinsight.test", name: "Tomás Oliveira", passwordHash, avatarColor: "amber" },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Northbridge Retail",
      currency: "GBP",
      refundAttribution: "REFUND_MONTH",
      onboardingStep: "DONE",
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: va.id, role: "VA" },
          { userId: accountant.id, role: "ACCOUNTANT" },
        ],
      },
      subscription: {
        create: {
          plan: "MULTI",
          status: "ACTIVE",
          interval: "MONTHLY",
          currentPeriodEnd: addDays(new Date(), 18),
          accountLimitAtBuy: 3,
        },
      },
      referral: { create: { code: "NORTHBRIDGE-8842" } },
    },
  });

  // A second workspace on trial, so the trial and empty states are reachable.
  const trialWorkspace = await prisma.workspace.create({
    data: {
      name: "Sidegig Store",
      currency: "GBP",
      onboardingStep: "CONNECT",
      memberships: { create: [{ userId: owner.id, role: "OWNER" }] },
      subscription: {
        create: { plan: "TRIAL", status: "TRIALING", trialEndsAt: addDays(new Date(), 1) },
      },
      referral: { create: { code: "SIDEGIG-1207" } },
    },
  });
  console.log(`  workspaces: ${workspace.name}, ${trialWorkspace.name} (trial, no accounts)`);

  const suppliers = await Promise.all(
    SUPPLIERS.map((s) =>
      prisma.supplier.create({
        data: {
          workspaceId: workspace.id,
          name: s.name,
          website: s.website,
          contactEmail: `sales@${s.website}`,
          notes: s.reliability < 0.8 ? "Slow to answer refund claims. Chase early." : null,
        },
      }),
    ),
  );
  const supplierByName = new Map(suppliers.map((s) => [s.name, s]));

  // --- connect two eBay accounts and sync them through the real engine ----
  const client = new MockEbayClient();

  for (const profile of MOCK_ACCOUNTS.slice(0, 2)) {
    const tokens = await client.exchangeCodeForTokens(profile.ebayUserId);
    const health = await client.fetchAccountHealth(tokens.accessToken);

    const account = await prisma.ebayAccount.create({
      data: {
        workspaceId: workspace.id,
        ebayUserId: profile.ebayUserId,
        username: profile.username,
        marketplaceId: profile.marketplaceId,
        currency: profile.currency,
        status: "CONNECTED",
        isMock: true,
        connectedAt: subDays(new Date(), profile.historyDays),
        lastSyncAt: new Date(),
        historyFrom: subDays(new Date(), profile.historyDays),
        sellerLevel: health.sellerLevel,
        lateDispatchRate: health.lateDispatchRate,
        transactionDefectRate: health.transactionDefectRate,
        casesClosedWithoutSellerResolutionRate: health.casesClosedWithoutSellerResolutionRate,
        healthEvaluatedAt: health.evaluatedAt,
        healthNextEvaluationAt: health.nextEvaluationAt,
        credential: {
          create: {
            accessTokenEncrypted: encrypt(tokens.accessToken),
            refreshTokenEncrypted: encrypt(tokens.refreshToken),
            accessTokenExpiresAt: tokens.accessTokenExpiresAt,
            refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
            scopes: tokens.scopes.join(" "),
          },
        },
      },
    });

    let cursor: string | null = null;
    let imported = 0;
    do {
      const page = await client.fetchOrders(tokens.accessToken, { cursor, limit: 200 });
      for (const order of page.orders) {
        await upsertOrder(workspace.id, account.id, order);
        imported += 1;
      }
      cursor = page.nextCursor;
    } while (cursor);

    // A believable sync history for the Connections tab.
    for (let i = 0; i < 6; i++) {
      const at = subDays(new Date(), 0);
      at.setMinutes(at.getMinutes() - i * 5 - 3);
      await prisma.syncJob.create({
        data: {
          workspaceId: workspace.id,
          ebayAccountId: account.id,
          type: i === 5 ? "FULL" : "INCREMENTAL",
          status: "SUCCESS",
          ordersImported: i === 5 ? imported : Math.floor(Math.random() * 3),
          queuedAt: at,
          startedAt: at,
          finishedAt: new Date(at.getTime() + 4200),
        },
      });
    }

    console.log(`  ${profile.username}: ${imported} orders imported through the sync engine`);
  }

  await priceOrders(workspace.id, supplierByName);
  await answerSupplierClaims(workspace.id, supplierByName);
  await seedExpenses(workspace.id);
  await seedAutomations(workspace.id);
  await seedSupport(workspace.id, owner.id);
  await seedNotifications(workspace.id);
  await seedAuditTrail(workspace.id, owner.id, va.id, accountant.id);

  // Run the real generator over the seeded data rather than writing findings by
  // hand — an Insights page that disagrees with the orders behind it would be
  // worse than an empty one.
  const insights = await generateInsights(workspace.id);

  const orders = await prisma.order.count({ where: { workspaceId: workspace.id } });
  const refunds = await prisma.refund.count({ where: { order: { workspaceId: workspace.id } } });
  const priced = await prisma.costEntry.count();

  console.log(`
Done.
  ${orders} orders, ${refunds} refunds, ${priced} buying prices recorded.
  ${insights} insights found.

  Sign in at http://localhost:3000/sign-in

    owner@dropinsight.test       ${SEED_PASSWORD}   (Owner)
    va@dropinsight.test          ${SEED_PASSWORD}   (VA — no profit totals)
    accountant@dropinsight.test  ${SEED_PASSWORD}   (Accountant — no order costs)
`);
}

async function reset() {
  // Order matters only where cascades do not cover it.
  await prisma.$transaction([
    prisma.supportMessage.deleteMany(),
    prisma.supportTicket.deleteMany(),
    prisma.automationRun.deleteMany(),
    prisma.automationRule.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.insight.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.savedView.deleteMany(),
    prisma.syncLog.deleteMany(),
    prisma.syncJob.deleteMany(),
    prisma.costEntry.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.product.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.oAuthCredential.deleteMany(),
    prisma.ebayAccount.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

/**
 * Price most orders, the way a real operator does: everything older than a few
 * days is done, the last few days are the backlog. Costs drift over time so the
 * "rising supplier cost" insight has something true to find.
 */
async function priceOrders(workspaceId: string, suppliers: Map<string, { id: string }>) {
  const random = rng(20260824);
  const items = await prisma.orderItem.findMany({
    where: { order: { workspaceId } },
    include: { order: { select: { orderDate: true, currency: true, cancelState: true } } },
    orderBy: { order: { orderDate: "asc" } },
  });

  const catalogBySku = new Map(CATALOG.map((c) => [c.sku, c]));
  const now = new Date();
  let priced = 0;

  for (const item of items) {
    if (item.order.cancelState === "CANCELLED_BEFORE_FULFILMENT") continue;

    const ageDays = (+now - +item.order.orderDate) / 86_400_000;
    // The last four days are the working backlog; a few older ones slip through.
    if (ageDays < 4 && random() < 0.82) continue;
    if (ageDays >= 4 && random() < 0.06) continue;

    const product = item.sku ? catalogBySku.get(item.sku) : undefined;
    if (!product) continue;

    // Cost drifts up ~9% over the account's life, plus per-order noise.
    const drift = 1 + 0.09 * (1 - Math.min(ageDays, 180) / 180);
    const noise = 0.96 + random() * 0.09;
    const unitCostMinor = Math.round(product.costMinor * drift * noise);

    await prisma.costEntry.create({
      data: {
        orderItemId: item.id,
        unitCostMinor,
        currency: item.order.currency,
        supplierId: suppliers.get(product.supplier)?.id,
        supplierOrderNumber: `${product.supplier.split(" ")[0].toUpperCase().slice(0, 3)}-${String(Math.floor(random() * 900000) + 100000)}`,
        source: random() < 0.6 ? "SPREADSHEET" : "MANUAL",
        createdAt: addDays(item.order.orderDate, 1 + Math.floor(random() * 2)),
      },
    });
    priced += 1;
  }
  console.log(`  priced ${priced} order lines`);
}

/**
 * Answer supplier-refund questions the way a busy seller does: most of the old
 * ones settled, the recent ones still open. That is what fills the chase queue.
 */
async function answerSupplierClaims(workspaceId: string, suppliers: Map<string, { id: string }>) {
  const random = rng(77341);
  const refunds = await prisma.refund.findMany({
    where: { order: { workspaceId }, supplierClaim: "NOT_ASKED" },
    include: {
      order: {
        select: {
          orderDate: true,
          items: { select: { sku: true }, take: 1 },
        },
      },
    },
  });

  const supplierBySku = new Map(CATALOG.map((c) => [c.sku, c.supplier]));
  const reliability = new Map(SUPPLIERS.map((s) => [s.name, s.reliability]));
  const now = new Date();
  const counts: Record<string, number> = {};

  for (const refund of refunds) {
    const sku = refund.order.items[0]?.sku;
    const supplierName = sku ? supplierBySku.get(sku) : undefined;
    const supplierId = supplierName ? suppliers.get(supplierName)?.id : undefined;
    const rel = supplierName ? (reliability.get(supplierName) ?? 0.85) : 0.85;
    const ageDays = (+now - +refund.refundedAt) / 86_400_000;

    let claim: string;
    let recovered = 0;

    if (ageDays < 5) {
      // Fresh: still on the pile.
      claim = random() < 0.7 ? "NOT_ASKED" : "ASKED";
    } else if (ageDays < 14) {
      const roll = random();
      if (roll < 0.25) claim = "ASKED";
      else if (roll < 0.5) claim = "PROMISED";
      else if (roll < 0.5 + rel * 0.4) {
        claim = "RECEIVED";
        recovered = Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor);
      } else claim = "PARTIAL";
    } else {
      const roll = random();
      if (roll < rel) {
        claim = "RECEIVED";
        recovered = Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor);
      } else if (roll < rel + 0.09) {
        claim = "PARTIAL";
        recovered = Math.round(Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor) * (0.3 + random() * 0.4));
      } else if (roll < rel + 0.16) {
        claim = "WRITTEN_OFF";
      } else {
        claim = "PROMISED";
      }
    }

    if (claim === "PARTIAL" && recovered === 0) {
      recovered = Math.round(Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor) * (0.3 + random() * 0.4));
    }

    counts[claim] = (counts[claim] ?? 0) + 1;

    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        supplierClaim: claim,
        supplierId,
        recoveredMinor: recovered,
        supplierAnsweredAt: ["RECEIVED", "PARTIAL", "WRITTEN_OFF"].includes(claim)
          ? addDays(refund.refundedAt, 2 + Math.floor(random() * 9))
          : null,
        promisedByDate: claim === "PROMISED" ? addDays(refund.refundedAt, 14) : null,
        reason: refund.reason ?? REFUND_REASONS[Math.floor(random() * REFUND_REASONS.length)],
      },
    });
  }

  console.log(`  supplier claims: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

async function seedExpenses(workspaceId: string) {
  const random = rng(5150);
  const recurring = [
    { category: "Software", description: "AutoDS subscription", amountMinor: 6699 },
    { category: "Software", description: "Tracking & repricing tool", amountMinor: 2900 },
    { category: "Payroll", description: "Virtual assistant — 20h/week", amountMinor: 48000 },
    { category: "Advertising", description: "Off-eBay retargeting", amountMinor: 12500 },
  ];
  const occasional = [
    { category: "Packaging", description: "Poly mailers and labels" },
    { category: "Professional fees", description: "Bookkeeping" },
    { category: "Other", description: "Returns postage" },
  ];

  let count = 0;
  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
    const month = startOfMonth(subMonths(new Date(), monthsAgo));
    for (const item of recurring) {
      await prisma.expense.create({
        data: {
          workspaceId,
          date: addDays(month, 2),
          category: item.category,
          description: item.description,
          amountMinor: item.amountMinor,
          currency: "GBP",
          recurring: true,
          source: "MANUAL",
        },
      });
      count += 1;
    }
    if (random() < 0.7) {
      const item = occasional[Math.floor(random() * occasional.length)];
      await prisma.expense.create({
        data: {
          workspaceId,
          date: addDays(month, 5 + Math.floor(random() * 20)),
          category: item.category,
          description: item.description,
          amountMinor: 1500 + Math.floor(random() * 9000),
          currency: "GBP",
          source: "MANUAL",
        },
      });
      count += 1;
    }
    // The eBay shop fee, imported and read-only.
    await prisma.expense.create({
      data: {
        workspaceId,
        date: addDays(month, 28),
        category: "Marketplace fees",
        description: `eBay shop subscription: ${month.toISOString().slice(0, 10)}`,
        amountMinor: 3200,
        currency: "GBP",
        source: "EBAY",
        externalRef: `seed-storefee-${month.toISOString().slice(0, 7)}`,
      },
    });
    count += 1;
  }
  console.log(`  ${count} expenses`);
}

async function seedAutomations(workspaceId: string) {
  await prisma.automationRule.create({
    data: {
      workspaceId,
      name: "Chase suppliers after 10 days",
      description: "Anything still unanswered after ten days gets raised so it does not quietly become a write-off.",
      trigger: "SUPPLIER_REFUND_OVERDUE",
      conditions: JSON.stringify([
        { field: "ageDays", operator: "gte", value: 10 },
        { field: "recoverable", operator: "gt", value: 300 },
      ]),
      actions: JSON.stringify([
        { kind: "NOTIFY", message: "Supplier refund still outstanding", severity: "WARNING" },
      ]),
    },
  });

  await prisma.automationRule.create({
    data: {
      workspaceId,
      name: "Flag thin-margin orders",
      description: "Anything under 8% margin is worth a look before it becomes a pattern.",
      trigger: "ORDER_BELOW_MARGIN",
      conditions: JSON.stringify([{ field: "marginPercent", operator: "lt", value: 8 }]),
      actions: JSON.stringify([
        { kind: "FLAG_ORDER", message: "Margin below 8%", severity: "WARNING" },
      ]),
    },
  });

  await prisma.automationRule.create({
    data: {
      workspaceId,
      name: "Nag me about unpriced orders",
      description: "Orders sitting without a buying price for a week keep profit wrong.",
      enabled: false,
      trigger: "ORDER_MISSING_COST",
      conditions: JSON.stringify([{ field: "ageDays", operator: "gte", value: 7 }]),
      actions: JSON.stringify([{ kind: "NOTIFY", message: "Still needs a buying price", severity: "INFO" }]),
    },
  });
  console.log("  3 automation rules");
}

async function seedSupport(workspaceId: string, userId: string) {
  const ticket = await prisma.supportTicket.create({
    data: {
      workspaceId,
      subject: "Profit looks wrong on an order",
      status: "ANSWERED",
      messages: {
        create: [
          {
            authorId: userId,
            body: "Order 12-15063-13226 shows £2.31 profit but my payout report says £2.80. Which is right?",
          },
          {
            fromStaff: true,
            body: "Both are, they measure different things. Your payout is after eBay's fee but before the buying price you entered. DropInsight subtracts the £4.97 fee and the £8.10 you paid your supplier. Open the order and the breakdown shows each line.",
          },
        ],
      },
    },
  });
  void ticket;
  console.log("  1 support ticket");
}

async function seedNotifications(workspaceId: string) {
  const account = await prisma.ebayAccount.findFirst({ where: { workspaceId } });
  await prisma.notification.createMany({
    data: [
      {
        workspaceId,
        type: "SYNC_COMPLETE",
        severity: "INFO",
        title: "Sync finished",
        body: "All connected accounts are up to date.",
        actionLabel: "View connections",
        actionHref: "/settings/connections",
        dedupeKey: "seed-sync-complete",
        readAt: subDays(new Date(), 1),
      },
      {
        workspaceId,
        type: "SUPPLIER_REFUND_OVERDUE",
        severity: "WARNING",
        title: "Supplier refunds need chasing",
        body: "Several refunds have been outstanding for more than two weeks.",
        actionLabel: "Open chase queue",
        actionHref: "/profit-protection",
        dedupeKey: "seed-chase",
      },
      {
        workspaceId,
        type: "ACCOUNT_HEALTH",
        severity: "INFO",
        title: `${account?.username ?? "Your store"} is Top Rated`,
        body: "Late dispatch and defect rates are both well inside eBay's thresholds.",
        actionLabel: "See account health",
        actionHref: "/ebay-accounts",
        dedupeKey: "seed-health",
      },
    ],
  });
  console.log("  3 notifications");
}

/**
 * A believable history for Settings → Activity.
 *
 * Without this the audit log is empty on a fresh install and the feature looks
 * broken, when in fact it only records things that have happened.
 */
async function seedAuditTrail(workspaceId: string, ownerId: string, vaId: string, accountantId: string) {
  const account = await prisma.ebayAccount.findFirst({ where: { workspaceId } });
  const costCount = await prisma.costEntry.count();

  const entries: { at: Date; actorId: string | null; action: string; summary: string }[] = [
    { at: subDays(new Date(), 181), actorId: ownerId, action: "auth.sign_up", summary: "Huzaifa Malik created the workspace Northbridge Retail." },
    { at: subDays(new Date(), 180), actorId: ownerId, action: "ebay.connect", summary: `${account?.username ?? "click_fifty3"} connected (EBAY_GB).` },
    { at: subDays(new Date(), 180), actorId: ownerId, action: "ebay.history_import", summary: "History import queued, back 180 days." },
    { at: subDays(new Date(), 174), actorId: ownerId, action: "workspace.refund_attribution_change", summary: "Refund losses now count in the month the refund arrives." },
    { at: subDays(new Date(), 150), actorId: ownerId, action: "ebay.connect", summary: "evershine_products connected (EBAY_GB)." },
    { at: subDays(new Date(), 96), actorId: ownerId, action: "member.invite", summary: "priya@dropinsight.test invited as VA." },
    { at: subDays(new Date(), 95), actorId: vaId, action: "member.invite", summary: "Priya Raman joined as VA." },
    { at: subDays(new Date(), 62), actorId: ownerId, action: "member.invite", summary: "tomas@dropinsight.test invited as Accountant." },
    { at: subDays(new Date(), 61), actorId: accountantId, action: "member.invite", summary: "Tomás Oliveira joined as Accountant." },
    { at: subDays(new Date(), 44), actorId: ownerId, action: "billing.plan_change", summary: "Plan changed to Multi (monthly)." },
    { at: subDays(new Date(), 30), actorId: vaId, action: "cost.bulk_import", summary: `${Math.round(costCount * 0.4)} buying prices imported from a spreadsheet.` },
    { at: subDays(new Date(), 21), actorId: accountantId, action: "expense.create", summary: "Expense added: VA salary — £480.00." },
    { at: subDays(new Date(), 14), actorId: vaId, action: "refund.bulk_answer", summary: "12 supplier claims set to received." },
    { at: subDays(new Date(), 9), actorId: ownerId, action: "report.export", summary: "Exported a 12-month profit & loss CSV." },
    { at: subDays(new Date(), 5), actorId: vaId, action: "cost.set", summary: "Buying price for 22-15045-31086 set to £1.86 a unit." },
    { at: subDays(new Date(), 2), actorId: ownerId, action: "automation.create", summary: 'Automation "Chase suppliers after 10 days" created.' },
    { at: subDays(new Date(), 1), actorId: vaId, action: "auth.sign_in", summary: "Priya Raman signed in." },
  ];

  for (const entry of entries) {
    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId: entry.actorId,
        action: entry.action,
        summary: entry.summary,
        createdAt: entry.at,
        ipAddress: "192.168.1.81",
      },
    });
  }
  console.log(`  ${entries.length} activity entries`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
