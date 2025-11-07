# 🚨 NEWS-DRIVEN MOMENTUM STRATEGY

## 🎯 THE PROBLEM

**Example: Vodafone Idea (VI) - $6B Investment News**

Traditional momentum scanner:
- ❌ Waits for technical setup
- ❌ Misses the initial news pop (10-20% move)
- ❌ Catches it late (already moved)

**What we need:**
- ✅ Catch news IMMEDIATELY (within minutes)
- ✅ Detect unusual volume spike
- ✅ Quick in, quick out (30 min - 2 hour trades)
- ✅ Separate section from regular momentum trades

---

## 📊 NEWS-DRIVEN VS MOMENTUM-DRIVEN

| Aspect | News Pop | Momentum Trade |
|--------|----------|----------------|
| **Trigger** | Breaking news | Technical setup |
| **Move** | 5-20% in 30 mins | 3-8% over 1-3 days |
| **Hold Time** | 30 mins - 2 hours | 1-3 days |
| **Risk** | High (can reverse fast) | Moderate |
| **Exit** | On profit or reversal | Stop-loss or target |
| **Volume** | 5-10x surge instantly | 2-3x above average |
| **Entry** | FOMO-driven, catch early | Calculated breakout |

---

## 🚀 INTEGRATED SOLUTION

### **TRADE NOW Tab - 3 Sections:**

```
┌─────────────────────────────────────────────────────┐
│  🎯 TRADE NOW                                       │
│                                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🔥 NEWS ALERTS (Breaking events)                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ 🚨 VI - VODAFONE IDEA                      │    │
│  │ ⚡ BREAKING: $6B Investment Talks          │    │
│  │                                             │    │
│  │ 📊 +12.5% in 15 mins | 8.7x volume         │    │
│  │ 📰 Source: ET Now (2 mins ago)             │    │
│  │                                             │    │
│  │ ⚠️ HIGH RISK - News Play                   │    │
│  │ Entry: ₹12.45 (current)                    │    │
│  │ Quick Target: ₹13.50 (+8.4%)               │    │
│  │ Stop Loss: ₹11.80 (-5.2%)                  │    │
│  │ Position: 4,000 shares (₹50K only!)        │    │
│  │                                             │    │
│  │ [⚡ QUICK TRADE] [📰 VIEW NEWS]             │    │
│  │                                             │    │
│  │ ⏱️ Auto-exit in 2 hours OR +8% OR -5%     │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🔥 HIGH CONVICTION (3-5 momentum trades)           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  [Regular momentum signals...]                      │
│                                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ✅ MODERATE (5-10 signals)                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  [Moderate momentum signals...]                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 HOW TO DETECT NEWS-DRIVEN POPS

### **Method 1: Volume Spike Scanner (Real-time)**

**Criteria:**
1. Volume spike > **5x** average in last 5 minutes
2. Price move > **3%** in last 5 minutes
3. No major technical setup before (sudden move)
4. Market cap > ₹1,000 Cr (avoid penny stocks)

**Scanner runs every 1 minute during market hours**

```typescript
interface NewsPop {
  symbol: string
  currentPrice: number
  changePercent: number  // % change in last 5-15 mins
  volumeSpike: number    // 5x, 10x surge
  timeDetected: Date
  marketCap: number
  
  // Auto-generated
  quickTarget: number    // +5-10% from current
  stopLoss: number       // -5% from current
  positionSize: number   // Smaller (0.5-1% risk)
  autoExitTime: Date     // 2 hours from detection
}
```

---

### **Method 2: News API Integration (Optional)**

**Sources:**
1. **Twitter/X API** - Track finance handles (@CNBCTV18, @ET_NOW, etc.)
2. **NewsAPI** - Real-time news feed
3. **Kite News Feed** - If available
4. **Telegram Channels** - Finance news bots

**Flow:**
```
News detected (Vodafone Idea + Investment)
    ↓
Fetch live price + volume
    ↓
If volume > 3x AND price > +2% → ALERT
    ↓
Show in NEWS ALERTS section
```

---

## 🎯 NEWS POP TRADING RULES

### **Entry Rules:**
1. ✅ Enter ONLY if volume > 5x average
2. ✅ Enter within 5-15 mins of detection
3. ✅ Max position: 1% of capital (₹3,000 on ₹3L)
4. ✅ Only stocks > ₹10 (avoid ultra penny stocks)

### **Exit Rules:**
1. ⚡ **Auto-exit after 2 hours** (news fades)
2. ⚡ **Exit at +8-10% profit** (quick target)
3. ⚡ **Exit at -5% loss** (tight stop)
4. ⚡ **Exit if volume drops below 2x** (momentum dying)

### **Risk Management:**
- ❌ Never more than 2 news trades open at once
- ❌ Max 5% of total capital in news trades
- ❌ No averaging down (news can reverse fast)
- ❌ No overnight holding (intraday only)

---

## 🚀 IMPLEMENTATION PLAN

### **Phase 2A: Add News Alerts Section (Days 3-4)**

**File Structure:**
```
lib/news-pop-scanner.ts         # Volume spike detection
app/api/scanner/news-pops/route.ts  # Backend API
app/components/NewsAlertsSection.tsx  # UI component
```

### **Core Algorithm:**

```typescript
// lib/news-pop-scanner.ts

