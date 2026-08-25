import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

/**
 * Order lines that still need a buying price, newest first, with the suggested
 * price from each product's own cost history already attached — so spreadsheet
 * mode does not need a request per row.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !can(auth.workspace.role, "costs.write")) {
    return NextResponse.json({ error: "Your role cannot enter buying prices." }, { status: 403 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 200), 500);
  const accountId = request.nextUrl.searchParams.get("accountId");

  const items = await prisma.orderItem.findMany({
    where: {
      costs: { none: {} },
      order: {
        workspaceId: auth.workspace.id,
        cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
        ...(accountId ? { ebayAccountId: accountId } : {}),
      },
    },
    include: {
      order: {
        select: {
          id: true, ebayOrderId: true, orderDate: true, currency: true,
          ebayAccount: { select: { username: true } },
        },
      },
    },
    orderBy: { order: { orderDate: "desc" } },
    take: limit,
  });

  // One grouped query for the suggestions rather than one per line.
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const history = productIds.length
    ? await prisma.costEntry.findMany({
        where: { orderItem: { productId: { in: productIds } } },
        select: { unitCostMinor: true, createdAt: true, orderItem: { select: { productId: true } } },
        orderBy: { createdAt: "desc" },
        take: 2000,
      })
    : [];

  const latestByProduct = new Map<string, number>();
  for (const entry of history) {
    const productId = entry.orderItem.productId;
    if (productId && !latestByProduct.has(productId)) {
      latestByProduct.set(productId, entry.unitCostMinor);
    }
  }

  return NextResponse.json({
    lines: items.map((item) => ({
      orderItemId: item.id,
      orderId: item.order.id,
      ebayOrderId: item.order.ebayOrderId,
      orderDate: item.order.orderDate.toISOString(),
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
      soldMinor: item.unitPriceMinor * item.quantity,
      currency: item.order.currency,
      suggestionMinor: item.productId ? (latestByProduct.get(item.productId) ?? null) : null,
      accountUsername: item.order.ebayAccount.username,
    })),
  });
}
