# 🗄️ Database Integration Guide

## ✅ What's Been Completed

### **Phase 1: Database Foundation** ✅
- [x] Neon PostgreSQL database created and connected
- [x] Drizzle ORM installed and configured
- [x] Complete database schema designed (15 tables)
- [x] All tables created with indexes and relationships
- [x] Database helper functions implemented
- [x] Git commits and GitHub push completed

---

## 📊 **Database Schema Overview**

### **1. Users & Authentication**
- `users` - Kite user profiles
- `sessions` - Access tokens and expiry
- `user_preferences` - Settings, themes, defaults

### **2. Trading Data**
- `positions` - Open and closed positions
- `trade_history` - Complete trading journal
- `watchlists` - Persistent stock lists

### **3. Market Data Cache**
- `stock_quotes` - Real-time quotes (5-min cache)
- `historical_data` - OHLC candles (1-hour cache)
- `pattern_analysis` - Intraday intelligence (cached until EOD)
- `fundamental_data` - PE, PB, sector data (24-hour cache)
- `news_data` - News + sentiment (6-hour cache)

### **4. Intelligence & Alerts**
- `screener_results` - Morning/evening scan history
- `market_dashboard` - Daily market intelligence (1-hour cache)
- `alerts` - Entry/exit notifications

---

## 🚀 **Phase 2: Integration Tasks**

### **Priority 1: Authentication & Sessions** 🔐

**Files to Modify:**
- `app/api/auth/kite/callback/route.ts`
- `app/api/auth/kite/session/route.ts`
- `app/api/auth/kite/logout/route.ts`

**Changes Needed:**

1. **In `/api/auth/kite/callback`** (after successful Kite login):
```typescript
import { getOrCreateUser, saveSession } from '@/lib/db-helpers'

// After getting Kite user ID and access token:
const user = await getOrCreateUser(kiteUserId, email, name)

// Save session to database
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
await saveSession(user.id, accessToken, refreshToken, expiresAt)

// Store user.id in cookie/session for future requests
```

2. **In `/api/auth/kite/session`** (check if token valid):
```typescript
import { getValidSession } from '@/lib/db-helpers'

// Get userId from cookie/session
const session = await getValidSession(userId)

if (!session) {
  return Response.json({ authenticated: false })
}

// Use session.accessToken for Kite API calls
```

3. **In `/api/auth/kite/logout`**:
```typescript
import { deleteSession } from '@/lib/db-helpers'

await deleteSession(userId)
```

---

### **Priority 2: Watchlist Persistence** 📋

**Files to Modify:**
- `app/page.tsx` (watchlist state management)

**Changes Needed:**

1. **Load watchlist from database on mount**:
```typescript
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/db-helpers'

useEffect(() => {
  async function loadWatchlist() {
    if (!userId) return
    
    const dbWatchlist = await getWatchlist(userId)
    setWatchlist(dbWatchlist.map(w => ({
      symbol: w.symbol,
      exchange: w.exchange,
      instrument_token: w.instrumentToken || 0
    })))
  }
  loadWatchlist()
}, [userId])
```

2. **Update `updateWatchlist` function**:
```typescript
const updateWatchlist = async (newWatchlist: WatchlistStock[]) => {
  setWatchlist(newWatchlist)
  
  // Sync to database
  if (userId) {
    // Clear and re-add (or implement smart diff)
    const currentDb = await getWatchlist(userId)
    
    // Add new stocks
    for (const stock of newWatchlist) {
      await addToWatchlist(userId, stock.symbol, stock.exchange, stock.instrument_token)
    }
    
    // Remove deleted stocks
    for (const dbStock of currentDb) {
      const exists = newWatchlist.some(s => s.symbol === dbStock.symbol && s.exchange === dbStock.exchange)
      if (!exists) {
        await removeFromWatchlist(userId, dbStock.symbol, dbStock.exchange)
      }
    }
  }
}
```

---

### **Priority 3: Position Persistence** 💼

**Files to Modify:**
- `app/page.tsx` (positions state management)

