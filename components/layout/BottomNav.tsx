"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Chrome, Search, Sparkles, MoreHorizontal } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { isActive } from "./nav";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/", label: "Prehľad", icon: LayoutDashboard },
  { href: "/google-ads", label: "Google", icon: Chrome },
  { href: "/keywords", label: "Slová", icon: Search },
  { href: "/ai-insights", label: "AI", icon: Sparkles },
];

/**
 * Mobile bottom navigation (replaces the sidebar on < lg). Shows the four
 * primary destinations plus a "Viac" button that opens the full nav drawer.
 */
export function BottomNav() {
  const pathname = usePathname();
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const moreActive = !PRIMARY.some((p) => isActive(pathname, p.href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      {PRIMARY.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer",
          moreActive ? "text-primary" : "text-muted hover:text-foreground",
        )}
      >
        <MoreHorizontal className="h-5 w-5" />
        Viac
      </button>
    </nav>
  );
}
