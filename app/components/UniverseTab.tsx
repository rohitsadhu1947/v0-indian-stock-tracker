'use client'

import React, { memo } from 'react'
import { useMarketStore } from '@/lib/stores/market-store'
import { usePositionsStore } from '@/lib/stores/positions-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useWatchlistStore } from '@/lib/stores/watchlist-store'
import { useUIStore } from '@/lib/stores/ui-store'
import {
  analyzeHistoricalPatterns,
  generateStockIntelligence,
  analyzeMarketClose,
  sleep,
  type DailyCandle,
} from '@/lib/pattern-analysis'
import { fetchStockQuote } from '@/lib/stock-fetcher'

export default memo(function UniverseTab() {
  const {
    isScanningUniverse, setIsScanningUniverse,
    scanResults, setScanResults,
    minVolume, setMinVolume,
    minGapPercent, setMinGapPercent,
    scanProgress, setScanProgress,
    marketCloseAnalysis, setMarketCloseAnalysis,
    isAnalyzingClose, setIsAnalyzingClose,
  } = useMarketStore()

  const { authStatus } = useAuthStore()

  const {
    appendToIntradayWatchlist,
    setIntradayWatchlist,
    tradeWatch, setTradeWatch,
    intradayPositions,
  } = usePositionsStore()

  const {
    screenerGroups, setScreenerGroups,
    setActiveScreenerGroup,
  } = useWatchlistStore()

  const { setIsLoading } = useUIStore()

  // ─── Functions ──────────────────────────────────────────────────────────────

  async function scanUniverse() {
    setIsScanningUniverse(true)
    setIsLoading(true)
    setScanProgress(0)

    try {
      console.log('🔍 Scanning NIFTY 500 universe with historical analysis...')

      // Fetch universe stocks
      const universeResponse = await fetch('/api/market-data/universe')
      if (!universeResponse.ok) throw new Error('Failed to fetch universe')

      const universeData = await universeResponse.json()
      const stocks = universeData.data || []

      console.log(`📊 Fetched ${stocks.length} stocks from universe`)

      // Analyze each stock with rate limiting
      const results: any[] = []
      const totalStocks = Math.min(stocks.length, 150) // Try 150 stocks (more attempts = better chance of success)

      console.log(`🔄 Starting analysis of ${totalStocks} stocks...`)

      let successCount = 0
      let failCount = 0

      for (let i = 0; i < totalStocks; i++) {
        const stock = stocks[i]

        try {
          // Rate limiting: 150ms delay between requests (faster but still safe)
          if (i > 0) await sleep(150)

          // Fetch current quote
          console.log(`📊 [${i + 1}/${totalStocks}] Analyzing ${stock.tradingsymbol}...`)
          const data = await fetchStockQuote(stock.tradingsymbol)

          if (!data) {
            console.warn(`⚠️ ${stock.tradingsymbol}: No quote data available`)
            failCount++
            continue
          }

          // Fetch historical data (last 10 days)
          const historicalResponse = await fetch(
            `/api/market-data/historical?instrument_token=${data.instrumentToken}&interval=day`
          )

          if (!historicalResponse.ok) {
            console.warn(`⚠️ ${stock.tradingsymbol}: Failed to fetch historical (${historicalResponse.status})`)
            failCount++
            continue
          }

          const historicalData = await historicalResponse.json()
          const candles = historicalData.candles || historicalData.data || []

          console.log(`📈 ${stock.tradingsymbol}: Received ${candles.length} historical candles`)

          if (historicalData.meta) {
            console.log(`   From: ${historicalData.meta.from?.split('T')[0]}, To: ${historicalData.meta.to?.split('T')[0]}`)
          }

          // FALLBACK MODE: If no historical data, use current day data
          let intelligence: any
          let pattern: any

          if (candles.length < 2) {
            console.log(`ℹ️ ${stock.tradingsymbol}: No historical data (${candles.length} days) - using current day analysis`)

            // Generate recommendation based ONLY on current day's data
            const gap = ((data.current - data.open) / data.open) * 100
            const dayRange = ((data.dayHigh - data.dayLow) / data.open) * 100
            const volumeScore = data.volume >= minVolume ? 1 : 0

            // Simple scoring without historical patterns
            let score = 0
            const reasons: string[] = []
            let recommendation: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'SKIP' = 'WATCH'

            // Gap analysis
            if (Math.abs(gap) >= 1.5) {
              score += 30
              reasons.push(`Strong gap: ${gap > 0 ? '+' : ''}${gap.toFixed(2)}%`)
              if (Math.abs(gap) >= 2.5) recommendation = 'BUY'
            } else if (Math.abs(gap) >= 0.5) {
              score += 15
              reasons.push(`Moderate gap: ${gap > 0 ? '+' : ''}${gap.toFixed(2)}%`)
            }

            // Volume analysis
            if (volumeScore) {
              score += 25
              reasons.push(`Good volume: ${(data.volume / 100000).toFixed(1)}L`)
            }

            // Range analysis
            if (dayRange >= 2) {
              score += 25
              reasons.push(`High volatility: ${dayRange.toFixed(2)}% range`)
              if (dayRange >= 4 && Math.abs(gap) >= 2) recommendation = 'STRONG_BUY'
            } else if (dayRange >= 1) {
              score += 15
              reasons.push(`Moderate range: ${dayRange.toFixed(2)}%`)
            }

            // Price level
            reasons.push(`Price: ₹${data.current.toFixed(2)}`)

            if (score < 30) recommendation = 'SKIP'
            else if (score < 50) recommendation = 'WATCH'

            intelligence = {
              symbol: stock.tradingsymbol,
              recommendation,
              confidence: Math.min(score, 100),
              pattern: {
                gapFillRate: 0,
                volatilityConsistency: 0,
                momentumFollowThrough: 0,
                averageDayRange: dayRange,
                successRate: 0,
                bestEntry: gap > 0 ? 'GAP_UP' : gap < 0 ? 'GAP_DOWN' : 'BREAKOUT',
                confidence: Math.min(score, 100)
              },
              reasons: [`⚠️ Current day analysis only (no historical data)`, ...reasons],
              historicalScore: score,
              keyLevels: {
                support: [data.dayLow],
                resistance: [data.dayHigh]
              },
              expectedMove: {
                direction: gap > 0 ? 'UP' : gap < 0 ? 'DOWN' : 'NEUTRAL',
                target: data.current * (gap > 0 ? 1.02 : 0.98),
                stopLoss: data.current * (gap > 0 ? 0.985 : 1.015)
              }
            }

            pattern = intelligence.pattern

              } else {
            // NORMAL MODE: We have historical data
            if (candles.length < 5) {
              console.log(`ℹ️ ${stock.tradingsymbol}: Limited historical data (${candles.length} days) - analysis may be less accurate`)
            }

            // Convert to DailyCandle format (Kite returns objects, not arrays!)
            const dailyCandles: DailyCandle[] = candles.map((c: any) => ({
              date: new Date(c.date),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume
            }))

            // Analyze historical patterns
            pattern = analyzeHistoricalPatterns(stock.tradingsymbol, dailyCandles)

            // Generate intelligence
            intelligence = generateStockIntelligence(
              stock.tradingsymbol,
              pattern,
              data.current,
              dailyCandles
            )
          }

          // Calculate basic score for sorting
          const gap = ((data.current - data.open) / data.open) * 100
          const dayRange = ((data.dayHigh - data.dayLow) / data.open) * 100

          results.push({
            ...intelligence,
            current: data.current,
            open: data.open,
            high: data.dayHigh,
            low: data.dayLow,
            volume: data.volume,
            gap: gap,
            gapType: gap > 0 ? 'GAP_UP' : gap < 0 ? 'GAP_DOWN' : 'FLAT',
            change: data.change,
            changePercent: data.changePercent,
            score: intelligence.historicalScore,
            dayRange: dayRange,
            instrumentToken: data.instrumentToken
          })

          successCount++

          // Log only significant signals (BUY or STRONG_BUY)
          if (intelligence.recommendation === 'STRONG_BUY' || intelligence.recommendation === 'BUY') {
            console.log(`✅ ${stock.tradingsymbol}: ${intelligence.recommendation} (score: ${intelligence.historicalScore}, success: ${pattern.successRate.toFixed(0)}%)`)
          }

          // Update progress
          setScanProgress(Math.round((i + 1) / totalStocks * 100))

        } catch (err) {
          console.error(`❌ Error analyzing ${stock.tradingsymbol}:`, err)
          failCount++
        }
      }

      console.log(`\n📊 Scan Summary: ${successCount} successful, ${failCount} failed out of ${totalStocks} stocks`)

      // Sort by historical score (highest first)
      const sortedResults = results
        // TEMPORARILY DISABLED: .filter(r => r.recommendation !== 'SKIP') // Filter out SKIP recommendations
        .sort((a, b) => b.historicalScore - a.historicalScore)
        .slice(0, 50) // Top 50 candidates

      setScanResults(sortedResults)

      const strongBuy = sortedResults.filter(r => r.recommendation === 'STRONG_BUY').length
      const buy = sortedResults.filter(r => r.recommendation === 'BUY').length

      if (results.length === 0) {
        alert(
          `⚠️ No stocks analyzed successfully!\n\n` +
          `Attempted: ${totalStocks} stocks\n` +
          `Failed: ${failCount} stocks\n\n` +
          `Check browser console for details.\n` +
          `Possible issues:\n` +
          `- Market is closed (weekend/holiday)\n` +
          `- API rate limiting\n` +
          `- Authentication expired`
        )
            } else {
        alert(
          `✅ Intelligence Scan Complete!\n\n` +
          `📊 Analyzed ${results.length} stocks with historical patterns\n` +
          `❌ Failed ${failCount} stocks\n\n` +
          `🚨 ${strongBuy} STRONG BUY signals\n` +
          `✅ ${buy} BUY signals\n` +
          `👀 ${sortedResults.length - strongBuy - buy} WATCH signals`
        )
      }

    } catch (error: any) {
      console.error('Universe scan error:', error)
      alert(`❌ Scan failed: ${error.message}`)
    } finally {
      setIsScanningUniverse(false)
      setIsLoading(false)
      setScanProgress(0)
    }
  }

  // Market Close Analyzer - Run after 3:30 PM for tomorrow's strategy
  async function runMarketCloseAnalysis() {
    setIsAnalyzingClose(true)
    setIsLoading(true)

    try {
      console.log('🌙 Running Market Close Analysis for tomorrow\'s strategy...')

      // First run universe scan with historical analysis
      await scanUniverse()

      // Generate market close analysis from scan results
      if (scanResults.length === 0) {
        alert('⚠️ No scan data available')
        return
      }

      const analysis = analyzeMarketClose(scanResults)
      setMarketCloseAnalysis(analysis)

      // Save to localStorage for morning review
      localStorage.setItem('marketCloseAnalysis', JSON.stringify(analysis))
      localStorage.setItem('marketCloseDate', new Date().toISOString())

      alert(
        `✅ Market Close Analysis Complete!\n\n` +
        `📊 Tomorrow's Top ${analysis.topPicks.length} Picks Ready\n` +
        `📈 Market Sentiment: ${analysis.marketSentiment}\n` +
        `⚡ Risk Level: ${analysis.riskLevel}\n\n` +
        `Analysis saved for tomorrow morning!`
      )

    } catch (error: any) {
      console.error('Market close analysis error:', error)
      alert(`❌ Analysis failed: ${error.message}`)
    } finally {
      setIsAnalyzingClose(false)
      setIsLoading(false)
    }
  }

  // Load yesterday's analysis
  function loadYesterdayAnalysis() {
    try {
      const savedAnalysis = localStorage.getItem('marketCloseAnalysis')
      const savedDate = localStorage.getItem('marketCloseDate')

      if (!savedAnalysis || !savedDate) {
        alert('⚠️ No previous analysis found')
        return
      }

      const analysis = JSON.parse(savedAnalysis)
      setMarketCloseAnalysis(analysis)

      // Check if analysis is from yesterday
      const analysisDate = new Date(savedDate)
      const today = new Date()
      const daysDiff = Math.floor((today.getTime() - analysisDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff > 2) {
        alert('⚠️ Analysis is more than 2 days old. Consider running a fresh scan.')
      } else {
        alert(`✅ Loaded analysis from ${analysisDate.toLocaleDateString()}`)
      }

    } catch (error) {
      console.error('Error loading analysis:', error)
      alert('❌ Failed to load previous analysis')
    }
  }

  // Load yesterday's top picks into screeners
  function loadYesterdayPicks() {
    if (!marketCloseAnalysis) {
      alert('⚠️ No market close analysis available. Load yesterday\'s analysis first!')
      return
    }

    const topStocks = marketCloseAnalysis.topPicks.slice(0, 15).map((p: any) => p.symbol)

    // Update intraday watchlist
    setIntradayWatchlist(topStocks)

    // Update screener group
    const updatedGroups = {
      ...screenerGroups,
      'Yesterday\'s Analysis': topStocks
    }
    setScreenerGroups(updatedGroups)
    setActiveScreenerGroup('Yesterday\'s Analysis')

    alert(`✅ Loaded ${topStocks.length} stocks from yesterday's analysis!\n\nReady to run morning screener!`)
  }

  // Load top candidates into screener watchlists
  function loadTopCandidates(count: number = 15) {
    if (scanResults.length === 0) {
      alert('⚠️ No scan results. Run Universe Scanner first!')
      return
    }

    const topStocks = scanResults.slice(0, count).map((r: any) => r.symbol)

    // Update intraday watchlist
    setIntradayWatchlist(topStocks)

    // Update screener group
    const updatedGroups = {
      ...screenerGroups,
      'Today\'s Top Picks': topStocks
    }
    setScreenerGroups(updatedGroups)
    setActiveScreenerGroup('Today\'s Top Picks')

    alert(`✅ Loaded top ${count} candidates!\n\n${topStocks.slice(0, 5).join(', ')}...\n\nReady to run screeners!`)
  }

  // Clear scan results
  function clearScanResults() {
    setScanResults([])
  }

  // Add stock to Trade Watch
  function addToTradeWatch(symbol: string, source: string = 'manual', initialData?: any) {
    // Check if already in watch
    if (tradeWatch.some((w: any) => w.symbol === symbol)) {
      alert(`⚠️ ${symbol} is already in Trade Watch`)
      return
    }

    // Check if already in positions
    if (intradayPositions.some((p: any) => p.symbol === symbol)) {
      alert(`⚠️ ${symbol} is already in your open positions`)
      return
    }

    const watchItem = {
      symbol,
      addedAt: new Date(),
      addedFrom: source,
      currentPrice: initialData?.entry_price || initialData?.current_price || 0,
      addedPrice: initialData?.entry_price || initialData?.current_price || 0,
      targetPrice: initialData?.target || 0,
      stopLoss: initialData?.stop_loss || 0,
      expectedType: initialData?.signal_type || 'BUY',
      conditions: {
        momentum: false,
        volume: false,
        rsi: false,
        vwap: false,
        support: false
      },
      conditionsMet: 0,
      lastChecked: new Date()
    }

    setTradeWatch([...tradeWatch, watchItem])
    alert(`✅ ${symbol} added to Trade Watch!\n\nSystem will monitor for perfect entry conditions.`)
  }

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="strategy-info" style={{
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(75, 0, 130, 0.2))',
        border: '2px solid rgba(138, 43, 226, 0.5)'
      }}>
        <h2 style={{ fontSize: '1.8em', marginBottom: '10px' }}>🔍 Universe Scanner - NIFTY 500</h2>
        <p style={{ fontSize: '1.1em', marginBottom: '15px' }}>
          Automatically scan 200+ stocks to find the BEST intraday candidates based on gap, volume, and volatility!
        </p>
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '15px',
          borderRadius: '10px',
          marginTop: '15px'
        }}>
          <h3 style={{ marginBottom: '10px' }}>🎯 How it works:</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
            <div>
              <strong>1. 📊 Scan Universe</strong><br/>
              <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Analyzes 200+ stocks for intraday potential</span>
            </div>
            <div>
              <strong>2. 🎯 Smart Scoring</strong><br/>
              <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Ranks stocks by gap, volume, volatility (0-100)</span>
            </div>
            <div>
              <strong>3. ✅ Load to Screeners</strong><br/>
              <span style={{ fontSize: '0.9em', opacity: 0.8 }}>One-click to populate watchlists & screeners</span>
            </div>
            <div>
              <strong>4. 🚀 Run Screeners</strong><br/>
              <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Get precise entry signals for best candidates</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scanner Controls */}
      <div className="controls" style={{
        marginTop: '20px',
        padding: '20px',
        background: 'rgba(138, 43, 226, 0.1)',
        border: '1px solid rgba(138, 43, 226, 0.3)',
        borderRadius: '10px'
      }}>
        <h3 style={{ marginBottom: '15px' }}>⚙️ Scanner Settings</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              📊 Minimum Volume (shares)
            </label>
            <input
              type="number"
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1em',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: 'white'
              }}
            />
            <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
              Current: {(minVolume / 100000).toFixed(1)} Lakh shares
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              📈 Minimum Gap % (open vs yesterday close)
            </label>
            <input
              type="number"
              step="0.1"
              value={minGapPercent}
              onChange={(e) => setMinGapPercent(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1em',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: 'white'
              }}
            />
            <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
              Lower = more results, Higher = stricter filter
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={scanUniverse}
            disabled={isScanningUniverse || !authStatus.authenticated}
            style={{
              padding: '15px 30px',
              fontSize: '1.1em',
              fontWeight: 'bold',
              background: isScanningUniverse ? 'rgba(128, 128, 128, 0.3)' : 'linear-gradient(135deg, #8a2be2, #4b0082)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: isScanningUniverse ? 'not-allowed' : 'pointer',
              flex: '1',
              minWidth: '200px'
            }}
          >
            {isScanningUniverse
              ? `🔄 Scanning... ${scanProgress}%`
              : '🔍 Scan Universe (Morning)'}
          </button>

          <button
            onClick={runMarketCloseAnalysis}
            disabled={isAnalyzingClose || !authStatus.authenticated}
            style={{
              padding: '15px 30px',
              fontSize: '1.1em',
              fontWeight: 'bold',
              background: isAnalyzingClose ? 'rgba(128, 128, 128, 0.3)' : 'linear-gradient(135deg, #ff6b6b, #c92a2a)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: isAnalyzingClose ? 'not-allowed' : 'pointer'
            }}
          >
            {isAnalyzingClose ? '🔄 Analyzing...' : '🌙 Market Close Analysis (Evening)'}
          </button>

          {marketCloseAnalysis && (
            <button
              onClick={loadYesterdayPicks}
              style={{
                padding: '15px 30px',
                fontSize: '1.1em',
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                color: '#000',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              ⭐ Load Yesterday's Picks
            </button>
          )}

          {scanResults.length > 0 && (
            <>
              <button
                onClick={() => loadTopCandidates(15)}
                style={{
                  padding: '15px 30px',
                  fontSize: '1.1em',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #00ff64, #00cc51)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}
              >
                ✅ Load Top 15 to Screeners
              </button>

              <button
                onClick={clearScanResults}
                style={{
                  padding: '15px 30px',
                  fontSize: '1.1em',
                  fontWeight: 'bold',
                  background: 'rgba(255, 0, 100, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 0, 100, 0.5)',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}
              >
                🗑️ Clear Results
              </button>
            </>
          )}
        </div>

        {!authStatus.authenticated && (
          <div style={{
            marginTop: '15px',
            padding: '12px',
            background: 'rgba(255, 193, 7, 0.2)',
            border: '1px solid rgba(255, 193, 7, 0.5)',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            ⚠️ Please login to use Universe Scanner
          </div>
        )}
      </div>

      {/* Scan Results */}
      {scanResults.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            padding: '15px',
            background: 'rgba(138, 43, 226, 0.1)',
            border: '1px solid rgba(138, 43, 226, 0.3)',
            borderRadius: '10px'
          }}>
            <h3 style={{ margin: 0 }}>🎯 Top Intraday Candidates</h3>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
              {scanResults.length} stocks found
            </div>
          </div>

          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <table className="screener-table" style={{ width: '100%' }}>
                <thead>
                    <tr>
                  <th>Rank</th>
                        <th>Symbol</th>
                  <th>Recommendation</th>
                  <th>Confidence</th>
                  <th>Success Rate</th>
                  <th>Current Price</th>
                  <th>Gap</th>
                  <th>Best Entry</th>
                  <th>Historical Insights</th>
                  <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                {scanResults.map((result, idx) => {
                  const gapColor = result.gap > 0 ? '#00ff64' : result.gap < 0 ? '#ff0064' : '#ffc107'
                  const recommendationColor =
                    result.recommendation === 'STRONG_BUY' ? '#00ff64' :
                    result.recommendation === 'BUY' ? '#00cc51' :
                    result.recommendation === 'WATCH' ? '#ffc107' : '#ff9800'

                  return (
                    <tr key={idx}>
                      <td>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: idx < 3 ? 'linear-gradient(135deg, #ffd700, #ffed4e)' :
                                     idx < 10 ? 'linear-gradient(135deg, #c0c0c0, #e8e8e8)' :
                                     'rgba(255, 255, 255, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          color: idx < 10 ? '#000' : '#fff',
                          margin: '0 auto'
                        }}>
                          {idx + 1}
                        </div>
                      </td>
                      <td><strong style={{ fontSize: '1.1em' }}>{result.symbol}</strong></td>
                      <td>
                        <div style={{
                          padding: '6px 14px',
                          background: recommendationColor,
                          color: '#000',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          display: 'inline-block',
                          fontSize: '0.95em'
                        }}>
                          {result.recommendation === 'STRONG_BUY' ? '🚨 STRONG BUY' :
                           result.recommendation === 'BUY' ? '✅ BUY' :
                           result.recommendation === 'WATCH' ? '👀 WATCH' : '⏭️ SKIP'}
                        </div>
                      </td>
                      <td>
                        <div style={{
                          padding: '5px 12px',
                          background: result.confidence >= 70 ? 'rgba(0, 255, 100, 0.2)' :
                                     result.confidence >= 50 ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                          border: `1px solid ${result.confidence >= 70 ? '#00ff64' :
                                               result.confidence >= 50 ? '#ffc107' : '#ff9800'}`,
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          display: 'inline-block'
                        }}>
                          {result.confidence}%
                        </div>
                      </td>
                      <td>
                        <div style={{
                          fontSize: '1.1em',
                          fontWeight: 'bold',
                          color: result.pattern?.successRate >= 70 ? '#00ff64' :
                                 result.pattern?.successRate >= 60 ? '#ffc107' : '#ff9800'
                        }}>
                          {result.pattern?.successRate?.toFixed(0) || 'N/A'}%
                        </div>
                        <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                          {result.pattern?.averageDayRange?.toFixed(2) || 'N/A'}% avg range
                        </div>
                      </td>
                      <td>₹{result.current.toFixed(2)}</td>
                      <td>
                        <div style={{
                          padding: '5px 12px',
                          background: gapColor,
                          color: '#000',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          display: 'inline-block'
                        }}>
                          {result.gap >= 0 ? '+' : ''}{result.gap.toFixed(2)}%
                        </div>
                      </td>
                      <td>
                        <span style={{
                          padding: '5px 10px',
                          background: 'rgba(138, 43, 226, 0.2)',
                          border: '1px solid rgba(138, 43, 226, 0.5)',
                          borderRadius: '6px',
                          fontSize: '0.9em',
                          fontWeight: 'bold'
                        }}>
                          {result.pattern?.bestEntry?.replace('_', ' ') || 'BREAKOUT'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.8)', maxWidth: '300px' }}>
                        {result.reasons?.slice(0, 3).join(' • ') || 'No data'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                          <button
                            onClick={() => {
                              appendToIntradayWatchlist(result.symbol)
                              alert(`✅ ${result.symbol} added to Intraday Watchlist!`)
                            }}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.9em',
                              background: 'rgba(0, 255, 100, 0.2)',
                              border: '1px solid #00ff64',
                              color: '#00ff64',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            + Intraday
                          </button>
                          <button
                            onClick={() => addToTradeWatch(result.symbol, 'universe-scan', result)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.9em',
                              background: 'rgba(138, 43, 226, 0.2)',
                              border: '1px solid #8a2be2',
                              color: '#8a2be2',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            👁️ Watch
                          </button>
                        </div>
                      </td>
                </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Quick Stats */}
          <div style={{
            marginTop: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px'
          }}>
            <div style={{
              padding: '15px',
              background: 'rgba(0, 255, 100, 0.1)',
              border: '1px solid rgba(0, 255, 100, 0.3)',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#00ff64' }}>
                {scanResults.filter(r => r.gapType === 'GAP_UP').length}
              </div>
              <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Gap Up Stocks</div>
            </div>

            <div style={{
              padding: '15px',
              background: 'rgba(255, 0, 100, 0.1)',
              border: '1px solid rgba(255, 0, 100, 0.3)',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#ff0064' }}>
                {scanResults.filter(r => r.gapType === 'GAP_DOWN').length}
              </div>
              <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Gap Down Stocks</div>
            </div>

            <div style={{
              padding: '15px',
              background: 'rgba(138, 43, 226, 0.1)',
              border: '1px solid rgba(138, 43, 226, 0.3)',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#8a2be2' }}>
                {scanResults.filter(r => r.score >= 70).length}
              </div>
              <div style={{ fontSize: '0.9em', opacity: 0.8 }}>High Score (70+)</div>
            </div>

            <div style={{
              padding: '15px',
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#ffc107' }}>
                {Math.max(...scanResults.map(r => r.score))}
              </div>
              <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Top Score</div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {scanResults.length === 0 && !isScanningUniverse && (
        <div style={{
          marginTop: '30px',
          padding: '60px 20px',
          textAlign: 'center',
          background: 'rgba(138, 43, 226, 0.05)',
          border: '2px dashed rgba(138, 43, 226, 0.3)',
          borderRadius: '15px'
        }}>
          <div style={{ fontSize: '4em', marginBottom: '15px' }}>🔍</div>
          <h3 style={{ marginBottom: '10px' }}>No Scan Results Yet</h3>
          <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px' }}>
            Click "Scan NIFTY 500 Universe" to find the best intraday trading candidates!
          </p>
          <div style={{
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '10px',
            display: 'inline-block',
            textAlign: 'left'
          }}>
            <h4 style={{ marginBottom: '10px' }}>💡 Pro Tips:</h4>
            <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              <li>Run scanner between <strong>9:00-9:30 AM</strong> for pre-market analysis</li>
              <li>Lower minimum gap % to find more candidates</li>
              <li>Higher volume = better liquidity & tighter spreads</li>
              <li>Top 15 stocks are automatically loaded to screeners</li>
              <li>Scan takes ~2-3 minutes to analyze 200+ stocks</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
})