**Changes Needed:**

1. **Load positions on mount**:
```typescript
import { getOpenPositions, createPosition, updatePosition, closePosition } from '@/lib/db-helpers'

useEffect(() => {
  async function loadPositions() {
    if (!userId) return
    
    const dbPositions = await getOpenPositions(userId)
    setPositions(dbPositions.map(p => ({
      symbol: p.symbol,
      exchange: p.exchange,
      entryPrice: p.entryPrice,
      quantity: p.quantity,
      currentPrice: p.currentPrice || p.entryPrice,
      stopLoss: p.stopLoss,
      target: p.target,
      pnl: p.pnl || 0,
      pnl_percent: p.pnlPercent || 0,
      entryTime: p.entryTime.toISOString(),
      notes: p.notes,
      strategy: p.strategy
    })))
  }
  loadPositions()
}, [userId])
```

2. **Update `addManualPosition` function**:
```typescript
const addManualPosition = async (data: PositionFormData) => {
  // ... existing validation ...
  
  // Save to database
  if (userId) {
    const dbPosition = await createPosition(userId, {
      symbol: data.symbol.toUpperCase(),
      exchange: 'NSE',
      entryPrice: data.entryPrice,
      quantity: data.quantity,
      stopLoss: data.stopLoss,
      target: data.target,
      strategy: 'manual',
      notes: data.notes
    })
    
    // Add to local state with dbPosition.id for future updates
    const newPosition = {
      ...data,
      currentPrice: data.entryPrice,
      pnl: 0,
      pnl_percent: 0,
      dbId: dbPosition.id // Store DB ID for updates
    }
    setPositions([...positions, newPosition])
  }
}
```

3. **Update `updatePositionPrices` function**:
```typescript
const updatePositionPrices = async () => {
  // ... existing price fetching logic ...
  
  // Update database for each position
  if (userId) {
    for (const position of updatedPositions) {
      if (position.dbId) {
        await updatePosition(position.dbId, {
          currentPrice: position.currentPrice,
          pnl: position.pnl,
          pnlPercent: position.pnl_percent
        })
      }
    }
  }
}
```

4. **Update position close/exit logic**:
```typescript
const closePositionHandler = async (positionDbId: number, exitPrice: number, reason: string) => {
  await closePosition(positionDbId, exitPrice, reason)
  
  // Remove from local state
  setPositions(positions.filter(p => p.dbId !== positionDbId))
  
  // Show success alert
  alert('Position closed and saved to trade history!')
}
```

---

### **Priority 4: API Response Caching** ⚡

**Files to Modify:**
- `app/api/kite/quote/route.ts`
- `app/api/kite/historical/route.ts`
- `app/api/fundamentals/quote/route.ts`
- `app/api/news/quote/route.ts`

**Changes Needed:**

1. **In `/api/kite/quote/route.ts`**:
```typescript
import { getCachedQuote, cacheQuote } from '@/lib/db-helpers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get('symbols')?.split(',') || []
  
  const results = []
  const symbolsToFetch = []
  
  // Check cache first
  for (const fullSymbol of symbols) {
    const [exchange, symbol] = fullSymbol.split(':')
    const cached = await getCachedQuote(symbol, exchange, 5) // 5-min cache
    
    if (cached) {
      results.push(cached)
    } else {
      symbolsToFetch.push(fullSymbol)
    }
  }
  
  // Fetch missing from Kite API
  if (symbolsToFetch.length > 0) {
    const freshData = await kiteClient.getQuote(symbolsToFetch)
    
    // Cache each quote
    for (const [fullSymbol, data] of Object.entries(freshData)) {
      const [exchange, symbol] = fullSymbol.split(':')
      const cached = await cacheQuote(symbol, exchange, {
        instrumentToken: data.instrument_token,
        lastPrice: data.last_price,
        open: data.ohlc.open,
        high: data.ohlc.high,
        low: data.ohlc.low,
        close: data.ohlc.close,
        volume: data.volume,
        change: data.change,
        changePercent: data.change_percent,
        ohlc: data.ohlc
      })
      results.push(cached)
    }
  }
  
  return Response.json({ status: 'success', data: results })
}
```

