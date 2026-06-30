import {
  LayoutDashboard,
  Chrome,
  Facebook,
  Search,
  Sparkles,
  Crosshair,
  FileText,
  Newspaper,
  Youtube,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Prehľad", icon: LayoutDashboard },
  { href: "/google-ads", label: "Google Ads", icon: Chrome },
  { href: "/meta-ads", label: "Meta Ads", icon: Facebook },
  { href: "/keywords", label: "Kľúčové slová", icon: Search },
  { href: "/ai-insights", label: "AI Insights", icon: Sparkles },
  { href: "/competitors", label: "Konkurencia", icon: Crosshair },
  { href: "/reports", label: "Reporty", icon: FileText },
  { href: "/blog", label: "Blog", icon: Newspaper },
  { href: "/videos", label: "Videá", icon: Youtube },
  { href: "/settings", label: "Nastavenia", icon: Settings },
];

export function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Prehľad";
  if (pathname.startsWith("/campaigns")) return "Detail kampane";
  const item = NAV_ITEMS.find((n) => n.href !== "/" && pathname.startsWith(n.href));
  return item?.label ?? "Dashboard";
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}
