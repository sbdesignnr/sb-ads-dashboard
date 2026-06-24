# SB Design — Ads Analytics Dashboard

Profesionálny nástroj na analýzu **Google Ads** a **Meta Ads** kampaní s AI odporúčaniami.

![stack](https://img.shields.io/badge/Next.js-15-black) ![ts](https://img.shields.io/badge/TypeScript-5-blue) ![tw](https://img.shields.io/badge/Tailwind-4-38bdf8)

## Tech stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` design tokens)
- **Recharts** — grafy · **Framer Motion** — animácie
- **next-auth v5** (credentials) — autentifikácia + middleware ochrana
- **Prisma + SQLite** (lokálne; pripravené na PostgreSQL)
- **Zustand** — state management
- **@react-pdf/renderer** — export reportov do PDF

## Rýchly štart

```bash
# 1. Inštalácia závislostí
npm install --legacy-peer-deps

# 2. Príprava databázy (vytvorí dev.db a admin používateľa)
npm run db:setup

# 3. Spustenie vývojového servera
npm run dev
```

Otvor [http://localhost:3000](http://localhost:3000).

### Demo prihlásenie

| Email | Heslo |
| --- | --- |
| `admin@sbdesign.sk` | `sbdesign2025` |

> Prihlásenie funguje aj bez `db:setup` — credentials majú fallback na hodnoty z `.env`.

## Štruktúra

```
app/
  (auth)/login/          — prihlasovacia stránka
  (dashboard)/
    page.tsx             — Overview dashboard
    google-ads/          — Google Ads kampane
    meta-ads/            — Meta Ads kampane
    campaigns/[id]/      — detail kampane
    ai-insights/         — AI odporúčania + chat
    reports/             — builder a export reportov
    settings/            — nastavenia
components/
  layout/ charts/ ai/ reports/ ui/ shared/
lib/
  mock-data/             — realistické mock dáta (90 dní, 14 kampaní)
  utils/                 — metrics (CTR, ROAS, CPC, CPM) + formatters
```

## Funkcie

- 📊 6 KPI kariet s animovaným počítaním, trendom a sparkline
- 📈 Interaktívne grafy (prepínanie metrík, časový rozsah 30/60/90 dní)
- 🧠 AI hodnotenie účtu (gauge), Quick Wins a chat nad dátami kampaní
- 🔍 Detail kampane s konverzným lievikom, analýzou a históriou zmien
- 📄 Export reportov do **PDF** (prémiový čierny dizajn) a **CSV**
- 🔐 Bezpečnosť: middleware ochrana, rate limiting loginu (5 pokusov),
  CSRF (next-auth), security headers v `next.config.ts`

## Bezpečnostné poznámky

- Pred nasadením do produkcie zmeň `AUTH_SECRET` v `.env`
  (`openssl rand -base64 32`).
- Pre migráciu na PostgreSQL zmeň `provider` v `prisma/schema.prisma`
  a `DATABASE_URL`.

---

© SB Design — interný nástroj.
