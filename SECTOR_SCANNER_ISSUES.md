
# Sector Scanner Issues Analysis

## Problems Identified

### 1. **WRONG avgVolume Calculation** (Line 88)
```typescript
avgVolume: quote.average_price || quote.volume
```
❌ Using `quote.average_price` (a PRICE) as avgVolume!
❌ Fallback to `quote.volume` (TODAY's intraday volume, not average)

Should be: Calculate from 60 days of historical candles (like momentum scanner does)

### 2. **Using TODAY's Intraday Volume** (Line 87)
```typescript
volume: quote.volume
```
❌ Same issue we just fixed in momentum scanner!
❌ Will give 0.15x ratio during morning hours

Should be: Use last COMPLETED trading day's volume (like momentum scanner now does)

### 3. **Custom momentumScore Calculation** (Lines 182-204)
❌ Different formula than momentum scanner
❌ Simpler logic (doesn't match the proven momentum scorer)
❌ Not testing for uptrend properly

Should be: Import and use the SAME `calculateMomentumScore` function from momentum scanner

### 4. **Duplicate Technical Calculation**
The sector scanner calculates:
- SMA5, SMA10, SMA20
- RSI
- ATR
- momentumScore

Then passes to master scorer which RECALCULATES everything!

This creates inconsistency.

## Recommended Fix Strategy

### Option A: **Reuse Momentum Scanner Data** (BEST)
1. Call `/api/scanner/momentum` with `universe=nifty500`
2. Get properly calculated momentum signals
3. Filter by hot sectors
4. Display in Sector tab

Pros:
- ✅ Consistent with Trade Now / Momentum
- ✅ No code duplication
- ✅ Uses proven volume logic
- ✅ Faster (reuse existing infrastructure)

Cons:
- Couples Sector tab to Momentum scanner

### Option B: **Fix Sector Scanner Independently**
1. Fix avgVolume: Calculate from historical candles
2. Fix volume: Use last trading day (copy logic from momentum scanner)
3. Import `calculateMomentumScore` from momentum-scanner.ts
4. Remove duplicate calculations

Pros:
- ✅ Independent (as user requested)
- ✅ Can customize sector-specific logic

Cons:
- ❌ Code duplication
- ❌ Risk of divergence
- ❌ More maintenance

## Specific Code Changes Needed (Option B)

### Change 1: Fix avgVolume (Line 88)
```typescript
// BEFORE
avgVolume: quote.average_price || quote.volume

// AFTER
avgVolume: 0  // Will calculate from historical candles later
```

### Change 2: Calculate Real avgVolume (After fetching candles)
```typescript
// After line 150, before momentumSignals map:
const avgVolumeMap = new Map<string, number>()

for (const symbol of hotSectorSymbols) {
  const candles = historicalDataMap.get(symbol) || []
  if (candles.length > 0) {
    const avgVol = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length
    avgVolumeMap.set(symbol, avgVol)
  }
}
```

### Change 3: Find Last Trading Day Volume
```typescript
// Copy exact logic from app/api/scanner/momentum/route.ts lines 191-237
function findLastTradingDayVolume(candles: any[], currentVolumeFromQuote: number): number {
  // ... copy market hours logic ...
}
```

### Change 4: Import Real Momentum Scorer
```typescript
// Import the REAL calculator
import { calculateMomentumScore } from '@/lib/momentum-scanner'

// Replace lines 182-204 with:
const momentumScore = calculateMomentumScore(
  data.price,     // current
  sma5,
  sma10,
  sma20,
  rsi,
  volumeRatio,    // Using FIXED volumeRatio
  data.change     // changePercent
)
```

## Summary

The sector scanner has THE SAME volume bugs we just fixed in momentum scanner, PLUS:
- Wrong avgVolume (using price instead of volume!)
- Different momentum calculation (inconsistent)
- Code duplication

Best fix: Option A (reuse momentum scanner)
Independent fix: Option B (copy all the fixes we just made)

