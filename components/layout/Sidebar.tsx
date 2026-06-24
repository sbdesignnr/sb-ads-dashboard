"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { NAV_ITEMS, isActive } from "./nav";
import { cn } from "@/lib/utils";

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white shadow-lg shadow-primary/20">
        SB
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">SB Design</p>
          <p className="truncate text-xs text-muted">Ads Analytics</p>
        </div>
      )}
    </Link>
  );
}

function NavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {active && (
              <motion.span
                layoutId="sidebar-active"
                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
              />
            )}
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } =
    useUIStore();

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 76 : 256 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-surface lg:flex"
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-border px-4",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <Logo collapsed={sidebarCollapsed} />
        </div>

        <div className="flex flex-1 flex-col py-4">
          <NavLinks collapsed={sidebarCollapsed} />
        </div>

        <div className="border-t border-border p-3">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer",
              sidebarCollapsed && "justify-center px-0",
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" />
                <span>Zbaliť</span>
              </>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Logo collapsed={false} />
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-1 flex-col py-4">
                <NavLinks collapsed={false} onNavigate={() => setMobileSidebarOpen(false)} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
