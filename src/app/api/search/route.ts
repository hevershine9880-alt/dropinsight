import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";

/**
 * Global search. Queries are scoped to the caller's workspace at the database
 * level — there is no path by which one workspace can read another's rows.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const term = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ results: [] });

  const workspaceId = auth.workspace.id;
  const currency = auth.workspace.currency;

  const [orders, products, suppliers, buyers] = await Promise.all([
    prisma.order.findMany({
      where: {
        workspaceId,
        OR: [
          { ebayOrderId: { contains: term } },
          { legacyOrderId: { contains: term } },
          { trackingNumber: { contains: term } },
          { items: { some: { OR: [{ sku: { contains: term } }, { title: { contains: term } }] } } },
        ],
      },
      select: {
        id: true, ebayOrderId: true, orderDate: true, totalMinor: true,
        buyerUsername: true, items: { select: { title: true }, take: 1 },
      },
      orderBy: { orderDate: "desc" },
      take: 6,
    }),
    prisma.product.findMany({
      where: { workspaceId, OR: [{ title: { contains: term } }, { sku: { contains: term } }] },
      select: { id: true, title: true, sku: true, _count: { select: { items: true } } },
      take: 4,
    }),
    prisma.supplier.findMany({
      where: { workspaceId, name: { contains: term } },
      select: { id: true, name: true, _count: { select: { costs: true } } },
      take: 3,
    }),
    prisma.order.groupBy({
      by: ["buyerUsername"],
      where: { workspaceId, buyerUsername: { contains: term } },
      _count: true,
      orderBy: { buyerUsername: "asc" },
      take: 3,
    }),
  ]);

  const results = [
    ...orders.map((order) => ({
      type: "order" as const,
      id: order.id,
      title: order.ebayOrderId,
      subtitle: `${format(order.orderDate, "d MMM yyyy")} · ${order.buyerUsername} · ${formatMoney(order.totalMinor, currency)}${order.items[0] ? ` · ${order.items[0].title.slice(0, 40)}` : ""}`,
      href: `/orders/${order.id}`,
    })),
    ...products.map((product) => ({
      type: "product" as const,
      id: product.id,
      title: product.title,
      subtitle: `${product.sku ? `${product.sku} · ` : ""}${product._count.items} order line${product._count.items === 1 ? "" : "s"}`,
      href: `/products/${product.id}`,
    })),
    ...suppliers.map((supplier) => ({
      type: "supplier" as const,
      id: supplier.id,
      title: supplier.name,
      subtitle: `${supplier._count.costs} costed line${supplier._count.costs === 1 ? "" : "s"}`,
      href: `/suppliers/${supplier.id}`,
    })),
    ...buyers.map((buyer) => ({
      type: "buyer" as const,
      id: buyer.buyerUsername,
      title: buyer.buyerUsername,
      subtitle: `${buyer._count} order${buyer._count === 1 ? "" : "s"}`,
      href: `/orders?search=${encodeURIComponent(buyer.buyerUsername)}`,
    })),
  ];

  return NextResponse.json({ results });
}
