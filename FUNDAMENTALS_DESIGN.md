# 📊 Fundamental Analysis & News - Design Document

## 🎯 Objective

Add **fundamental analysis** and **news tracking** to the Indian Stock Tracker to help traders:
1. Make informed decisions based on company financials
2. React to breaking news and market events
3. Track earnings announcements and corporate actions
4. Understand long-term value (not just technical signals)

---

## 📚 Data Sources (Multi-Source Strategy)

### 1. **Yahoo Finance API** (via yfinance library)
**What it provides:**
- ✅ Market Cap, P/E Ratio, P/B Ratio
- ✅ EPS (Earnings Per Share)
- ✅ Dividend Yield, Payout Ratio
- ✅ Revenue, Profit, Operating Margin
- ✅ Debt-to-Equity Ratio
- ✅ 52-week High/Low
- ✅ Beta, Volume Average
- ✅ **FREE** and reliable!

**How to use:**
```bash
npm install yahoo-finance2
```

**Example:**
```typescript
import yahooFinance from 'yahoo-finance2';

const data = await yahooFinance.quoteSummary('RELIANCE.NS', {
  modules: ['price', 'summaryDetail', 'financialData', 'defaultKeyStatistics']
});
```

**Symbols for Indian stocks:**
- NSE: `RELIANCE.NS`, `TCS.NS`, `INFY.NS`
- BSE: `RELIANCE.BO`, `TCS.BO`, `INFY.BO`

---

### 2. **NewsAPI.org**
**What it provides:**
- ✅ Breaking news from 80+ sources
- ✅ Stock-specific news search
- ✅ Market news, business headlines
- ✅ **FREE tier**: 100 requests/day, articles up to 1 month old

**How to use:**
```bash
# Sign up at https://newsapi.org
# Free API key
```

**Example:**
```typescript
const response = await fetch(
  `https://newsapi.org/v2/everything?q=Reliance+Industries&apiKey=YOUR_KEY&language=en&sortBy=publishedAt`
);
```

**Best Indian sources:**
- Economic Times
- Business Standard
- Moneycontrol
- CNBC TV18
- Bloomberg Quint

---

### 3. **RSS Feeds** (Free, Real-time)
**What it provides:**
- ✅ Latest news from financial sites
- ✅ Corporate announcements
- ✅ Market updates
- ✅ **100% FREE**

**Key RSS Feeds:**
1. **Economic Times**: `https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms`
2. **Moneycontrol**: `https://www.moneycontrol.com/rss/MCtopnews.xml`
3. **NSE Announcements**: NSE website (may need scraping)
4. **BSE Corporate**: BSE website announcements

**How to use:**
```bash
npm install rss-parser
```

---

### 4. **NSE/BSE Public Data**
**What it provides:**
- ✅ Corporate actions (dividends, splits, bonuses)
- ✅ Board meetings
- ✅ Results announcements
- ✅ Shareholding patterns

**NSE APIs (public):**
- Corporate actions: `https://www.nseindia.com/api/corporates-corporateActions?index=equities`
- Results calendar: `https://www.nseindia.com/api/results-latest`

**Note:** NSE has anti-scraping measures, need proper headers and cookies.

---

### 5. **Screener.in** (Public Fundamental Data)
**What it provides:**
- ✅ Comprehensive fundamental data
- ✅ Financial ratios
- ✅ Quarterly results
- ✅ Peer comparison

**Access:** Public website, can be accessed programmatically with proper headers.

---

## 🏗️ Implementation Architecture

### Phase 1: Fundamental Data (PRIORITY)

**API Routes to Create:**
```
/api/fundamentals/[symbol]
  - Fetches: Market Cap, P/E, P/B, EPS, Dividend Yield
  - Source: Yahoo Finance
  
/api/fundamentals/financials/[symbol]
  - Fetches: Revenue, Profit, Margins, Debt/Equity
  - Source: Yahoo Finance
  
/api/fundamentals/ratios/[symbol]
  - Fetches: ROE, ROCE, Current Ratio, Quick Ratio
  - Source: Yahoo Finance + calculations
```

**Data Structure:**
```typescript
interface FundamentalData {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  
  // Valuation
  marketCap: number;
  peRatio: number;
  pbRatio: number;
  dividendYield: number;
  
  // Performance
  eps: number;
  revenueGrowth: number;
  profitGrowth: number;
  
  // Financial Health
  debtToEquity: number;
  currentRatio: number;
  roe: number;
  roce: number;
  
  // Market Data
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  beta: number;
  
  lastUpdated: Date;
}
```

