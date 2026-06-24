"use client";

import { Database, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DataSource } from "@/lib/google-ads/types";

export function DataSourceBadge({
  source,
  loading,
}: {
  source: DataSource;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Badge variant="default">
        <Loader2 className="h-3 w-3 animate-spin" />
        Načítavam dáta…
      </Badge>
    );
  }

  if (source === "google-ads") {
    return (
      <Badge variant="success">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
        Naživo z Google Ads
      </Badge>
    );
  }

  return (
    <Badge variant="default">
      <Database className="h-3 w-3" />
      Demo dáta
    </Badge>
  );
}
