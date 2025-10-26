# Indian Stock Tracker - Zerodha Kite Connect Edition

*Real-time NSE/BSE stock analysis powered by Zerodha Kite Connect API*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://v0-indian-stock-tracker-seven.vercel.app)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Zerodha Kite](https://img.shields.io/badge/Powered%20by-Zerodha%20Kite-blue?style=for-the-badge)](https://kite.trade)

## 🚀 Overview

A comprehensive Indian stock market tracking and analysis application with real-time data from **Zerodha Kite Connect API**. Features advanced technical analysis, automated trading signals, and a powerful stock screener.

### ✨ Key Features

- 📊 **Real-Time Data** - Live NSE/BSE quotes with no rate limits
- 🔐 **Secure OAuth** - Zerodha authentication for data access
- 📈 **Technical Analysis** - RSI, MACD, Bollinger Bands, SMA/EMA
- 🎯 **Trading Signals** - Automated buy/sell/hold recommendations
- 🔍 **Stock Screener** - Find momentum breakouts and oversold bounces
- 📉 **Historical Data** - OHLC data for comprehensive analysis
- ⚡ **Fast & Reliable** - Server-side API with proper session management
- 🎨 **Modern UI** - Beautiful gradient interface with glass-morphism

## 🆕 What's New

**🎉 Migrated from Alpha Vantage to Zerodha Kite Connect!**

- ✅ More comprehensive Indian stock data
- ✅ No more 5 requests/minute rate limits
- ✅ Real-time quotes instead of delayed data
- ✅ Secure server-side authentication
- ✅ Access to full NSE/BSE instruments

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration information.

## 🏗️ Tech Stack

- **Framework:** Next.js 14.2 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** Radix UI
- **Data Source:** Zerodha Kite Connect API
- **Authentication:** OAuth 2.0
- **Deployment:** Vercel

## 🚀 Quick Start

### Prerequisites

