import { prisma } from "@/lib/db/client";
import { profitOf, loadOrders } from "./aggregate";
import { breakEvenPriceMinor, observedFeeRatio } from "./profit";
import { assessListing, type ListingHealth } from "./listing-health";
import type { Period } from "./periods";
import type { Minor } from "@/lib/money";

/**
 * Products and suppliers.
 *
 * Neither is created by hand: a product appears when an order line mentions it,
 * a supplier appears when a buying price names one. That is why both pages are
 * read-mostly, and why their empty states explain the mechanism rather than
 * offering an "Add" button that would create an orphan.
 */

export interface ProductRow {
  id: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  supplierNames: string[];
  unitsSold: number;
  orderCount: number;
  revenueMinor: Minor;
  avgSaleMinor: Minor;
  lastCostMinor: Minor | null;
  costRange: { minMinor: Minor; maxMinor: Minor } | null;
  profitMinor: Minor;
  marginRatio: number | null;
  refundCount: number;
  refundRate: number;
  unpricedLines: number;
  totalLines: number;
  breakEvenMinor: Minor | null;
  currentPriceMinor: Minor;
  /** The verdict on this listing, with its reason and what to do. */
  health: ListingHealth;
}

export interface SupplierRow {
  id: string;
  name: string;
  website: string | null;
  contactEmail: string | null;
  notes: string | null;
  status: string;
  productCount: number;
  orderLineCount: number;
  spendMinor: Minor;
  avgUnitCostMinor: Minor;
  revenueMinor: Minor;
  profitMinor: Minor;
  marginRatio: number | null;
  refundCount: number;
  refundRate: number;
  recoveredMinor: Minor;
  outstandingMinor: Minor;
  /** Share of claims this supplier actually settled. Null when none were raised. */
  reliabilityRatio: number | null;
}

