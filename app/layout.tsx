import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SB Design — Ads Analytics Dashboard",
    template: "%s · SB Design Ads",
  },
  description:
    "Profesionálny nástroj na analýzu Google Ads a Meta Ads kampaní s AI odporúčaniami.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080C14",
  width: "device-width",
  initialScale: 1,
};

// Databáza (Supabase) beží vo Frankfurte (eu-central-1) — bez tohto by funkcie na
// Verceli mohli bežať ďalej od nej, a každý dotaz by platil sieťové oneskorenie
// navyše. Toto nastavenie sa dedí do všetkých stránok, layoutov aj API routes,
// pokiaľ ho konkrétna route nenastaví inak.
export const preferredRegion = "fra1";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sk" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