---

### Phase 2: News & Sentiment

**API Routes to Create:**
```
/api/news/stock/[symbol]
  - Stock-specific news
  - Source: NewsAPI + RSS
  
/api/news/market
  - General market news
  - Source: NewsAPI + RSS
  
/api/news/corporate-actions
  - Dividends, splits, bonuses
  - Source: NSE/BSE
```

**Data Structure:**
```typescript
interface NewsArticle {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
  relevanceScore?: number;
}
```

**Sentiment Analysis:**
- Use simple keyword matching:
  - Positive: "profit", "growth", "record", "beat", "upgrade"
  - Negative: "loss", "decline", "miss", "downgrade", "concern"
  - Or use NPM package: `sentiment` or `natural`

---

### Phase 3: Corporate Actions & Events

**API Routes:**
```
/api/corporate-actions/[symbol]
  - Dividends (ex-date, amount, record date)
  - Stock splits
  - Bonus issues
  - Rights issues
  
/api/earnings-calendar
  - Upcoming results announcements
  - Past 7 days, next 30 days
```

**Data Structure:**
```typescript
interface CorporateAction {
  symbol: string;
  type: 'dividend' | 'split' | 'bonus' | 'rights';
  exDate: Date;
  recordDate: Date;
  amount?: number;
  ratio?: string;
  purpose?: string;
}

interface EarningsDate {
  symbol: string;
  companyName: string;
  resultDate: Date;
  quarter: string; // "Q1 FY25"
  announced: boolean;
}
```

---

## 🎨 UI Design - New "Fundamentals" Tab

### Layout:

```
┌─────────────────────────────────────────────────┐
│  Tabs: Watchlist | Screener | Intraday |        │
│        Universe | [FUNDAMENTALS] ← NEW          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Search Stock: [RELIANCE] [🔍 Analyze]          │
└─────────────────────────────────────────────────┘

┌──────────────┬──────────────┬──────────────────┐
│ Key Metrics  │  Financials  │  News & Events   │
├──────────────┼──────────────┼──────────────────┤
│ Market Cap   │ Revenue      │ Latest News (5)  │
│ P/E Ratio    │ Net Profit   │ [News Cards]     │
│ P/B Ratio    │ Oper. Margin │                  │
│ Div. Yield   │ Debt/Equity  │ Corporate Actions│
│ EPS          │ ROE          │ - Dividend: ₹10  │
│ 52W High/Low │ ROCE         │   Ex: 15 Nov     │
├──────────────┴──────────────┴──────────────────┤
│  Valuation Score: [Overvalued | Fair | Cheap]  │
│  Technical + Fundamental Combined Signal        │
└─────────────────────────────────────────────────┘
```

### Features:

1. **Key Metrics Card**
   - Market Cap (formatted: ₹1.2L Cr)
   - P/E, P/B ratios with color coding (good/bad)
   - Dividend Yield
   - 52-week high/low with current position

2. **Financials Card**
   - Revenue, Profit (TTM - Trailing Twelve Months)
   - Growth rates (YoY, QoQ)
   - Margins (Operating, Net)
   - Debt/Equity ratio

3. **News Feed**
   - Last 10 news articles
   - Sentiment badges (🟢 Positive, 🔴 Negative, ⚪ Neutral)
   - Click to open article
   - Auto-refresh every 5 minutes

4. **Corporate Actions Timeline**
   - Upcoming dividends, splits
   - Earnings dates
   - Board meetings

5. **Combined Score**
   - Technical Score (from existing signals)
   - Fundamental Score (P/E, ROE, Debt, Growth)
   - **OVERALL: BUY / HOLD / SELL**

---

## 📊 Valuation Logic

### Fundamental Score (0-100):

```typescript
function calculateFundamentalScore(data: FundamentalData): number {
  let score = 50; // Start neutral
  
  // P/E Ratio (lower is better)
  if (data.peRatio < 15) score += 15;
  else if (data.peRatio < 25) score += 10;
  else if (data.peRatio < 35) score += 5;
  else score -= 10;
  
  // ROE (higher is better)
  if (data.roe > 20) score += 15;
  else if (data.roe > 15) score += 10;
  else if (data.roe > 10) score += 5;
  
  // Debt/Equity (lower is better)
  if (data.debtToEquity < 0.5) score += 10;
  else if (data.debtToEquity < 1) score += 5;
  else if (data.debtToEquity > 2) score -= 10;
  
  // Dividend Yield
  if (data.dividendYield > 2) score += 5;
  
  // Revenue Growth
  if (data.revenueGrowth > 15) score += 10;
  else if (data.revenueGrowth > 10) score += 5;
  
  return Math.min(100, Math.max(0, score));
}
```