export async function queryProducts(
  workspaceId: string,
  period: Period,
  options: { search?: string; sort?: string; direction?: "asc" | "desc"; currency?: string } = {},
): Promise<ProductRow[]> {
  const currency = options.currency ?? "GBP";

  const orders = await loadOrders({
    workspaceId,
    cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
    ...(period.unbounded ? {} : { orderDate: { gte: period.from, lte: period.to } }),
  });

  // One fee rate for the whole workspace, observed rather than assumed.
  let feesMinor = 0;
  let revenueForFeesMinor = 0;
  for (const order of orders) {
    const p = profitOf(order);
    feesMinor += p.ebayFeesMinor + p.adFeesMinor;
    revenueForFeesMinor += p.revenueMinor;
  }
  const feeRatio = observedFeeRatio(feesMinor, revenueForFeesMinor);

  interface Bucket {
    id: string; title: string; sku: string | null; imageUrl: string | null;
    supplierNames: Set<string>;
    unitsSold: number; orderIds: Set<string>;
    revenueMinor: number; profitMinor: number;
    costs: number[]; lastCostMinor: number | null; lastCostAt: Date | null;
    refundCount: number; unpricedLines: number; totalLines: number; currentPriceMinor: number;
  }

  const map = new Map<string, Bucket>();

  for (const order of orders) {
    const p = profitOf(order);
    const lineCount = order.items.length || 1;
    const refunded = p.refundLossMinor > 0;

    for (const item of order.items) {
      const key = item.productId ?? item.title;
      const bucket = map.get(key) ?? {
        id: item.productId ?? key, title: item.title, sku: item.sku, imageUrl: item.imageUrl,
        supplierNames: new Set<string>(), unitsSold: 0, orderIds: new Set<string>(),
        revenueMinor: 0, profitMinor: 0, costs: [], lastCostMinor: null, lastCostAt: null,
        refundCount: 0, unpricedLines: 0, totalLines: 0, currentPriceMinor: item.unitPriceMinor,
      };

      bucket.unitsSold += item.quantity;
      bucket.totalLines += 1;
      bucket.orderIds.add(order.id);
      bucket.revenueMinor += item.unitPriceMinor * item.quantity;
      bucket.profitMinor += Math.round(p.netProfitMinor / lineCount);
      bucket.currentPriceMinor = item.unitPriceMinor;
      if (refunded) bucket.refundCount += 1;

      const cost = item.costs[0];
      if (cost) {
        bucket.costs.push(cost.unitCostMinor);
        if (!bucket.lastCostAt || cost.createdAt > bucket.lastCostAt) {
          bucket.lastCostAt = cost.createdAt;
          bucket.lastCostMinor = cost.unitCostMinor;
        }
      } else {
        bucket.unpricedLines += 1;
      }

      map.set(key, bucket);
    }
  }

  // Supplier names come from the cost ledger, in one query rather than per row.
  const productIds = [...map.values()].map((b) => b.id);
  if (productIds.length > 0) {
    const links = await prisma.costEntry.findMany({
      where: { orderItem: { productId: { in: productIds } }, supplierId: { not: null } },
      select: { supplier: { select: { name: true } }, orderItem: { select: { productId: true } } },
      distinct: ["supplierId", "orderItemId"],
      take: 5000,
    });
    for (const link of links) {
      const productId = link.orderItem.productId;
      if (!productId || !link.supplier) continue;
      map.get(productId)?.supplierNames.add(link.supplier.name);
    }
  }

  let rows: ProductRow[] = [...map.values()].map((bucket) => {
    const orderCount = bucket.orderIds.size;
    const costRange = bucket.costs.length > 0
      ? { minMinor: Math.min(...bucket.costs), maxMinor: Math.max(...bucket.costs) }
      : null;

    const base = {
      id: bucket.id,
      title: bucket.title,
      sku: bucket.sku,
      imageUrl: bucket.imageUrl,
      supplierNames: [...bucket.supplierNames],
      unitsSold: bucket.unitsSold,
      orderCount,
      revenueMinor: bucket.revenueMinor,
      avgSaleMinor: bucket.unitsSold > 0 ? Math.round(bucket.revenueMinor / bucket.unitsSold) : 0,
      lastCostMinor: bucket.lastCostMinor,
      costRange,
      profitMinor: bucket.profitMinor,
      marginRatio: bucket.revenueMinor > 0 ? bucket.profitMinor / bucket.revenueMinor : null,
      refundCount: bucket.refundCount,
      refundRate: orderCount > 0 ? bucket.refundCount / orderCount : 0,
      unpricedLines: bucket.unpricedLines,
      totalLines: bucket.totalLines,
      breakEvenMinor:
        bucket.lastCostMinor !== null && feeRatio !== null
          ? breakEvenPriceMinor(bucket.lastCostMinor, feeRatio)
          : null,
      currentPriceMinor: bucket.currentPriceMinor,
    };

    return { ...base, health: assessListing({ ...base, currency }) };
  });

  if (options.search?.trim()) {
    const term = options.search.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(term) || (r.sku?.toLowerCase().includes(term) ?? false),
    );
  }

  const direction = options.direction === "asc" ? 1 : -1;
  const sorters: Record<string, (a: ProductRow, b: ProductRow) => number> = {
    profit: (a, b) => (a.profitMinor - b.profitMinor) * direction,
    revenue: (a, b) => (a.revenueMinor - b.revenueMinor) * direction,
    sold: (a, b) => (a.unitsSold - b.unitsSold) * direction,
    margin: (a, b) => ((a.marginRatio ?? -Infinity) - (b.marginRatio ?? -Infinity)) * direction,
    refunds: (a, b) => (a.refundRate - b.refundRate) * direction,
    title: (a, b) => a.title.localeCompare(b.title) * direction,
  };
  rows.sort(sorters[options.sort ?? "profit"] ?? sorters.profit);

  return rows;
}