interface NewsPop {
  symbol: string
  currentPrice: number
  changePercent5min: number
  volumeSpike: number
  marketCap: number
  detectedAt: Date
  newsHeadline?: string
  tradePlan: {
    entry: number
    quickTarget: number
    stopLoss: number
    positionSize: number
    autoExitTime: Date
  }
}

export async function scanForNewsPops(
  universe: string[]  // Nifty 500 or broader
): Promise<NewsPop[]> {
  const pops: NewsPop[] = []
  
  for (const symbol of universe) {
    // 1. Fetch last 5-minute candles
    const candles = await fetch5MinCandles(symbol, periods: 5)
    
    // 2. Calculate volume spike
    const avgVolume = calculateAverageVolume(candles.slice(0, 4))
    const currentVolume = candles[4].volume
    const volumeSpike = currentVolume / avgVolume
    
    // 3. Calculate price move
    const priceMove = ((candles[4].close - candles[0].open) / candles[0].open) * 100
    
    // 4. Check criteria
    if (
      volumeSpike > 5.0 &&           // 5x volume spike
      Math.abs(priceMove) > 3.0 &&   // 3%+ move
      candles[4].close > 10          // > ₹10 stock
    ) {
      // 5. Fetch market cap
      const fundamentals = await getFundamentals(symbol)
      const marketCap = fundamentals?.marketCap || 0
      
      if (marketCap > 10000000) {  // > ₹1,000 Cr
        // 6. Generate trade plan
        const entry = candles[4].close
        const quickTarget = entry * 1.08  // +8%
        const stopLoss = entry * 0.95     // -5%
        const riskAmount = 3000  // ₹3K risk for news trades
        const positionSize = Math.floor(riskAmount / (entry - stopLoss))
        const autoExitTime = new Date(Date.now() + 2 * 60 * 60 * 1000)  // 2 hours
        
        pops.push({
          symbol,
          currentPrice: entry,
          changePercent5min: priceMove,
          volumeSpike,
          marketCap,
          detectedAt: new Date(),
          tradePlan: {
            entry,
            quickTarget,
            stopLoss,
            positionSize,
            autoExitTime
          }
        })
      }
    }
  }
  
  return pops.sort((a, b) => b.volumeSpike - a.volumeSpike)  // Highest spike first
}
```

---

### **UI Component:**

```tsx
// app/components/NewsAlertsSection.tsx

