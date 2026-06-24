"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-300 ease-out",
          collapsed ? "lg:pl-[76px]" : "lg:pl-64",
        )}
      >
        <Header user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