1. **Zerodha Account** - Active Zerodha trading account
2. **Kite Connect App** - Create an app at [kite.trade](https://kite.trade)
3. **API Credentials** - API Key and Secret from Kite Connect

### Installation

```bash
# Clone the repository
git clone https://github.com/rohitsadhu1947/v0-indian-stock-tracker.git
cd v0-indian-stock-tracker

# Install dependencies
npm install
# or
pnpm install

# Setup environment variables
cp .env.local.example .env.local
# Edit .env.local with your Kite Connect credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Setup

Create a `.env.local` file with:

```env
# Zerodha Kite Connect Credentials
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret
KITE_CLIENT_ID=your_client_id

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000

# Session Secrets (generate random strings)
NEXTAUTH_SECRET=your_random_secret
SESSION_SECRET=your_random_secret
```

### Kite Connect Setup

1. Go to [kite.trade](https://kite.trade) and login
2. Create a new app
3. Set **Redirect URL** to: `http://localhost:3000/api/auth/kite/callback`
4. For production, use: `https://your-domain.vercel.app/api/auth/kite/callback`
5. Copy API Key and Secret to `.env.local`

## 📖 Usage

### 1. Authentication

Click **"Login with Zerodha Kite"** and authenticate with your Zerodha credentials. The app will request read-only access to market data.

### 2. Watchlist

- Add stocks using the input field (e.g., RELIANCE, TCS, INFY)
- Select exchange (NSE or BSE)
- View real-time prices, changes, and indicators
- Get automated trading signals for each stock

### 3. Stock Screener

- Click **"Run Screener"** to analyze 15 popular NSE stocks
- View results sorted by signal strength
- Add promising stocks to your watchlist
- Strategies: Momentum Breakout, Oversold Bounce, Trend Following

### 4. Active Signals

- Monitor strong buy/sell signals across all watched stocks
- View signal history with timestamps and reasons
- Track up to 15 recent signals

## 📊 Technical Indicators

The app calculates multiple technical indicators:

| Indicator | Period | Usage |
|-----------|--------|-------|
| RSI | 14 | Identify overbought (>70) and oversold (<30) conditions |
| MACD | 12/26/9 | Detect bullish/bearish momentum changes |
| Bollinger Bands | 20 | Find support/resistance levels |
| SMA | 20, 50 | Identify trend direction |
| EMA | 12, 26 | Calculate MACD components |

## 🎯 Trading Signals

Signals are generated based on multiple indicator confirmations:

- **STRONG BUY** (⭐⭐⭐⭐⭐) - 4+ bullish signals
- **BUY** (⭐⭐⭐⭐) - 2-3 bullish signals  
- **HOLD** (⭐⭐) - Mixed or insufficient signals
- **SELL** (⭐⭐⭐⭐) - 2-3 bearish signals
- **STRONG SELL** (⭐⭐⭐⭐⭐) - 4+ bearish signals

### Signal Components

- RSI oversold/overbought
- MACD crossovers
- Bollinger Band touches
- Moving average crossovers (Golden/Death Cross)
- Volume confirmation

## 🚢 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in project settings
4. Update Kite Connect redirect URL to: `https://your-app.vercel.app/api/auth/kite/callback`
5. Deploy!

### Environment Variables for Production

Make sure to set all variables from `.env.local.example` in your Vercel project settings.

## 🔐 Security

- ✅ API credentials stored server-side only
- ✅ HTTP-only cookies for session management
- ✅ No client-side credential exposure
- ✅ OAuth 2.0 authentication flow
- ✅ Secure session encryption

## 📁 Project Structure

```
app/
├── api/
│   ├── auth/kite/     # Authentication endpoints
│   └── kite/          # Data fetching endpoints
├── page.tsx           # Main UI
├── layout.tsx         # Root layout
└── globals.css        # Styles

lib/
├── utils.ts           # Utilities
└── kite-utils.ts      # Kite-specific utils & technical analysis

components/
└── theme-provider.tsx
```

## 🛠️ API Routes

### Authentication
- `GET /api/auth/kite/login` - Initiate OAuth flow
- `GET /api/auth/kite/callback` - Handle OAuth callback
- `GET /api/auth/kite/session` - Check authentication status
- `POST /api/auth/kite/logout` - Clear session

### Data
- `GET /api/kite/quote?symbols=NSE:RELIANCE` - Fetch quotes
- `GET /api/kite/historical?instrument_token=123` - Fetch OHLC data
- `GET /api/kite/instruments?search=RELIANCE` - Search instruments

## 📚 Documentation

- [Migration Guide](./MIGRATION_GUIDE.md) - Detailed migration from Alpha Vantage
- [Kite Connect Docs](https://kite.trade/docs/connect/v3/) - Official API documentation
- [Next.js Docs](https://nextjs.org/docs) - Framework documentation

## 🐛 Known Issues

1. **WebSocket warnings** - Optional dependencies for kiteconnect (can be ignored)
2. **Daily token expiry** - Users need to re-authenticate daily (Kite Connect limitation)
3. **Market hours only** - Live data available during 9:15 AM - 3:30 PM IST

## 🎯 Roadmap

- [ ] WebSocket integration for real-time streaming
- [ ] Portfolio tracking (holdings & positions)
- [ ] Order placement capability
- [ ] Price alerts & notifications
- [ ] TradingView chart integration
- [ ] Multi-timeframe analysis
- [ ] Strategy backtesting
- [ ] Export analysis to PDF

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## ⚠️ Disclaimer

This application is for educational and informational purposes only. It does not constitute financial advice. Always do your own research before making investment decisions. Trading in stocks involves risk of loss.

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- [Zerodha](https://zerodha.com) for the excellent Kite Connect API
- [Next.js](https://nextjs.org) team for the amazing framework
- [Vercel](https://vercel.com) for seamless deployment
- [v0.app](https://v0.app) for initial project generation

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/rohitsadhu1947/v0-indian-stock-tracker/issues)
- **Kite API:** [Kite Support](https://kite.trade/support)
- **Email:** rohitsadhu1947@gmail.com

---

**Built with ❤️ for the Indian stock market community**

⭐ Star this repo if you find it helpful!