2. **In `/api/kite/historical/route.ts`**:
```typescript
import { getCachedHistoricalData, cacheHistoricalData } from '@/lib/db-helpers'

export async function GET(request: Request) {
  // ... parse params ...
  
  // Check cache (1-hour for historical data)
  const cached = await getCachedHistoricalData(
    symbol,
    exchange,
    interval,
    from,
    to,
    60 // 60-minute cache
  )
  
  if (cached) {
    return Response.json({
      status: 'success',
      data: cached.candles
    })
  }
  
  // Fetch from Kite API
  const candles = await kiteClient.getHistoricalData(...)
  
  // Cache it
  await cacheHistoricalData(
    symbol,
    exchange,
    interval,
    from,
    to,
    candles,
    instrumentToken
  )
  
  return Response.json({ status: 'success', data: candles })
}
```

3. **Similar caching for `/api/fundamentals/quote/route.ts`**:
```typescript
// Check if fundamental data was fetched in last 24 hours
const cached = await db.query.fundamentalData.findFirst({
  where: and(
    eq(schema.fundamentalData.symbol, symbol),
    eq(schema.fundamentalData.exchange, exchange),
    gte(schema.fundamentalData.fetchedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
  )
})

if (cached) {
  return Response.json({ success: true, data: cached.data })
}

// Fetch fresh data from Yahoo Finance / Screener.in
// ... then cache it ...
```

---

### **Priority 5: Screener Results History** 📊

**Files to Modify:**
- `app/page.tsx` (screener functions)

**Changes Needed:**

1. **After running screener, save results**:
```typescript
import { saveScreenerResults, getLatestScreenerResults } from '@/lib/db-helpers'

const scanUniverse = async () => {
  // ... existing scan logic ...
  
  // Save to database
  if (userId) {
    await saveScreenerResults(
      userId,
      'universe',
      selectedLevel,
      universeResults,
      nifty500Stocks.length,
      universeResults.filter(r => r.recommendation !== 'SKIP').length
    )
  }
}

const runMarketCloseAnalyzer = async () => {
  // ... existing analysis logic ...
  
  // Save to database
  if (userId) {
    await saveScreenerResults(
      userId,
      'market_close',
      null,
      analysisResults,
      nifty500Stocks.length,
      analysisResults.filter(r => r.recommendation !== 'SKIP').length
    )
  }
}
```

2. **Add "View History" button to load past screener results**:
```typescript
const loadScreenerHistory = async (screenerType: string) => {
  const latest = await getLatestScreenerResults(userId, screenerType)
  
  if (latest) {
    setUniverseResults(latest.results)
    alert(`Loaded results from ${latest.runAt.toLocaleString()}`)
  }
}
```

---

### **Priority 6: Trade Journal & Statistics** 📈

**Files to Modify:**
- Create new `app/page.tsx` tab for "Trade Journal"

**Changes Needed:**

1. **Add new tab for Trade Journal**:
```typescript
const [activeTab, setActiveTab] = useState<'dashboard' | 'screener' | 'watchlist' | 'intraday' | 'fundamentals' | 'market' | 'journal'>('dashboard')

// In JSX:
<button
  onClick={() => setActiveTab('journal')}
  className={activeTab === 'journal' ? 'active' : ''}
>
  📊 Trade Journal
</button>
```

2. **Display trade history and statistics**:
```typescript
import { getTradeHistory, getTradeStatistics } from '@/lib/db-helpers'

const [tradeHistory, setTradeHistory] = useState([])
const [tradeStats, setTradeStats] = useState(null)

useEffect(() => {
  async function loadJournal() {
    if (!userId) return
    
    const history = await getTradeHistory(userId, 100)
    const stats = await getTradeStatistics(userId)
    
    setTradeHistory(history)
    setTradeStats(stats)
  }
  loadJournal()
}, [userId])

// Display:
// - Win Rate: {tradeStats.winRate.toFixed(2)}%
// - Total P&L: ₹{tradeStats.totalPnL.toFixed(2)}
// - Best Trade: ₹{tradeStats.bestTrade.toFixed(2)}
// - Worst Trade: ₹{tradeStats.worstTrade.toFixed(2)}
// - Table of all trades with entry/exit/duration/P&L
```