### Combined Signal:

```typescript
function getCombinedSignal(
  technicalSignal: TradingSignal,
  fundamentalScore: number
): 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' {
  // Technical + Fundamental agreement = STRONG signal
  // Disagreement = HOLD
  
  const isTechnicalBullish = ['STRONG BUY', 'BUY'].includes(technicalSignal.signal);
  const isFundamentalBullish = fundamentalScore >= 70;
  
  if (isTechnicalBullish && isFundamentalBullish) return 'STRONG BUY';
  if (isTechnicalBullish && fundamentalScore >= 50) return 'BUY';
  if (!isTechnicalBullish && fundamentalScore < 40) return 'STRONG SELL';
  if (!isTechnicalBullish && fundamentalScore < 50) return 'SELL';
  
  return 'HOLD'; // Mixed signals
}
```

---

## 🚀 Implementation Steps

### Step 1: Install Dependencies
```bash
npm install yahoo-finance2 rss-parser sentiment
npm install @types/yahoo-finance2 @types/rss-parser --save-dev
```

### Step 2: Create API Routes
1. `/api/fundamentals/quote/route.ts` - Fetch basic fundamentals
2. `/api/fundamentals/financials/route.ts` - Detailed financials
3. `/api/news/stock/route.ts` - Stock news
4. `/api/news/market/route.ts` - Market news
5. `/api/corporate-actions/route.ts` - Corporate actions

### Step 3: Create Utility Functions
- `lib/fundamentals-utils.ts` - Calculate scores, ratios
- `lib/news-utils.ts` - Parse RSS, sentiment analysis
- `lib/corporate-actions-utils.ts` - Parse NSE/BSE data

### Step 4: UI Implementation
- Add "Fundamentals" tab to `app/page.tsx`
- Create fundamental data cards
- Create news feed component
- Add combined signal display

### Step 5: Caching Strategy
- Cache fundamental data for 1 hour (updates infrequently)
- Cache news for 5 minutes (updates frequently)
- Use localStorage or in-memory cache

---

## 💰 Cost Analysis

| Service | Free Tier | Cost if Exceeds |
|---------|-----------|-----------------|
| Yahoo Finance | ✅ Unlimited | FREE |
| NewsAPI | 100 req/day | $449/month |
| RSS Feeds | ✅ Unlimited | FREE |
| NSE/BSE Public | ✅ Unlimited | FREE |

**Estimated Costs:**
- Development: FREE (all free APIs)
- Production: FREE if < 100 news requests/day
- Scale: May need NewsAPI paid plan or alternative sources

---

## 🎯 Priority Implementation Order

### Phase 1 (HIGH PRIORITY): ⭐⭐⭐
1. ✅ Yahoo Finance integration
2. ✅ Basic fundamental data display
3. ✅ P/E, Market Cap, EPS, Debt/Equity
4. ✅ Fundamental score calculation

### Phase 2 (MEDIUM PRIORITY): ⭐⭐
5. ✅ Stock-specific news (NewsAPI)
6. ✅ News sentiment analysis
7. ✅ Combined Technical + Fundamental signal

### Phase 3 (NICE TO HAVE): ⭐
8. ✅ Corporate actions (NSE/BSE)
9. ✅ Earnings calendar
10. ✅ Market news feed

---

## 📈 Success Metrics

**Feature will be successful if:**
1. Users can see fundamental data within 2 seconds
2. P/E, Market Cap, ROE displayed clearly
3. News updates every 5 minutes
4. Combined signal helps users make better decisions
5. Corporate actions notify users 7 days in advance

---

## 🔐 Security & Rate Limiting

1. **API Keys**: Store in `.env.local`, NEVER expose to client
2. **Rate Limiting**: Max 1 request per symbol per minute
3. **Caching**: Aggressive caching to reduce API calls
4. **Error Handling**: Graceful fallback if API fails

---

## 📚 References

- Yahoo Finance API: https://github.com/gadicc/node-yahoo-finance2
- NewsAPI: https://newsapi.org/docs
- NSE India: https://www.nseindia.com
- BSE India: https://www.bseindia.com

---

**Next Steps:** Start with Phase 1 - Yahoo Finance integration for fundamental data! 🚀

