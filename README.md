# Vibe Trades — Indian Stock Tracker

> Real-time NSE/BSE analysis, momentum scanning, and paper trading — powered by Zerodha Kite Connect.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://v0-indian-stock-tracker-seven.vercel.app)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js%2014-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Zerodha Kite](https://img.shields.io/badge/Powered%20by-Kite%20Connect-blue?style=for-the-badge)](https://kite.trade)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2 (App Router), TypeScript 5 |
| UI | Tailwind CSS v4, Radix UI |
| State | Zustand v5 (5 stores) |
| Database | PostgreSQL via Neon serverless, Drizzle ORM 0.44 |
| Auth | HMAC-signed sessions (email/password) + Kite OAuth |
| Broker | Zerodha Kite Connect SDK (multi-broker abstraction) |
| AI | Google Gemini (PDF parsing, sentiment) |
| Alerts | Telegram Bot API |
| Tests | Vitest (75 tests) |

---

## Architecture

```
app/
├── page.tsx                  # Shell (~989 lines): auth, tab bar, store init
├── components/
│   ├── WatchlistTab.tsx       # Watchlist + signal cards
│   ├── IntradayTab.tsx        # Morning screener, ORB, trade watch, positions
│   ├── UniverseTab.tsx        # NIFTY 500 scanner
│   ├── FundamentalsTab.tsx    # Fundamental analysis + combined intelligence
│   ├── MarketTab.tsx          # Market dashboard (indices, breadth, movers)
│   ├── MomentumTab.tsx        # Momentum swing scanner + paper trading
│   ├── ErrorBoundary.tsx      # Generic React error boundary
│   ├── TabErrorBoundary.tsx   # Per-tab isolation
│   └── ...29 total components
│
lib/
├── stores/                   # Zustand stores (auth, watchlist, positions, market, ui)
├── hooks/                    # use-auth, use-market-data, use-positions
├── broker/                   # Multi-broker abstraction (Kite, Angel)
├── logger.ts                 # Structured JSON logger (prod) / colorized (dev)
├── rate-limit.ts             # Sliding-window rate limiter (PostgreSQL-backed)
├── market-utils.ts           # RSI, MACD, Bollinger Bands, trading signals
├── momentum-scanner.ts       # NIFTY 500 momentum scan algorithm
├── master-scorer.ts          # Composite signal scoring
├── intraday-utils.ts         # VWAP, ORB, gap detection
├── multi-user-auth.ts        # HMAC session auth + RBAC
├── api-client.ts             # Typed fetch client with 401 handling
└── ...37 total modules

app/api/                      # 57 API routes
db/
├── schema.ts                 # 22 PostgreSQL tables (Drizzle ORM)
└── index.ts                  # Neon serverless connection

middleware.ts                 # Auth gate + security headers (CSP, HSTS, etc.)
```

---

## Features

### Trading Tabs (all lazy-loaded, error-isolated)
- **Watchlist** — Live quotes, RSI/MACD signals, strength bars
- **Intraday** — Morning screener, Opening Range Breakout scanner, Trade Watch monitor, position P&L
- **Universe Scanner** — Scans 200+ NIFTY 500 stocks for gap/volume/volatility candidates
- **Momentum** — Systematic 1-7 day swing scanner with paper trade execution
- **Fundamentals** — PE ratio, ROE, debt metrics + combined technical+fundamental signal
- **Market Dashboard** — Indices, sector heatmap, market breadth, top movers
- **Top Picks** — AI-powered recommendation engine
- **Global Macro** — Geopolitical and macro intelligence
- **News Pops** — Sentiment-driven momentum scanner
- **Sector Rotation** — Inter-sector flow analysis
- **Research** — Analyst reports and multi-layer news
- **Backtest** — Strategy backtesting engine
- **Settings / Admin** — Broker connection, RBAC, data management

### Infrastructure
- **Security** — HMAC-signed sessions, middleware auth gate on all `/api/*` routes, security headers (CSP, HSTS, X-Frame-Options), no legacy plain-integer tokens
- **Rate limiting** — 10 login attempts/15 min, 30 scanner calls/min (PostgreSQL-backed sliding window)
- **Caching** — DB-backed quote and historical data cache (Neon PostgreSQL)
- **Logging** — Structured JSON in production, colorized in development
- **Health check** — `GET /api/health` with DB connectivity probe

---

## Database Schema (22 tables)

`users`, `userPermissions`, `brokerConnections`, `watchlists`, `positions`, `paperPositions`, `stockQuotes`, `historicalData`, `screenerResults`, `patternAnalysis`, `marketCloseAnalyses`, `fundamentalData`, `newsCache`, `backtestRuns`, `backtestTrades`, `adminAuditLog`, `rateLimitBuckets`, `sectors`, `sectorStocks`, `events`, `telegramSettings`, `systemConfig`

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
npm test               # Run all 75 tests
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