---

## 🎯 **Implementation Priority Order**

1. ✅ **Authentication & Sessions** - Essential for user identification
2. ✅ **Watchlist Persistence** - Quick win, high user value
3. ✅ **Position Persistence** - Critical for trading workflow
4. ✅ **API Response Caching** - Huge performance boost
5. ✅ **Screener Results History** - Useful for tracking over time
6. ✅ **Trade Journal** - Powerful analytics feature

---

## 🛠️ **Testing the Integration**

### **1. Test Authentication Flow**
```bash
# Start dev server
pnpm dev

# Login with Kite
# Check if user is created in database
pnpm db:studio
# Navigate to "users" table
# Verify your Kite user ID is there
```

### **2. Test Watchlist**
```typescript
// In browser console:
const response = await fetch('/api/watchlist/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'RELIANCE',
    exchange: 'NSE',
    instrument_token: 738561
  })
})

// Refresh page - watchlist should persist!
```

### **3. Test Position**
```typescript
// Add manual position via UI
// Refresh page
// Position should still be there!

// Check database:
// pnpm db:studio → Navigate to "positions" table
```

### **4. Test Caching**
```typescript
// First call (fetches from Kite API):
const quote1 = await fetch('/api/kite/quote?symbols=NSE:TCS')

// Second call (should be instant from cache):
const quote2 = await fetch('/api/kite/quote?symbols=NSE:TCS')
// This should be < 50ms response time
```

---

## 📚 **Database Studio (Visual Interface)**

To view and manage your database visually:

```bash
pnpm db:studio
```

This opens Drizzle Studio at `https://local.drizzle.studio`

You can:
- View all tables and data
- Run queries
- Edit records
- See relationships

---

## 🚨 **Troubleshooting**

### **Issue: "DATABASE_URL is not set"**
**Solution**: Verify `.env.local` has the correct `DATABASE_URL`

### **Issue: "Connection refused"**
**Solution**: Check if Neon database is accessible. Verify the connection string.

### **Issue: "Table does not exist"**
**Solution**: Run `pnpm db:push --force` again to recreate tables

### **Issue: "Foreign key violation"**
**Solution**: Ensure user exists before creating positions/watchlists

---

## 🎉 **Next Steps**

After completing the integration:

1. **Test thoroughly** on localhost
2. **Deploy to Vercel** (DATABASE_URL is already in Vercel env vars)
3. **Monitor performance** (queries should be < 100ms)
4. **Add more features**:
   - Export trade journal to CSV
   - Advanced filters on trade history
   - Performance charts over time
   - Sector-wise P&L breakdown

---

## 💡 **Pro Tips**

1. **Always check cache first** before hitting external APIs
2. **Set reasonable cache durations**:
   - Quotes: 5 minutes (intraday data)
   - Historical: 1 hour (daily candles)
   - Fundamentals: 24 hours (rarely changes)
   - News: 6 hours (updates throughout day)

3. **Use database indexes** for fast queries:
   - All helper functions already use indexed columns
   - Query by `userId`, `symbol`, `fetchedAt` are optimized

4. **Clean up old data periodically**:
   - Delete stock_quotes older than 7 days
   - Delete screener_results older than 30 days
   - Keep trade_history forever (for analytics)

5. **Monitor database size**:
   - Neon free tier: 0.5GB
   - If you hit limit, archive old data
   - Or upgrade to paid plan

---

## 📞 **Need Help?**

- **Drizzle Docs**: https://orm.drizzle.team/docs/overview
- **Neon Docs**: https://neon.tech/docs/introduction
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

---

**Built with ❤️ by the Indian Stock Tracker team**

