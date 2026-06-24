"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, CalendarDays, LogOut, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore, type DateRangeDays } from "@/lib/store";
import { getPageTitle } from "./nav";

const RANGE_OPTIONS: { value: DateRangeDays; label: string }[] = [
  { value: 7, label: "Posledných 7 dní" },
  { value: 30, label: "Posledných 30 dní" },
  { value: 60, label: "Posledných 60 dní" },
  { value: 90, label: "Posledných 90 dní" },
];

interface HeaderProps {
  user: { name?: string | null; email?: string | null };
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const rangeDays = useUIStore((s) => s.rangeDays);
  const setRangeDays = useUIStore((s) => s.setRangeDays);

  const title = getPageTitle(pathname);
  const initials = (user.name ?? user.email ?? "SB")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden cursor-pointer"
        aria-label="Otvoriť menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <Select
            value={String(rangeDays)}
            onValueChange={(v) => setRangeDays(Number(v) as DateRangeDays)}
          >
            <SelectTrigger className="h-9 w-[180px] gap-2">
              <CalendarDays className="h-4 w-4 text-muted" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 transition-colors hover:border-primary/40 focus:outline-none cursor-pointer">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-semibold text-white">
              {initials || "SB"}
            </span>
            <span className="hidden max-w-[140px] truncate text-sm text-foreground sm:inline">
              {user.name ?? user.email}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted sm:inline" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  {user.name ?? "SB Design"}
                </span>
                <span className="truncate text-xs text-muted">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-danger focus:text-danger"
            >
              <LogOut className="h-4 w-4" />
              Odhlásiť sa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
