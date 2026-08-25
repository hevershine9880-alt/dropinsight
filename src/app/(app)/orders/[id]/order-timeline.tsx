import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { format } from "date-fns";
import { cn } from "@/lib/cn";
import {
  ShoppingCart, CreditCard, Truck, PackageCheck, RotateCcw, Ban, HandCoins, Clock,
} from "lucide-react";

/** What actually happened to this order, in order. */
export function OrderTimeline({
  order,
}: {
  order: {
    orderDate: Date;
    dispatchDeadline: Date | null;
    dispatchedAt: Date | null;
    deliveredAt: Date | null;
    cancelState: string;
    trackingNumber: string | null;
    carrier: string | null;
    refunds: {
      id: string;
      type: string;
      refundedAt: Date;
      supplierClaim: string;
      supplierAnsweredAt: Date | null;
    }[];
  };
}) {
  const events: {
    at: Date;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    detail?: string;
    tone: "neutral" | "positive" | "negative" | "caution";
  }[] = [
    { at: order.orderDate, icon: ShoppingCart, title: "Order placed on eBay", tone: "neutral" },
    { at: order.orderDate, icon: CreditCard, title: "Payment received", tone: "positive" },
  ];

  if (order.dispatchedAt) {
    const late = !!(order.dispatchDeadline && order.dispatchedAt > order.dispatchDeadline);
    events.push({
      at: order.dispatchedAt,
      icon: Truck,
      title: late ? "Dispatched after eBay's deadline" : "Dispatched",
      detail: order.trackingNumber
        ? `${order.carrier ?? "Tracked"} · ${order.trackingNumber}`
        : "No tracking was added",
      tone: late ? "negative" : "positive",
    });
  } else if (order.cancelState === "NONE" && order.dispatchDeadline) {
    events.push({
      at: order.dispatchDeadline,
      icon: Clock,
      title: order.dispatchDeadline < new Date() ? "Dispatch deadline passed" : "Dispatch deadline",
      tone: order.dispatchDeadline < new Date() ? "negative" : "caution",
    });
  }

  if (order.deliveredAt) {
    events.push({ at: order.deliveredAt, icon: PackageCheck, title: "Delivered", tone: "positive" });
  }

  for (const refund of order.refunds) {
    events.push({
      at: refund.refundedAt,
      icon: refund.type === "CANCELLATION" ? Ban : RotateCcw,
      title:
        refund.type === "CANCELLATION" ? "Order cancelled and refunded"
          : refund.type === "RETURN" ? "Return refunded"
            : "Refunded to buyer",
      tone: refund.type === "CANCELLATION" ? "neutral" : "negative",
    });

    if (refund.supplierAnsweredAt) {
      events.push({
        at: refund.supplierAnsweredAt,
        icon: HandCoins,
        title:
          refund.supplierClaim === "RECEIVED" ? "Supplier refunded you in full"
            : refund.supplierClaim === "PARTIAL" ? "Supplier refunded you in part"
              : "Written off — the supplier is not paying",
        tone: refund.supplierClaim === "WRITTEN_OFF" ? "negative" : "positive",
      });
    }
  }

  events.sort((a, b) => +a.at - +b.at);

  const TONES = {
    neutral: "bg-surface-sunken text-ink-muted",
    positive: "bg-positive-soft text-positive",
    negative: "bg-negative-soft text-negative",
    caution: "bg-caution-soft text-caution",
  };

  return (
    <Card>
      <CardHeader title="Timeline" description="Everything that happened to this order." />
      <CardBody>
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
          {events.map((event, index) => (
            <li key={`${event.title}-${index}`} className="relative flex gap-3">
              <span className={cn("z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-surface", TONES[event.tone])}>
                <event.icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-base font-medium text-ink">{event.title}</p>
                {event.detail ? <p className="text-sm text-ink-muted">{event.detail}</p> : null}
                <time dateTime={event.at.toISOString()} className="mt-0.5 block text-xs text-ink-subtle">
                  {format(event.at, "d MMM yyyy 'at' HH:mm")}
                </time>
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
