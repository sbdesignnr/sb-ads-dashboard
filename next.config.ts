import type { NextConfig } from "next";

const baseHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const appCsp = {
    // Reasonable CSP that still allows Next.js runtime + inline styles used by charts.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Allow external cover images (Supabase Storage + admin-pasted URLs).
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      // Embedded YouTube player (Videá sekcia).
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };

// Verejný náhľad návrhu (/nahlad/…) je samostatný HTML dokument s písmami z Google Fonts,
// vlastnými štýlmi a skriptom, preto má širšiu CSP než aplikácia.
const previewCsp = {
  key: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "img-src https: data: blob:",
    "connect-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    // TEMPORARY (Jarvis debugging): keep console.* in production. Revert later.
    removeConsole: false,
  },
  // google-ads-api is a Node-native package (gRPC/protobuf) — keep it external
  // so it is required at runtime instead of bundled. @sparticuz/chromium ships
  // a native binary (headless Chromium for lead-screenshot capture) that must
  // NOT be bundled either.
  serverExternalPackages: [
    "google-ads-api",
    "cheerio",
    "@google-analytics/data",
    "@sparticuz/chromium",
    "puppeteer-core",
    "sharp",
  ],
  // @sparticuz/chromium zisťuje cestu k binárke (bin/chromium.br a pod.)
  // dynamicky za behu — statická analýza (@vercel/nft), ktorá inak rozhoduje,
  // čo sa zabalí do funkcie, si ju sama nevšimne. Bez tohto by na Verceli
  // executablePath() ukazoval na súbor, ktorý sa do nasadenia nedostal.
  outputFileTracingIncludes: {
    "/api/leads/analyze-bulk": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/leads/[id]/ai": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/leads/scan": ["./node_modules/@sparticuz/chromium/bin/**"],
    // Ateliér (návrhy stránok) a nočný režim vykresľujú stránky v Chromiu
    "/api/agents/mockup": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/agents/research": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/cron/agents-night": ["./node_modules/@sparticuz/chromium/bin/**"],
    // autopilot Skauta skenuje segmenty (screenshoty webov)
    "/api/cron/agents-scout": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  eslint: {
    // Lint is run separately; do not block production builds.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      { source: "/((?!nahlad).*)", headers: [...baseHeaders, appCsp] },
      { source: "/nahlad/:path*", headers: [...baseHeaders, previewCsp] },
    ];
  },
};

export default nextConfig;
