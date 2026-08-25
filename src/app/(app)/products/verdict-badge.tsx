import { Badge } from "@/components/ui/badge";
import { VERDICT_META, type ListingVerdict } from "@/lib/finance/listing-health";
import { VERDICT_ICONS } from "./listing-health-summary";

const TONES = {
  negative: "negative",
  caution: "caution",
  positive: "positive",
  brand: "brand",
  neutral: "neutral",
} as const;

export function VerdictBadge({ verdict }: { verdict: ListingVerdict }) {
  const meta = VERDICT_META[verdict];
  return (
    <Badge tone={TONES[meta.tone]} icon={VERDICT_ICONS[verdict]} title={meta.meaning}>
      {meta.label}
    </Badge>
  );
}
