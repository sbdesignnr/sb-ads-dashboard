import { Badge } from "@/components/ui/badge";
import { platformLabel } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/types";

export function PlatformBadge({
  platform,
  className,
  showLabel = true,
}: {
  platform: Platform;
  className?: string;
  showLabel?: boolean;
}) {
  const isGoogle = platform === "google";
  return (
    <Badge variant={isGoogle ? "info" : "purple"} className={className}>
      <span
        className={cn(
          "h-2 w-2 rounded-sm",
          isGoogle ? "bg-primary" : "bg-secondary",
        )}
      />
      {showLabel && platformLabel(platform)}
    </Badge>
  );
}
