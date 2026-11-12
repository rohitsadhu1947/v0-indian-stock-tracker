# Vibe Trades — Indian Stock Tracker

> Backtested monthly stock strategies for NSE, with live quotes from Zerodha Kite Connect.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://v0-indian-stock-tracker-topaz.vercel.app)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js%2014-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Zerodha Kite](https://img.shields.io/badge/Powered%20by-Kite%20Connect-blue?style=for-the-badge)](https://kite.trade)

---

## What it does

A research-backed tool for investing in Indian stocks. Every strategy the app
recommends has been backtested on 16 years of NSE data, after costs and tax,
and the app shows that backtest next to the recommendation.

- **Monthly Plan** — three modes (Growth, Balanced, Defensive). Once a month it
  ranks the 500 most traded NSE stocks and holds the top 20 in a paper book.
- **Stock Check** — a risk report card for any stock, with a position-size limit.
- **Portfolio, Fundamentals, Market, Research, Data** — information only
  (prices, ratios, news, option positions, insider trades, delivery). They
  give no buy or sell verdicts.
- **Paper Trades** — positions opened from the old swing scanner, kept for the record.

Removed: the swing scanner (its buy signal did worse than a random day), the
master score, News Pops, Sector Rotation, the old Backtest tab, and the Intraday
and Universe Scanner tabs, whose entry signals were never tested.

## How the evidence is produced

```
npm run data:sync      # download NSE's daily archive, build the local store (data/, gitignored)
npm run research       # backtest every candidate strategy -> research/results/
npm run data:publish   # push the last three years of adjusted prices to Postgres
```

- `lib/market-data/` — NSE archive parsers, corporate-action adjustment, point-in-time universe, nightly update.
- `lib/research/` — the backtest harness: no look-ahead, real charges, capital gains tax, delistings.
- `lib/portfolio/` — factor definitions, ranking and selection, shared by the harness and the live plan.
- `research/results/summary.json` — the figures the app displays.

Prices update nightly from NSE's archive (`/api/cron/market-data`); no broker login is needed for that.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2 (App Router), TypeScript 5 |
| UI | Tailwind CSS v4, Radix UI, Zustand |
| Database | PostgreSQL via Neon serverless, Drizzle ORM (schema in `db/schema.ts`) |
| Auth | HMAC-signed sessions (email/password) + Kite OAuth; middleware gates every `/api/*` route |
| Broker | Zerodha Kite Connect (live quotes; multi-broker abstraction) |
| AI | Google Gemini (PDF parsing, news sentiment) |
| Alerts | Telegram Bot API |
| Tests | Vitest |

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (Neon serverless recommended)
- Zerodha Kite Connect API key + secret

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Auth
SESSION_SECRET=<64+ random chars: openssl rand -base64 64>

# Kite Connect
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret
KITE_REDIRECT_URL=https://yourdomain.com/api/auth/kite/callback

# Optional
GEMINI_API_KEY=...
TELEGRAM_BOT_TOKEN=...
LOG_LEVEL=info   # debug | info | warn | error
```

### Running locally

```bash
npm install
npm run db:push        # Apply schema to database
npm run dev            # Start development server
```

### Tests

```bash
npm test               # Run the test suite
npm run test:coverage  # Coverage report
```

---

## Auth Flow

1. User visits `/` → middleware checks `auth_user_id` cookie → redirects to `/login` if absent
2. Login via email/password (`POST /api/auth/login`) or Kite OAuth (`/api/auth/kite/login`)
3. Server sets `auth_user_id` cookie: `userId:timestamp:hmac` (HMAC-signed, 24h expiry)
4. Kite access token stored in `brokerConnections` table per user
5. All `/api/*` routes (except public allowlist) validated by middleware before handler runs

---

## Deployment (Vercel)

```bash
vercel --prod
```

Required env vars: `DATABASE_URL`, `SESSION_SECRET`, `KITE_API_KEY`, `KITE_API_SECRET`, `KITE_REDIRECT_URL`

Health check: `GET /api/health` (no auth required)
