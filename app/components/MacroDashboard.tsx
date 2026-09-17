'use client'

import React, { useState, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface MacroSnapshot {
  usMarket: {
    sp500: number; sp500Change: number
    dow: number; dowChange: number
    nasdaq: number; nasdaqChange: number
    direction: string
  }
  commodities: {
    crudePrice: number; crudeChange: number
    crudeLabel?: 'Brent' | 'WTI'
    wtiPrice?: number; wtiChange?: number
    brentPrice?: number; brentChange?: number
    goldPrice: number; goldChange: number
  }
  currency: {
    usdInr: number; usdInrChange: number
  }
  volatility: {
    indiaVix: number; vixTrend: string
  }
  asianMarkets: {
    nikkeiChange: number
    hangSengChange: number
    direction: string
  }
  yields: {
    us10y: number; us10yChange: number
  }
  overallSentiment: string
  sentimentScore: number
  sectorImpacts: Record<string, number>
  timestamp: string
  sentimentEmoji?: string
}

interface GeopoliticalEvent {
  type: string
  title: string
  affectedRegions: string[]
  affectedSectors: string[]
  severity: string
  duration: string
  sentimentImpact: number
  confidence: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MacroDashboard() {
  const [macro, setMacro] = useState<MacroSnapshot | null>(null)
  const [geoEvents, setGeoEvents] = useState<GeopoliticalEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchMacroData = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true)
      setError(null)

      const url = `/api/market/global${forceRefresh ? '?forceRefresh=true' : ''}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.success && data.macro) {
        setMacro(data.macro)
        setLastUpdate(new Date())
      } else {
        setError(data.error || 'Failed to fetch macro data')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMacroData()
  }, [fetchMacroData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => fetchMacroData(), 2 * 60 * 1000) // 2 min (matches backend cache)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchMacroData])

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}%`
  }

  const getChangeColor = (change: number) => {
    if (change > 0.5) return '#00ff64'
    if (change < -0.5) return '#ff0064'
    return 'rgba(255, 255, 255, 0.7)'
  }

  const getChangeArrow = (change: number) => {
    if (change > 0.3) return '▲'
    if (change < -0.3) return '▼'
    return '▬'
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'STRONGLY_RISK_ON': return '#00ff64'
      case 'RISK_ON': return '#10B981'
      case 'NEUTRAL': return '#FCD34D'
      case 'RISK_OFF': return '#F97316'
      case 'STRONGLY_RISK_OFF': return '#ff0064'
      default: return '#888'
    }
  }

  const getSentimentLabel = (sentiment: string) => {
    switch (sentiment) {
      case 'STRONGLY_RISK_ON': return 'Strongly Risk-On'
      case 'RISK_ON': return 'Risk-On'
      case 'NEUTRAL': return 'Neutral'
      case 'RISK_OFF': return 'Risk-Off'
      case 'STRONGLY_RISK_OFF': return 'Strongly Risk-Off'
      default: return sentiment
    }
  }

  const getVixColor = (vix: number) => {
    if (vix > 25) return '#ff0064'
    if (vix > 20) return '#F97316'
    if (vix > 15) return '#FCD34D'
    return '#00ff64'
  }

  const getVixLabel = (vix: number) => {
    if (vix > 25) return 'Extreme Fear'
    if (vix > 20) return 'Elevated'
    if (vix > 15) return 'Normal'
    return 'Low / Complacent'
  }

  // ============================================================================
  // CARD COMPONENT
  // ============================================================================

  const MacroCard = ({
    title,
    emoji,
    value,
    change,
    subtitle,
    extra,
  }: {
    title: string
    emoji: string
    value: string
    change: number
    subtitle?: string
    extra?: React.ReactNode
  }) => (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(10px)',
      borderRadius: '15px',
      padding: '20px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
          {emoji} {title}
        </div>
        <div style={{
          fontSize: '0.85em',
          fontWeight: 600,
          color: getChangeColor(change),
          padding: '2px 8px',
          borderRadius: '8px',
          background: change > 0 ? 'rgba(0, 255, 100, 0.1)' : change < 0 ? 'rgba(255, 0, 100, 0.1)' : 'rgba(255, 255, 255, 0.05)',
        }}>
          {getChangeArrow(change)} {formatChange(change)}
        </div>
      </div>
      <div style={{ fontSize: '1.6em', fontWeight: 700, marginBottom: '4px', color: '#fff' }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}
      {extra}
    </div>
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h2 style={{ fontSize: '1.8em', margin: '0 0 6px 0', fontWeight: 700 }}>
              🌍 Global Macro Intelligence
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: 0, fontSize: '0.9em' }}>
              Real-time global indicators that impact Indian markets
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {lastUpdate && (
              <span style={{ fontSize: '0.8em', color: (Date.now() - lastUpdate.getTime() > 3 * 60 * 1000) ? '#F97316' : 'rgba(255, 255, 255, 0.4)' }}>
                {(Date.now() - lastUpdate.getTime() > 3 * 60 * 1000) ? '⚠️ ' : ''}Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <label style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.5)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={() => setAutoRefresh(!autoRefresh)}
                style={{ cursor: 'pointer' }}
              />
              Auto-refresh
            </label>
            <button
              onClick={() => fetchMacroData(true)}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.85em',
                transition: 'all 0.2s ease',
              }}
            >
              {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(255, 0, 100, 0.1)',
          border: '1px solid rgba(255, 0, 100, 0.3)',
          borderRadius: '10px',
          padding: '15px',
          marginBottom: '20px',
          color: '#ff6b9d',
        }}>
          ❌ {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && !macro && (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '1.1em',
        }}>
          ⏳ Fetching global market data...
        </div>
      )}

      {macro && (
        <>
          {/* Overall Sentiment Banner */}
          <div style={{
            background: `linear-gradient(135deg, ${getSentimentColor(macro.overallSentiment)}15, ${getSentimentColor(macro.overallSentiment)}08)`,
            border: `1px solid ${getSentimentColor(macro.overallSentiment)}40`,
            borderRadius: '15px',
            padding: '20px 25px',
            marginBottom: '25px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '15px',
          }}>
            <div>
              <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                OVERALL MACRO SENTIMENT
              </div>
              <div style={{ fontSize: '1.5em', fontWeight: 700, color: getSentimentColor(macro.overallSentiment) }}>
                {macro.sentimentEmoji || '📊'} {getSentimentLabel(macro.overallSentiment)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                SENTIMENT SCORE
              </div>
              <div style={{
                fontSize: '2em',
                fontWeight: 800,
                color: getSentimentColor(macro.overallSentiment),
              }}>
                {macro.sentimentScore > 0 ? '+' : ''}{macro.sentimentScore}
              </div>
            </div>
          </div>

          {/* Main Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '15px',
            marginBottom: '25px',
          }}>
            {/* US Markets */}
            <MacroCard
              title="S&P 500"
              emoji="🇺🇸"
              value={macro.usMarket.sp500.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              change={macro.usMarket.sp500Change}
              subtitle={`US market ${macro.usMarket.direction.replace('_', ' ').toLowerCase()}`}
            />

            <MacroCard
              title="Nasdaq"
              emoji="💻"
              value={macro.usMarket.nasdaq.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              change={macro.usMarket.nasdaqChange}
              subtitle="Tech-heavy index"
            />

            <MacroCard
              title="Dow Jones"
              emoji="🏭"
              value={macro.usMarket.dow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              change={macro.usMarket.dowChange}
              subtitle="Blue-chip industrials"
            />

            {/* Commodities */}
            <MacroCard
              title={`Crude Oil (${macro.commodities.crudeLabel || 'Brent'})`}
              emoji="🛢️"
              value={`$${macro.commodities.crudePrice.toFixed(2)}`}
              change={macro.commodities.crudeChange}
              subtitle={Math.abs(macro.commodities.crudeChange) > 3 ? '⚠️ Significant move — impacts OMCs, airlines, paints' : 'India imports 85% of crude oil'}
              extra={macro.commodities.crudeLabel === 'Brent' && macro.commodities.wtiPrice ? (
                <div style={{ marginTop: '6px', fontSize: '0.78em', color: 'rgba(255, 255, 255, 0.4)' }}>
                  WTI: ${macro.commodities.wtiPrice.toFixed(2)} ({macro.commodities.wtiChange && macro.commodities.wtiChange >= 0 ? '+' : ''}{(macro.commodities.wtiChange || 0).toFixed(2)}%)
                </div>
              ) : undefined}
            />

            <MacroCard
              title="Gold"
              emoji="🥇"
              value={`$${macro.commodities.goldPrice.toFixed(0)}`}
              change={macro.commodities.goldChange}
              subtitle={macro.commodities.goldChange > 1 ? 'Safe-haven demand rising' : 'Precious metals'}
            />

            {/* Currency */}
            <MacroCard
              title="USD/INR"
              emoji="💱"
              value={`₹${macro.currency.usdInr.toFixed(2)}`}
              change={macro.currency.usdInrChange}
              subtitle={macro.currency.usdInrChange > 0.2 ? '⚠️ Rupee weakening — positive for IT, negative for importers' : macro.currency.usdInrChange < -0.2 ? 'Rupee strengthening — negative for exporters' : 'Currency stability'}
              extra={
                <div style={{ marginTop: '8px', fontSize: '0.78em', color: 'rgba(255, 255, 255, 0.4)' }}>
                  {macro.currency.usdInrChange > 0 ? '📈 IT/Pharma benefit' : '📉 Importers benefit'}
                </div>
              }
            />

            {/* Volatility */}
            <MacroCard
              title="India VIX"
              emoji="🌊"
              value={macro.volatility.indiaVix.toFixed(2)}
              change={0} // VIX doesn't have a % change in our data, show trend instead
              subtitle={`${getVixLabel(macro.volatility.indiaVix)} — Trend: ${macro.volatility.vixTrend}`}
              extra={
                <div style={{ marginTop: '10px' }}>
                  {/* VIX gauge bar */}
                  <div style={{
                    height: '6px',
                    borderRadius: '3px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (macro.volatility.indiaVix / 35) * 100)}%`,
                      borderRadius: '3px',
                      background: `linear-gradient(90deg, #00ff64, #FCD34D, #ff0064)`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.3)', marginTop: '3px' }}>
                    <span>Low (10)</span>
                    <span>High (35)</span>
                  </div>
                </div>
              }
            />

            {/* Asian Markets */}
            <MacroCard
              title="Nikkei 225"
              emoji="🇯🇵"
              value={formatChange(macro.asianMarkets.nikkeiChange)}
              change={macro.asianMarkets.nikkeiChange}
              subtitle="Japan — Asian market sentiment"
            />

            <MacroCard
              title="Hang Seng"
              emoji="🇭🇰"
              value={formatChange(macro.asianMarkets.hangSengChange)}
              change={macro.asianMarkets.hangSengChange}
              subtitle="Hong Kong — China proxy"
            />

            {/* Yields */}
            <MacroCard
              title="US 10Y Yield"
              emoji="🏛️"
              value={`${macro.yields.us10y.toFixed(2)}%`}
              change={macro.yields.us10yChange}
              subtitle={macro.yields.us10yChange > 0.05 ? '⚠️ Rising yields — FII may pull out' : 'Government bond yield'}
            />
          </div>

          {/* Sector Impact Heatmap */}
          {macro.sectorImpacts && Object.keys(macro.sectorImpacts).length > 0 && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '15px',
              padding: '20px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '25px',
            }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1em', fontWeight: 600 }}>
                📊 Macro Impact by Sector
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
              }}>
                {Object.entries(macro.sectorImpacts)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .map(([sector, impact]) => {
                    const absImpact = Math.abs(impact)
                    const color = impact > 10 ? '#00ff64' : impact < -10 ? '#ff0064' : '#FCD34D'
                    const bg = impact > 10 ? 'rgba(0, 255, 100, 0.08)' : impact < -10 ? 'rgba(255, 0, 100, 0.08)' : 'rgba(255, 255, 255, 0.03)'

                    return (
                      <div key={sector} style={{
                        background: bg,
                        borderRadius: '10px',
                        padding: '12px',
                        textAlign: 'center',
                        border: `1px solid ${color}20`,
                      }}>
                        <div style={{ fontSize: '0.78em', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                          {sector}
                        </div>
                        <div style={{ fontSize: '1.2em', fontWeight: 700, color }}>
                          {impact > 0 ? '+' : ''}{impact}
                        </div>
                        <div style={{ fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.3)', marginTop: '2px' }}>
                          {absImpact > 30 ? 'Strong' : absImpact > 15 ? 'Moderate' : 'Mild'}
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div style={{ fontSize: '0.75em', color: 'rgba(255, 255, 255, 0.3)', marginTop: '12px', textAlign: 'center' }}>
                Score: -100 (very bearish) to +100 (very bullish) based on current macro conditions
              </div>
            </div>
          )}

          {/* Market Impact Summary */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '15px',
            padding: '20px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1em', fontWeight: 600 }}>
              ⚡ Key Takeaways for Indian Markets
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* US Markets */}
              {Math.abs(macro.usMarket.sp500Change) > 1 && (
                <div style={{
                  padding: '10px 15px',
                  borderRadius: '8px',
                  background: macro.usMarket.sp500Change > 0 ? 'rgba(0, 255, 100, 0.05)' : 'rgba(255, 0, 100, 0.05)',
                  borderLeft: `3px solid ${macro.usMarket.sp500Change > 0 ? '#00ff64' : '#ff0064'}`,
                  fontSize: '0.9em',
                }}>
                  🇺🇸 US markets {macro.usMarket.sp500Change > 0 ? 'up' : 'down'} {Math.abs(macro.usMarket.sp500Change).toFixed(1)}% — {macro.usMarket.sp500Change > 1 ? 'Positive FII sentiment likely' : macro.usMarket.sp500Change < -1 ? 'Expect FII selling pressure, negative gap-down risk' : ''}
                </div>
              )}

              {/* Crude Oil */}
              {Math.abs(macro.commodities.crudeChange) > 2 && (
                <div style={{
                  padding: '10px 15px',
                  borderRadius: '8px',
                  background: macro.commodities.crudeChange > 0 ? 'rgba(255, 0, 100, 0.05)' : 'rgba(0, 255, 100, 0.05)',
                  borderLeft: `3px solid ${macro.commodities.crudeChange > 0 ? '#ff0064' : '#00ff64'}`,
                  fontSize: '0.9em',
                }}>
                  🛢️ Crude oil {macro.commodities.crudeChange > 0 ? 'up' : 'down'} {Math.abs(macro.commodities.crudeChange).toFixed(1)}% at ${macro.commodities.crudePrice.toFixed(0)} — {macro.commodities.crudeChange > 0 ? 'Negative for OMCs, airlines, paints. Positive for ONGC.' : 'Positive for OMCs, airlines. Negative for ONGC.'}
                </div>
              )}

              {/* VIX */}
              {macro.volatility.indiaVix > 20 && (
                <div style={{
                  padding: '10px 15px',
                  borderRadius: '8px',
                  background: 'rgba(255, 165, 0, 0.05)',
                  borderLeft: '3px solid #F97316',
                  fontSize: '0.9em',
                }}>
                  🌊 India VIX at {macro.volatility.indiaVix.toFixed(1)} — {macro.volatility.indiaVix > 25 ? 'Extreme volatility! Reduce position sizes by 50%. Use wider stops.' : 'Elevated volatility. Consider smaller positions.'}
                </div>
              )}

              {/* USD/INR */}
              {Math.abs(macro.currency.usdInrChange) > 0.3 && (
                <div style={{
                  padding: '10px 15px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderLeft: '3px solid #4facfe',
                  fontSize: '0.9em',
                }}>
                  💱 Rupee {macro.currency.usdInrChange > 0 ? 'weakening' : 'strengthening'} ({macro.currency.usdInrChange > 0 ? '+' : ''}{macro.currency.usdInrChange.toFixed(2)}%) — {macro.currency.usdInrChange > 0 ? 'Positive for IT/Pharma exporters, negative for oil importers' : 'Negative for IT/Pharma, positive for importers'}
                </div>
              )}

              {/* Gold as safe haven */}
              {macro.commodities.goldChange > 2 && (
                <div style={{
                  padding: '10px 15px',
                  borderRadius: '8px',
                  background: 'rgba(252, 211, 77, 0.05)',
                  borderLeft: '3px solid #FCD34D',
                  fontSize: '0.9em',
                }}>
                  🥇 Gold rallying {macro.commodities.goldChange.toFixed(1)}% — Safe-haven demand signals risk aversion. Consider defensive stocks.
                </div>
              )}

              {/* Calm markets message */}
              {Math.abs(macro.usMarket.sp500Change) < 1 &&
               Math.abs(macro.commodities.crudeChange) < 2 &&
               macro.volatility.indiaVix < 20 &&
               Math.abs(macro.currency.usdInrChange) < 0.3 && (
                <div style={{
                  padding: '10px 15px',
                  borderRadius: '8px',
                  background: 'rgba(0, 255, 100, 0.05)',
                  borderLeft: '3px solid #00ff64',
                  fontSize: '0.9em',
                }}>
                  ✅ Markets calm — No major macro headwinds. Normal position sizing applies.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
