# 🔍 Momentum Scanner - Debugging Guide

## Issue
Running the momentum scanner returns **0 signals** with **CHOPPY market sentiment**.

## Recent Changes Made

### 1. Enhanced Logging
- Added detailed per-stock logging in API route
- Added filtering statistics in momentum scanner
- Shows which filter is eliminating stocks

### 2. Relaxed Filters
- **Minimum Score**: Lowered from 60 → 45 (more signals)
- **Volume Filter**: Lowered from 100k → 50k shares
- **Stock Limit**: Scanning first 50 stocks (for faster testing)

### 3. Better Error Handling
- Log individual stock errors
- Track success vs error counts
- Return detailed error if no data collected

## How to Debug

### Step 1: Check Server Logs
When you run the scanner, check your **terminal/server logs** for:

```
🔍 Starting momentum scan...
✅ Found XX instruments from NIFTY 500
📊 Scanning 50 stocks (limited for faster results)
📊 Processing batch 1/5...
⚠️ SYMBOL: No quote data
⚠️ SYMBOL: Insufficient candles
✅ Collected data for XX stocks (XX success, XX errors)

📊 Filtering Summary:
   Price filter: XX stocks
   Volume filter: XX stocks
   Candles filter: XX stocks
   Uptrend filter: XX stocks
   Momentum filter: XX stocks
   Score filter: XX stocks
   ✅ Passed all filters: XX stocks
```

### Step 2: Common Issues

#### A. No Data Collected (stocksData.length = 0)
**Causes:**
- Kite API access token expired
- Rate limiting (too many requests)
- Historical data API permission missing
- Network issues

**Solutions:**
- Re-authenticate with Kite
- Check Kite Connect API plan (need historical data access)
- Increase delays between requests
- Check browser console for API errors

#### B. Data Collected But 0 Signals
**Causes:**
- **Uptrend filter**: Most stocks eliminated (not in SMA5 > SMA10 > SMA20 pattern)
- **Momentum filter**: Stocks don't have 60%+ up days in last 5 days
- **Score filter**: Calculated momentum scores below threshold
- **Market conditions**: Genuinely choppy/bearish market

**Solutions:**

1. **Lower Min Score** (Already done - now 45 instead of 60)
2. **Relax Momentum Check**: Edit `lib/momentum-scanner.ts` line 155:
   ```typescript
   // Change from 60% to 50%
   return upmoves / (period - 1) >= 0.5  // was 0.6
   ```

3. **Skip Uptrend Check Temporarily**: Comment out lines 473-476 in `lib/momentum-scanner.ts`:
   ```typescript
   // if (!isInUptrend(sma5, sma10, sma20, stock.current)) {
   //   filteredByUptrend++
   //   continue
   // }
   ```

4. **Test with Known Stocks**: Modify `app/api/scanner/momentum/route.ts` line 61:
   ```typescript
   // Replace with known high-volume stocks
   const symbolsToScan = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']
   ```

### Step 3: Verify API Access

Check if historical data API is working:
```javascript
// In browser console after running scanner:
// Check for errors like "403 Forbidden" or "Rate limit exceeded"
```

### Step 4: Market Conditions

The scanner looks for **uptrending stocks with momentum**. If the market is:
- **Bearish**: Most stocks trending down → 0 signals (correct behavior)
- **Choppy/Sideways**: Few clean setups → few signals
- **Bullish**: Many uptrends → many signals

**Check market manually:**
1. Go to NSE/BSE website
2. Check NIFTY 50 chart - is it in an uptrend?
3. Check individual large caps - are they above their SMAs?

## Quick Test

To verify the scanner works, temporarily use these known liquid stocks:

```typescript
// In app/api/scanner/momentum/route.ts, line 61:
const symbolsToScan = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 
                       'WIPRO', 'ITC', 'HINDUNILVR', 'BHARTIARTL', 'SBIN']
console.log(`📊 Testing with ${symbolsToScan.length} major stocks`)
```

Run the scanner again and check:
1. Do you see stock data being collected?
2. Which filter eliminates most stocks?
3. Do ANY stocks pass all filters?

## Configuration Reference

### Current Settings
```typescript
// API Route (app/api/scanner/momentum/route.ts)
- Stocks scanned: 50 (first 50 from NIFTY 500)
- Batch size: 10 stocks
- Delay per stock: 100ms
- Delay between batches: 500ms
- Min volume: 50,000 shares
- Min price: ₹50
- Max price: ₹5,000
- Default min score: 45

// Scanner Logic (lib/momentum-scanner.ts)
- Uptrend required: SMA5 > SMA10 > SMA20
- Momentum required: 60%+ up days in last 5 days
- Signal thresholds:
  * STRONG_BUY: score ≥ 75, RSI < 70, volume > 1.3x
  * BUY: score ≥ 60, RSI < 75, volume > 1.0x
  * WATCH: score ≥ 45
```

## Next Steps

1. **Run scanner** with new settings
2. **Check server logs** for filtering breakdown
3. **Adjust filters** based on what you see
4. **Report back** what the logs show

If you see "Collected data for 0 stocks" → API/authentication issue
If you see "Uptrend filter: 45 stocks" → Market is not trending up
If you see "Momentum filter: 40 stocks" → Stocks lack recent strength

## Files Modified

- ✅ `app/api/scanner/momentum/route.ts` - Added logging, relaxed filters
- ✅ `lib/momentum-scanner.ts` - Added filtering statistics
- ✅ `app/page.tsx` - Lowered default min score to 45
- ✅ `app/api/positions/paper/route.ts` - Fixed authentication

## Market Reality Check

Remember: **Zero signals can be CORRECT** if:
- Market is in downtrend/consolidation
- No stocks meet momentum criteria
- Risk-off sentiment prevails

The scanner is designed to keep you OUT of bad trades, not generate signals for the sake of it. CHOPPY market sentiment = "Don't trade right now" 🛑

