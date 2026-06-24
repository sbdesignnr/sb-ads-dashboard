import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PricingTier, ThreatLevel } from "@/lib/competitors/types";

const THREAT_META: Record<
  ThreatLevel,
  { label: string; variant: BadgeProps["variant"]; dot: string }
> = {
  low: { label: "Nízka", variant: "success", dot: "bg-success" },
  medium: { label: "Stredná", variant: "warning", dot: "bg-warning" },
  high: { label: "Vysoká", variant: "danger", dot: "bg-danger" },
};

export function ThreatBadge({ level }: { level: ThreatLevel }) {
  const t = THREAT_META[level];
  return (
    <Badge variant={t.variant}>
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      Hrozba: {t.label}
    </Badge>
  );
}

const POSITIONING_META: Record<PricingTier, string> = {
  premium: "Premium",
  mid: "Stredná trieda",
  budget: "Budget",
  unknown: "Neznáme",
};

export function PositioningBadge({ tier }: { tier: PricingTier }) {
  return <Badge variant={tier === "premium" ? "purple" : "default"}>{POSITIONING_META[tier]}</Badge>;
}

export function positioningLabel(tier: PricingTier): string {
  return POSITIONING_META[tier];
}

const AVATAR_GRADIENTS = [
  "from-primary to-secondary",
  "from-success to-primary",
  "from-secondary to-danger",
  "from-warning to-danger",
  "from-primary to-success",
  "from-danger to-secondary",
];

export function CompetitorAvatar({
  name,
  size = 40,
}: {
  name: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  // Deterministic gradient from the name.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const gradient = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-bold text-white",
        gradient,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </span>
  );
}

export { THREAT_META };
