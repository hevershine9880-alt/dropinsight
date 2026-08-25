import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  CheckCircle2, Clock, Truck, PackageCheck, XCircle, RotateCcw, AlertTriangle,
  CircleDashed, HandCoins, CircleSlash, SplitSquareHorizontal, PackageX, Ban,
} from "lucide-react";
import type { SupplierClaim } from "@/lib/finance/types";

/**
 * Every status renders as icon + word + colour. Colour alone never carries the
 * meaning, which is both an accessibility requirement and simply easier to scan.
 */

const FULFILMENT: Record<string, { label: string; tone: BadgeTone; icon: React.ComponentType<{ className?: string }> }> = {
  AWAITING_DISPATCH: { label: "Awaiting dispatch", tone: "caution", icon: Clock },
  DISPATCHED: { label: "Dispatched", tone: "info", icon: Truck },
  IN_TRANSIT: { label: "In transit", tone: "info", icon: Truck },
  DELIVERED: { label: "Delivered", tone: "positive", icon: PackageCheck },
};

const PAYMENT: Record<string, { label: string; tone: BadgeTone; icon: React.ComponentType<{ className?: string }> }> = {
  PAID: { label: "Paid", tone: "positive", icon: CheckCircle2 },
  UNPAID: { label: "Unpaid", tone: "caution", icon: Clock },
  REFUNDED: { label: "Refunded", tone: "negative", icon: RotateCcw },
  PARTIALLY_REFUNDED: { label: "Part refunded", tone: "caution", icon: RotateCcw },
};

const CANCEL: Record<string, { label: string; tone: BadgeTone; icon: React.ComponentType<{ className?: string }> }> = {
  CANCELLED_BEFORE_FULFILMENT: { label: "Cancelled", tone: "neutral", icon: Ban },
  CANCELLED_AFTER_FULFILMENT: { label: "Cancelled after dispatch", tone: "negative", icon: PackageX },
};

export function OrderStatusBadge({
  fulfillmentStatus, cancelState, paymentStatus,
}: {
  fulfillmentStatus: string;
  cancelState: string;
  paymentStatus: string;
}) {
  if (cancelState !== "NONE") {
    const c = CANCEL[cancelState] ?? CANCEL.CANCELLED_BEFORE_FULFILMENT;
    return <Badge tone={c.tone} icon={c.icon}>{c.label}</Badge>;
  }
  if (paymentStatus === "REFUNDED" || paymentStatus === "PARTIALLY_REFUNDED") {
    const p = PAYMENT[paymentStatus];
    return <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>;
  }
  const f = FULFILMENT[fulfillmentStatus] ?? FULFILMENT.AWAITING_DISPATCH;
  return <Badge tone={f.tone} icon={f.icon}>{f.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const p = PAYMENT[status] ?? PAYMENT.PAID;
  return <Badge tone={p.tone} icon={p.icon}>{p.label}</Badge>;
}

const CLAIM: Record<SupplierClaim, { label: string; tone: BadgeTone; icon: React.ComponentType<{ className?: string }> }> = {
  NOT_ASKED: { label: "Not asked", tone: "caution", icon: CircleDashed },
  ASKED: { label: "Asked", tone: "info", icon: HandCoins },
  PROMISED: { label: "Promised", tone: "info", icon: Clock },
  RECEIVED: { label: "Recovered", tone: "positive", icon: CheckCircle2 },
  PARTIAL: { label: "Part recovered", tone: "caution", icon: SplitSquareHorizontal },
  WRITTEN_OFF: { label: "Written off", tone: "negative", icon: CircleSlash },
  NOT_APPLICABLE: { label: "No supplier cost", tone: "neutral", icon: XCircle },
};

export function SupplierClaimBadge({ claim }: { claim: string }) {
  const c = CLAIM[claim as SupplierClaim] ?? CLAIM.NOT_ASKED;
  return <Badge tone={c.tone} icon={c.icon}>{c.label}</Badge>;
}

export function ConnectionStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "CONNECTED":
      return <Badge tone="positive" icon={CheckCircle2}>Connected</Badge>;
    case "TOKEN_EXPIRED":
      return <Badge tone="negative" icon={AlertTriangle}>Needs reconnecting</Badge>;
    case "REVOKED":
      return <Badge tone="negative" icon={CircleSlash}>Access revoked</Badge>;
    case "DISCONNECTED":
      return <Badge tone="neutral" icon={XCircle}>Disconnected</Badge>;
    default:
      return <Badge tone="caution" icon={AlertTriangle}>Problem</Badge>;
  }
}

export function SyncStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "SUCCESS": return <Badge tone="positive" icon={CheckCircle2}>Success</Badge>;
    case "RUNNING": return <Badge tone="info" icon={Clock}>Running</Badge>;
    case "QUEUED": return <Badge tone="neutral" icon={CircleDashed}>Queued</Badge>;
    case "PARTIAL": return <Badge tone="caution" icon={AlertTriangle}>Partial</Badge>;
    default: return <Badge tone="negative" icon={XCircle}>Failed</Badge>;
  }
}
