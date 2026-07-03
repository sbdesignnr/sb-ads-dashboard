"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Reply, MailPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotifItem {
  id: string;
  type: "responded" | "followup";
  title: string;
  subtitle: string;
  href: string;
  at: string;
}

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/leads/notifications")
        .then((r) => r.json())
        .then((j) => {
          if (!active) return;
          setCount(j.count ?? 0);
          setItems(j.items ?? []);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-primary/40 hover:text-foreground focus:outline-none cursor-pointer">
        <Bell className="h-4.5 w-4.5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifikácie</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted">Žiadne nové notifikácie</div>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {items.map((it) => (
              <Link
                key={it.id}
                href={it.href}
                className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-2"
              >
                <span
                  className={
                    it.type === "responded"
                      ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-success/15 text-success"
                      : "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
                  }
                >
                  {it.type === "responded" ? <Reply className="h-3.5 w-3.5" /> : <MailPlus className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{it.title}</span>
                  <span className="block text-xs text-muted">{it.subtitle}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
