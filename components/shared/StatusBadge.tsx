import { Badge, type BadgeProps } from "@/components/ui/badge";
import { statusLabel } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/lib/types";

const MAP: Record<CampaignStatus, { variant: BadgeProps["variant"]; dot: string; pulse?: boolean }> = {
  active: { variant: "success", dot: "bg-success", pulse: true },
  paused: { variant: "warning", dot: "bg-warning" },
  learning: { variant: "info", dot: "bg-primary", pulse: true },
  limited: { variant: "warning", dot: "bg-warning" },
  removed: { variant: "danger", dot: "bg-danger" },
};

export function StatusBadge({ status, className }: { status: CampaignStatus; className?: string }) {
  const c = MAP[status];
  return (
    <Badge variant={c.variant} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot, c.pulse && "animate-pulse")} />
      {statusLabel(status)}
    </Badge>
  );
}