export async function querySuppliers(
  workspaceId: string,
  period: Period,
): Promise<SupplierRow[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });
  if (suppliers.length === 0) return [];

  const orders = await loadOrders({
    workspaceId,
    cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
    ...(period.unbounded ? {} : { orderDate: { gte: period.from, lte: period.to } }),
  });

  const bySupplier = new Map<string, {
    products: Set<string>; lines: number; spendMinor: number; unitCosts: number[];
    revenueMinor: number; profitMinor: number; refundCount: number; orderCount: number;
  }>();

  for (const order of orders) {
    const p = profitOf(order);
    const lineCount = order.items.length || 1;
    const refunded = p.refundLossMinor > 0;

    for (const item of order.items) {
      const cost = item.costs[0];
      if (!cost?.supplierId) continue;

      const bucket = bySupplier.get(cost.supplierId) ?? {
        products: new Set<string>(), lines: 0, spendMinor: 0, unitCosts: [],
        revenueMinor: 0, profitMinor: 0, refundCount: 0, orderCount: 0,
      };
      if (item.productId) bucket.products.add(item.productId);
      bucket.lines += 1;
      bucket.orderCount += 1;
      bucket.spendMinor += cost.unitCostMinor * item.quantity;
      bucket.unitCosts.push(cost.unitCostMinor);
      bucket.revenueMinor += item.unitPriceMinor * item.quantity;
      bucket.profitMinor += Math.round(p.netProfitMinor / lineCount);
      if (refunded) bucket.refundCount += 1;
      bySupplier.set(cost.supplierId, bucket);
    }
  }

  const claims = await prisma.refund.groupBy({
    by: ["supplierId", "supplierClaim"],
    where: { order: { workspaceId }, supplierId: { not: null } },
    _sum: { recoveredMinor: true, buyerRefundMinor: true, feeCreditMinor: true },
    _count: true,
  });

  return suppliers.map((supplier) => {
    const bucket = bySupplier.get(supplier.id);
    const own = claims.filter((c) => c.supplierId === supplier.id);

    const recoveredMinor = own.reduce((s, c) => s + (c._sum.recoveredMinor ?? 0), 0);
    const outstandingMinor = own
      .filter((c) => ["NOT_ASKED", "ASKED", "PROMISED"].includes(c.supplierClaim))
      .reduce(
        (s, c) => s + Math.max(0, (c._sum.buyerRefundMinor ?? 0) - (c._sum.feeCreditMinor ?? 0) - (c._sum.recoveredMinor ?? 0)),
        0,
      );

    const settledCount = own
      .filter((c) => ["RECEIVED", "PARTIAL"].includes(c.supplierClaim))
      .reduce((s, c) => s + c._count, 0);
    const totalClaims = own
      .filter((c) => c.supplierClaim !== "NOT_APPLICABLE")
      .reduce((s, c) => s + c._count, 0);

    const revenueMinor = bucket?.revenueMinor ?? 0;
    const profitMinor = bucket?.profitMinor ?? 0;

    return {
      id: supplier.id,
      name: supplier.name,
      website: supplier.website,
      contactEmail: supplier.contactEmail,
      notes: supplier.notes,
      status: supplier.status,
      productCount: bucket?.products.size ?? 0,
      orderLineCount: bucket?.lines ?? 0,
      spendMinor: bucket?.spendMinor ?? 0,
      avgUnitCostMinor:
        bucket && bucket.unitCosts.length > 0
          ? Math.round(bucket.unitCosts.reduce((a, b) => a + b, 0) / bucket.unitCosts.length)
          : 0,
      revenueMinor,
      profitMinor,
      marginRatio: revenueMinor > 0 ? profitMinor / revenueMinor : null,
      refundCount: bucket?.refundCount ?? 0,
      refundRate: bucket && bucket.orderCount > 0 ? bucket.refundCount / bucket.orderCount : 0,
      recoveredMinor,
      outstandingMinor,
      reliabilityRatio: totalClaims > 0 ? settledCount / totalClaims : null,
    };
  });
}