export function NewsAlertsSection({ newsPops }: { newsPops: NewsPop[] }) {
  if (newsPops.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
        🔇 No breaking news detected. Monitoring {universe.length} stocks...
      </div>
    )
  }
  
  return (
    <div style={{ marginBottom: '30px' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
        padding: '15px 20px',
        borderRadius: '12px 12px 0 0',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span style={{ fontSize: '1.5em' }}>🚨</span>
        <h3 style={{ margin: 0, color: '#fff' }}>
          BREAKING NEWS ALERTS
        </h3>
        <span style={{ 
          marginLeft: 'auto',
          background: 'rgba(255,255,255,0.2)',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '0.85em'
        }}>
          ⚡ Real-time
        </span>
      </div>
      
      <div style={{ 
        background: 'rgba(255, 107, 107, 0.1)',
        border: '2px solid rgba(255, 107, 107, 0.3)',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '20px'
      }}>
        {newsPops.map((pop, index) => (
          <NewsPopCard key={pop.symbol} pop={pop} rank={index + 1} />
        ))}
      </div>
    </div>
  )
}

function NewsPopCard({ pop, rank }: { pop: NewsPop, rank: number }) {
  const minutesAgo = Math.floor((Date.now() - pop.detectedAt.getTime()) / 60000)
  
  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: rank < 3 ? '15px' : 0,
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '1.5em', marginRight: '10px' }}>
          🚨
        </span>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.3em' }}>
            {pop.symbol}
          </h4>
          <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '2px' }}>
            Detected {minutesAgo} min{minutesAgo !== 1 ? 's' : ''} ago
          </div>
        </div>
        
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ 
            fontSize: '1.3em', 
            fontWeight: 'bold',
            color: pop.changePercent5min > 0 ? '#10B981' : '#EF4444'
          }}>
            {pop.changePercent5min > 0 ? '+' : ''}{pop.changePercent5min.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.85em', color: '#F59E0B' }}>
            {pop.volumeSpike.toFixed(1)}x volume
          </div>
        </div>
      </div>
      
      {/* Warning Banner */}
      <div style={{
        background: 'rgba(251, 191, 36, 0.15)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '12px',
        fontSize: '0.9em'
      }}>
        ⚠️ <strong>HIGH RISK - News Play:</strong> Quick in/out. Auto-exit in 2 hours.
      </div>
      
      {/* Trade Plan */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '10px',
        marginBottom: '15px'
      }}>
        <div>
          <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Entry</div>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
            ₹{pop.tradePlan.entry.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Quick Target</div>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#10B981' }}>
            ₹{pop.tradePlan.quickTarget.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
            (+{(((pop.tradePlan.quickTarget - pop.tradePlan.entry) / pop.tradePlan.entry) * 100).toFixed(1)}%)
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Stop Loss</div>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#EF4444' }}>
            ₹{pop.tradePlan.stopLoss.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
            (-{(((pop.tradePlan.entry - pop.tradePlan.stopLoss) / pop.tradePlan.entry) * 100).toFixed(1)}%)
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Position</div>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
            {pop.tradePlan.positionSize} shares
          </div>
          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
            ₹{(pop.tradePlan.positionSize * pop.tradePlan.entry).toLocaleString()}
          </div>
        </div>
      </div>
      
      {/* Auto-Exit Timer */}
      <div style={{
        fontSize: '0.85em',
        opacity: 0.8,
        marginBottom: '15px',
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '6px'
      }}>
        ⏱️ Auto-exit: {pop.tradePlan.autoExitTime.toLocaleTimeString()} 
        OR +8% profit OR -5% loss (whichever first)
      </div>
      
      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => executeNewsTrade(pop)}
          style={{
            flex: 1,
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '1em'
          }}
        >
          ⚡ QUICK TRADE
        </button>
        
        <button
          style={{
            padding: '12px 20px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          📰 NEWS
        </button>
      </div>
    </div>
  )
}
```

---

## 🔄 AUTO-EXIT LOGIC FOR NEWS TRADES

```typescript
// Enhanced auto-exit for news trades
async function updateNewsTradesPnL() {
  const newsTrades = paperPositions.filter(p => 
    p.status === 'open' && 
    p.tradeType === 'NEWS_POP'
  )
  
  for (const trade of newsTrades) {
    const currentPrice = await getCurrentPrice(trade.symbol)
    const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
    const timeElapsed = Date.now() - trade.entryTime.getTime()
    const twoHours = 2 * 60 * 60 * 1000
    
    // Exit conditions for news trades
    if (
      pnlPercent >= 8 ||           // Hit +8% profit
      pnlPercent <= -5 ||          // Hit -5% loss
      timeElapsed >= twoHours      // 2 hours passed
    ) {
      await closePosition(trade.id, currentPrice, 'AUTO_EXIT_NEWS')
      console.log(`🚨 News trade auto-exited: ${trade.symbol} @ ${currentPrice} (${pnlPercent.toFixed(1)}%)`)
    }
  }
}
```

---

## 📊 COMPLETE TRADE NOW STRUCTURE

```
🎯 TRADE NOW Tab
├── 🚨 NEWS ALERTS (0-3 signals)
│   ├── Volume spike > 5x
│   ├── Price move > 3% in 5 mins
│   ├── Quick in/out (2 hour max)
│   └── Small position (0.5-1% risk)
│
├── 🔥 HIGH CONVICTION (3-5 signals)
│   ├── Score 85-100
│   ├── All stars aligned
│   ├── Hold 1-3 days
│   └── Normal position (2% risk)
│
└── ✅ MODERATE (5-10 signals)
    ├── Score 75-84
    ├── 2-3 factors strong
    ├── Hold 1-3 days
    └── Smaller position (1-1.5% risk)
```

---

## 🎯 PRIORITY ORDER

**Phase 2 (Days 3-5): Build TRADE NOW Tab**

**Day 3:**
- ✅ High Conviction section
- ✅ Moderate section
- ✅ Market context banner
- ✅ Capital dashboard

**Day 4:**
- ✅ News Alerts section
- ✅ Volume spike scanner
- ✅ Auto-exit logic (2-hour + profit/loss)

**Day 5:**
- ✅ Custom stock input
- ✅ One-click execution
- ✅ Polish & test

---

## 🚀 READY?

This gives you:
1. ✅ **News pops** (VI-type events) - 30 min to 2 hours
2. ✅ **High conviction** (strong setups) - 1-3 days
3. ✅ **Moderate** (good setups) - 1-3 days

**All in one screen. Clear actions. No confusion.** 🎯

**Shall I start building?**

