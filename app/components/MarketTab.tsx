'use client'

import React, { memo, useState, useEffect, useCallback } from 'react'
import { useMarketStore } from '@/lib/stores/market-store'

interface MacroData {
  usMarket: { sp500: number; sp500Change: number; dow: number; dowChange: number; nasdaq: number; nasdaqChange: number; direction: string }
  commodities: { crudePrice: number; crudeChange: number; crudeLabel?: string; wtiPrice?: number; wtiChange?: number; brentPrice?: number; brentChange?: number; goldPrice: number; goldChange: number }
  currency: { usdInr: number; usdInrChange: number }
  volatility: { indiaVix: number; vixTrend: string }
  asianMarkets: { nikkeiChange: number; hangSengChange: number; direction: string }
  yields: { us10y: number; us10yChange: number }
  overallSentiment: string
  sentimentScore: number
  sectorImpacts: Record<string, number>
  timestamp: string
  sentimentEmoji?: string
}

export default memo(function MarketTab() {
  const {
    marketDashboard,
    setMarketDashboard,
    isFetchingMarketDashboard,
    setIsFetchingMarketDashboard,
  } = useMarketStore()

  // Global Macro state
  const [macro, setMacro] = useState<MacroData | null>(null)
  const [macroLoading, setMacroLoading] = useState(false)
  const [showMacro, setShowMacro] = useState(false)

  const fetchMacro = useCallback(async () => {
    setMacroLoading(true)
    try {
      const res = await fetch('/api/market/global')
      const data = await res.json()
      if (data.success && data.macro) setMacro(data.macro)
    } catch { /* ignore */ }
    finally { setMacroLoading(false) }
  }, [])

  async function fetchMarketDashboard() {
    setIsFetchingMarketDashboard(true)
    setMarketDashboard(null)
    try {
      const response = await fetch('/api/market/dashboard')
      if (!response.ok) throw new Error('Failed to fetch market dashboard')
      const result = await response.json()
      if (result.success && result.data) {
        setMarketDashboard(result.data)
      }
    } catch (error: any) {
      console.error('Error fetching market dashboard:', error)
      alert(`Failed to fetch market dashboard: ${error.message}`)
    } finally {
      setIsFetchingMarketDashboard(false)
    }
  }

  const mn = marketDashboard?.morningNote
  const sentiment = marketDashboard?.marketSentiment

  // Color helpers
  const sentimentColor = (s: string) =>
    s?.includes('BULLISH') ? '#00ff64' : s?.includes('BEARISH') ? '#ff0064' : '#ffc107'
  const changeColor = (v: number) => v >= 0 ? '#00ff64' : '#ff0064'
  const callColor = (c: string) =>
    c === 'BUY' ? '#00ff64' : c === 'TACTICAL' ? '#4ade80' : c === 'CAUTIOUS' ? '#ffc107' : '#ff0064'
  const riskBadgeColor = (r: string) =>
    r === 'EXTREME' ? '#ff0064' : r === 'HIGH' ? '#f97316' : r === 'MODERATE' ? '#ffc107' : '#00ff64'

  return (
    <div>
      {/* Header */}
      <div className="screener-results" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '2em' }}>India Equity Morning Note</h3>
            <p style={{ margin: 0, opacity: 0.8 }}>
              Multi-source market intelligence — Regime, Macro, FII/DII, Geopolitics, Sectors
            </p>
          </div>
          <button
            onClick={fetchMarketDashboard}
            disabled={isFetchingMarketDashboard}
            style={{
              padding: '12px 30px', fontSize: '16px', fontWeight: 'bold',
              background: isFetchingMarketDashboard ? 'rgba(255,255,255,0.2)' : 'linear-gradient(45deg, #667eea, #764ba2)',
              cursor: isFetchingMarketDashboard ? 'not-allowed' : 'pointer',
            }}
          >
            {isFetchingMarketDashboard ? 'Loading...' : 'Refresh Dashboard'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isFetchingMarketDashboard && (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(102,126,234,0.1)', borderRadius: '15px', border: '2px solid rgba(102,126,234,0.3)' }}>
          <div style={{ fontSize: '4em', marginBottom: '20px' }}>📊</div>
          <h3>Fetching Market Intelligence...</h3>
          <p style={{ opacity: 0.7, marginTop: '10px' }}>
            Loading indices, macro, regime, FII/DII, geopolitics, sectors
          </p>
        </div>
      )}

      {/* Dashboard Content */}
      {marketDashboard && sentiment && !isFetchingMarketDashboard && (
        <div>

          {/* ═══ Section 1: Sentiment + Market Snapshot ═══ */}
          <div style={{
            marginBottom: '25px', padding: '30px',
            background: `linear-gradient(135deg, ${sentimentColor(sentiment.overall)}15, rgba(0,0,0,0.1))`,
            border: `3px solid ${sentimentColor(sentiment.overall)}`,
            borderRadius: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '2.5em', color: sentimentColor(sentiment.overall) }}>
                    {sentiment.overall?.replace('_', ' ')}
                  </h2>
                  {mn?.marketSnapshot?.regime && (
                    <span style={{
                      padding: '6px 14px', borderRadius: '8px', fontSize: '0.9em', fontWeight: 'bold',
                      background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)',
                    }}>
                      Regime: {mn.marketSnapshot.regime.label.replace('_', ' ')} ({mn.marketSnapshot.regime.confidence}%)
                    </span>
                  )}
                  {mn?.marketSnapshot?.vix && (
                    <span style={{
                      padding: '6px 14px', borderRadius: '8px', fontSize: '0.9em', fontWeight: 'bold',
                      background: `${riskBadgeColor(mn.marketSnapshot.vix.riskLevel)}20`,
                      border: `1px solid ${riskBadgeColor(mn.marketSnapshot.vix.riskLevel)}`,
                      color: riskBadgeColor(mn.marketSnapshot.vix.riskLevel),
                    }}>
                      VIX: {mn.marketSnapshot.vix.value.toFixed(1)} ({mn.marketSnapshot.vix.riskLevel})
                    </span>
                  )}
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '1.05em', opacity: 0.9 }}>
                  {sentiment.recommendation}
                </p>
                {/* Override warnings */}
                {sentiment.signals && sentiment.signals.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    {sentiment.signals.map((s: string, i: number) => (
                      <div key={i} style={{ padding: '6px 12px', marginTop: '6px', background: 'rgba(255,0,100,0.15)', border: '1px solid rgba(255,0,100,0.4)', borderRadius: '6px', fontSize: '0.9em', color: '#ff6b9d' }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: '30px', background: 'rgba(255,255,255,0.08)', borderRadius: '15px', textAlign: 'center', minWidth: '150px' }}>
                <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '8px' }}>SENTIMENT SCORE</div>
                <div style={{ fontSize: '3.5em', fontWeight: 'bold', color: sentimentColor(sentiment.overall) }}>
                  {sentiment.score}
                </div>
                <div style={{ fontSize: '0.9em', opacity: 0.7 }}>out of 100</div>
              </div>
            </div>

            {/* Macro strip */}
            {mn && (mn.marketSnapshot?.crude || mn.marketSnapshot?.usdInr || mn.marketSnapshot?.gold) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                {mn.marketSnapshot.crude && (
                  <MacroChip label={`Crude (${mn.marketSnapshot.crude.label})`} value={`$${mn.marketSnapshot.crude.price.toFixed(1)}`} change={mn.marketSnapshot.crude.change} />
                )}
                {mn.marketSnapshot.usdInr && (
                  <MacroChip label="USD/INR" value={mn.marketSnapshot.usdInr.rate.toFixed(2)} change={mn.marketSnapshot.usdInr.change} />
                )}
                {mn.marketSnapshot.gold && (
                  <MacroChip label="Gold" value={`$${mn.marketSnapshot.gold.price.toFixed(0)}`} change={mn.marketSnapshot.gold.change} />
                )}
                {mn.fxCommodities?.usMarkets && (
                  <MacroChip label="S&P 500" value={mn.fxCommodities.usMarkets.direction} change={mn.fxCommodities.usMarkets.sp500Change} />
                )}
              </div>
            )}
          </div>

          {/* ═══ Section 2: Key Drivers ═══ */}
          {mn?.keyDrivers && mn.keyDrivers.drivers.length > 0 && mn.keyDrivers.drivers[0] !== 'No significant drivers detected' && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Key Events & Drivers</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mn.keyDrivers.drivers.map((d: string, i: number) => (
                  <div key={i} style={{ padding: '10px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '3px solid #667eea', fontSize: '0.95em' }}>
                    {d}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.8em', opacity: 0.5 }}>Source: {mn.keyDrivers.source}</div>
            </div>
          )}

          {/* ═══ Section 3: Geopolitical ═══ */}
          {mn?.geopolitical && mn.geopolitical.riskLevel !== 'LOW' && (
            <div className="screener-results" style={{ marginBottom: '25px', borderLeft: `4px solid ${riskBadgeColor(mn.geopolitical.riskLevel)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, fontSize: '1.3em' }}>Geopolitical & Macro Situation</h4>
                <span style={{ padding: '4px 12px', background: `${riskBadgeColor(mn.geopolitical.riskLevel)}20`, border: `1px solid ${riskBadgeColor(mn.geopolitical.riskLevel)}`, borderRadius: '6px', fontSize: '0.85em', fontWeight: 'bold', color: riskBadgeColor(mn.geopolitical.riskLevel) }}>
                  {mn.geopolitical.riskLevel} RISK
                </span>
              </div>
              <p style={{ margin: '0 0 15px 0', opacity: 0.9 }}>{mn.geopolitical.summary}</p>
              {mn.geopolitical.events.map((e: any, i: number) => (
                <div key={i} style={{ padding: '10px 15px', marginBottom: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.8em', opacity: 0.6, marginRight: '8px' }}>[{e.type}]</span>
                    <span>{e.title}</span>
                  </div>
                  <span style={{ fontSize: '0.85em', color: e.sentimentImpact < 0 ? '#ff6b6b' : '#6bff6b' }}>
                    Impact: {e.sentimentImpact > 0 ? '+' : ''}{e.sentimentImpact}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ═══ Section 4: FII/DII Institutional Flows ═══ */}
          {mn?.institutionalFlows && mn.institutionalFlows.signal && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Institutional Flows (FII/DII)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                {mn.institutionalFlows.fiiNet !== null && (
                  <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${mn.institutionalFlows.fiiNet >= 0 ? '#00ff64' : '#ff0064'}` }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>FII Net Today</div>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', color: changeColor(mn.institutionalFlows.fiiNet) }}>
                      {mn.institutionalFlows.fiiNet >= 0 ? '+' : ''}{mn.institutionalFlows.fiiNet.toLocaleString()} Cr
                    </div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                      Trend: {mn.institutionalFlows.fiiTrend} ({mn.institutionalFlows.fiiConsecutiveDays}d)
                    </div>
                  </div>
                )}
                {mn.institutionalFlows.diiNet !== null && (
                  <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${mn.institutionalFlows.diiNet >= 0 ? '#00ff64' : '#ff0064'}` }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>DII Net Today</div>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', color: changeColor(mn.institutionalFlows.diiNet) }}>
                      {mn.institutionalFlows.diiNet >= 0 ? '+' : ''}{mn.institutionalFlows.diiNet.toLocaleString()} Cr
                    </div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                      Trend: {mn.institutionalFlows.diiTrend} ({mn.institutionalFlows.diiConsecutiveDays}d)
                    </div>
                  </div>
                )}
                <div className="card" style={{ padding: '20px' }}>
                  <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Smart Money Signal</div>
                  <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: sentimentColor(mn.institutionalFlows.signal || ''), marginTop: '5px' }}>
                    {mn.institutionalFlows.signal?.replace('_', ' ')}
                  </div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                    Confidence: {mn.institutionalFlows.confidence}%
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, opacity: 0.85, fontSize: '0.95em' }}>{mn.institutionalFlows.summary}</p>
            </div>
          )}

          {/* ═══ Section 5: Sector Calls ═══ */}
          {mn?.sectorCalls && mn.sectorCalls.calls.length > 0 && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Sector Calls</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {mn.sectorCalls.calls.map((c: any, i: number) => (
                  <div key={i} className="card" style={{ padding: '15px', borderLeft: `4px solid ${callColor(c.call)}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{c.sector}</span>
                      <span style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '0.8em', fontWeight: 'bold',
                        background: `${callColor(c.call)}20`, color: callColor(c.call), border: `1px solid ${callColor(c.call)}`,
                      }}>
                        {c.call}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: changeColor(c.change), marginBottom: '5px' }}>
                      {c.change >= 0 ? '+' : ''}{c.change.toFixed(2)}%
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.8 }}>{c.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Section 6: Technical Levels ═══ */}
          {mn?.technicalLevels && (mn.technicalLevels.nifty || mn.technicalLevels.bankNifty) && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Technical Levels</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                {mn.technicalLevels.nifty && (
                  <LevelsCard title="NIFTY" supports={mn.technicalLevels.nifty.supports} resistances={mn.technicalLevels.nifty.resistances} />
                )}
                {mn.technicalLevels.bankNifty && (
                  <LevelsCard title="BANK NIFTY" supports={mn.technicalLevels.bankNifty.supports} resistances={mn.technicalLevels.bankNifty.resistances} />
                )}
              </div>
            </div>
          )}

          {/* ═══ Section 7: Risk Scenarios ═══ */}
          {mn?.riskScenarios && mn.riskScenarios.length > 0 && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Risk Scenarios</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                {mn.riskScenarios.map((s: any, i: number) => {
                  const scColor = s.label === 'Bull' ? '#00ff64' : s.label === 'Bear' ? '#ff0064' : '#ffc107'
                  return (
                    <div key={i} className="card" style={{ padding: '20px', borderTop: `4px solid ${scColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: scColor, fontSize: '1.3em' }}>
                          {s.label === 'Bull' ? 'Bull Case' : s.label === 'Bear' ? 'Bear Case' : 'Base Case'}
                        </h4>
                        <div style={{ padding: '8px 16px', borderRadius: '20px', background: `${scColor}20`, border: `2px solid ${scColor}`, fontWeight: 'bold', fontSize: '1.2em', color: scColor }}>
                          {s.probability}%
                        </div>
                      </div>
                      <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '12px' }}>
                        NIFTY Target: {s.niftyTarget}
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Triggers:</div>
                        {s.triggers.map((t: string, j: number) => (
                          <div key={j} style={{ fontSize: '0.9em', padding: '4px 0', opacity: 0.9 }}>- {t}</div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Sector Impact:</div>
                        {s.sectorImplications.map((si: string, j: number) => (
                          <div key={j} style={{ fontSize: '0.85em', padding: '3px 0', opacity: 0.8 }}>- {si}</div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ Section 8: Playbook ═══ */}
          {mn?.playbook && (mn.playbook.dos.length > 0 || mn.playbook.donts.length > 0) && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Today's Playbook</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                <div style={{ padding: '20px', background: 'rgba(0,255,100,0.08)', borderRadius: '12px', border: '1px solid rgba(0,255,100,0.3)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#00ff64' }}>DO's</h4>
                  {mn.playbook.dos.map((d: string, i: number) => (
                    <div key={i} style={{ padding: '8px 12px', marginBottom: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.95em', borderLeft: '3px solid #00ff64' }}>
                      {d}
                    </div>
                  ))}
                </div>
                <div style={{ padding: '20px', background: 'rgba(255,0,100,0.08)', borderRadius: '12px', border: '1px solid rgba(255,0,100,0.3)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#ff0064' }}>DON'Ts</h4>
                  {mn.playbook.donts.map((d: string, i: number) => (
                    <div key={i} style={{ padding: '8px 12px', marginBottom: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.95em', borderLeft: '3px solid #ff0064' }}>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ Global Macro Intelligence (merged from Global tab) ═══ */}
          <div className="screener-results" style={{ marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => { setShowMacro(!showMacro); if (!macro && !macroLoading) fetchMacro() }}
            >
              <h4 style={{ margin: 0, fontSize: '1.3em' }}>🌍 Global Macro Intelligence</h4>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {macro && (
                  <span style={{
                    padding: '4px 12px', borderRadius: '6px', fontSize: '0.8em', fontWeight: 'bold',
                    background: macro.overallSentiment.includes('RISK_ON') ? 'rgba(0,255,100,0.15)' : macro.overallSentiment.includes('RISK_OFF') ? 'rgba(255,0,100,0.15)' : 'rgba(255,255,255,0.1)',
                    color: macro.overallSentiment.includes('RISK_ON') ? '#00ff64' : macro.overallSentiment.includes('RISK_OFF') ? '#ff0064' : '#ffc107',
                  }}>
                    {macro.overallSentiment.replace(/_/g, ' ')} ({macro.sentimentScore > 0 ? '+' : ''}{macro.sentimentScore})
                  </span>
                )}
                <span style={{ fontSize: '0.9em', opacity: 0.6 }}>{showMacro ? '▲' : '▼'}</span>
              </div>
            </div>

            {showMacro && macroLoading && !macro && (
              <div style={{ padding: '30px', textAlign: 'center', opacity: 0.6 }}>Loading global data...</div>
            )}

            {showMacro && macro && (
              <div style={{ marginTop: '15px' }}>
                {/* Market cards grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                  <GlobalCard emoji="🇺🇸" label="S&P 500" value={macro.usMarket.sp500.toLocaleString(undefined, { maximumFractionDigits: 0 })} change={macro.usMarket.sp500Change} />
                  <GlobalCard emoji="💻" label="Nasdaq" value={macro.usMarket.nasdaq.toLocaleString(undefined, { maximumFractionDigits: 0 })} change={macro.usMarket.nasdaqChange} />
                  <GlobalCard emoji="🏭" label="Dow Jones" value={macro.usMarket.dow.toLocaleString(undefined, { maximumFractionDigits: 0 })} change={macro.usMarket.dowChange} />
                  <GlobalCard emoji="🛢️" label={`Crude (${macro.commodities.crudeLabel || 'Brent'})`} value={`$${macro.commodities.crudePrice.toFixed(2)}`} change={macro.commodities.crudeChange} />
                  <GlobalCard emoji="🥇" label="Gold" value={`$${macro.commodities.goldPrice.toFixed(0)}`} change={macro.commodities.goldChange} />
                  <GlobalCard emoji="💱" label="USD/INR" value={`₹${macro.currency.usdInr.toFixed(2)}`} change={macro.currency.usdInrChange} />
                  <GlobalCard emoji="🌊" label="India VIX" value={macro.volatility.indiaVix.toFixed(2)} change={0} subtitle={macro.volatility.vixTrend} />
                  <GlobalCard emoji="🇯🇵" label="Nikkei" value={`${macro.asianMarkets.nikkeiChange >= 0 ? '+' : ''}${macro.asianMarkets.nikkeiChange.toFixed(2)}%`} change={macro.asianMarkets.nikkeiChange} />
                  <GlobalCard emoji="🇭🇰" label="Hang Seng" value={`${macro.asianMarkets.hangSengChange >= 0 ? '+' : ''}${macro.asianMarkets.hangSengChange.toFixed(2)}%`} change={macro.asianMarkets.hangSengChange} />
                  <GlobalCard emoji="🏛️" label="US 10Y Yield" value={`${macro.yields.us10y.toFixed(2)}%`} change={macro.yields.us10yChange} />
                </div>

                {/* Sector Impact Heatmap */}
                {macro.sectorImpacts && Object.keys(macro.sectorImpacts).length > 0 && (
                  <div style={{ padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '0.9em', fontWeight: 600, marginBottom: '10px', opacity: 0.8 }}>Macro Impact by Sector</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                      {Object.entries(macro.sectorImpacts).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([sector, impact]) => (
                        <div key={sector} style={{
                          padding: '8px', borderRadius: '8px', textAlign: 'center',
                          background: impact > 10 ? 'rgba(0,255,100,0.08)' : impact < -10 ? 'rgba(255,0,100,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${impact > 10 ? 'rgba(0,255,100,0.2)' : impact < -10 ? 'rgba(255,0,100,0.2)' : 'rgba(255,255,255,0.08)'}`,
                        }}>
                          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>{sector}</div>
                          <div style={{ fontSize: '1.1em', fontWeight: 700, color: impact > 10 ? '#00ff64' : impact < -10 ? '#ff0064' : '#ffc107' }}>
                            {impact > 0 ? '+' : ''}{impact}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key takeaways */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Math.abs(macro.usMarket.sp500Change) > 1 && (
                    <div style={{ padding: '8px 12px', borderRadius: '6px', background: macro.usMarket.sp500Change > 0 ? 'rgba(0,255,100,0.05)' : 'rgba(255,0,100,0.05)', borderLeft: `3px solid ${macro.usMarket.sp500Change > 0 ? '#00ff64' : '#ff0064'}`, fontSize: '0.88em' }}>
                      🇺🇸 US markets {macro.usMarket.sp500Change > 0 ? 'up' : 'down'} {Math.abs(macro.usMarket.sp500Change).toFixed(1)}% — {macro.usMarket.sp500Change > 1 ? 'Positive FII sentiment likely' : 'Expect FII selling pressure'}
                    </div>
                  )}
                  {Math.abs(macro.commodities.crudeChange) > 2 && (
                    <div style={{ padding: '8px 12px', borderRadius: '6px', background: macro.commodities.crudeChange > 0 ? 'rgba(255,0,100,0.05)' : 'rgba(0,255,100,0.05)', borderLeft: `3px solid ${macro.commodities.crudeChange > 0 ? '#ff0064' : '#00ff64'}`, fontSize: '0.88em' }}>
                      🛢️ Crude {macro.commodities.crudeChange > 0 ? 'up' : 'down'} {Math.abs(macro.commodities.crudeChange).toFixed(1)}% — {macro.commodities.crudeChange > 0 ? 'Negative for OMCs, airlines' : 'Positive for OMCs, airlines'}
                    </div>
                  )}
                  {macro.volatility.indiaVix > 20 && (
                    <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,165,0,0.05)', borderLeft: '3px solid #F97316', fontSize: '0.88em' }}>
                      🌊 VIX at {macro.volatility.indiaVix.toFixed(1)} — {macro.volatility.indiaVix > 25 ? 'Extreme volatility! Reduce position sizes.' : 'Elevated. Consider smaller positions.'}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '10px', textAlign: 'right' }}>
                  <button onClick={() => fetchMacro()} disabled={macroLoading}
                    style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '0.8em' }}>
                    {macroLoading ? '⏳ Loading...' : '🔄 Refresh Macro'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Indices Grid ═══ */}
          {marketDashboard.indices && marketDashboard.indices.length > 0 && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px' }}>Indices</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                {marketDashboard.indices.map((index: any, idx: number) => (
                  <div key={idx} className="card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px', opacity: 0.9 }}>{index.name}</div>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', marginBottom: '5px' }}>{index.current.toFixed(2)}</div>
                    <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: changeColor(index.changePercent), marginBottom: '10px' }}>
                      {index.changePercent >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: '0.85em', opacity: 0.6, lineHeight: '1.6' }}>
                      <div>H: {index.high.toFixed(2)} | L: {index.low.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Market Breadth ═══ */}
          {marketDashboard.marketBreadth && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px' }}>Market Breadth (NIFTY 50)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div className="card" style={{ padding: '20px', background: 'rgba(0,255,100,0.1)', border: '2px solid rgba(0,255,100,0.3)' }}>
                  <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>Advancers</div>
                  <div style={{ fontSize: '3em', fontWeight: 'bold', color: '#00ff64' }}>{marketDashboard.marketBreadth.advancers}</div>
                </div>
                <div className="card" style={{ padding: '20px', background: 'rgba(255,0,100,0.1)', border: '2px solid rgba(255,0,100,0.3)' }}>
                  <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>Decliners</div>
                  <div style={{ fontSize: '3em', fontWeight: 'bold', color: '#ff0064' }}>{marketDashboard.marketBreadth.decliners}</div>
                </div>
                <div className="card" style={{ padding: '20px' }}>
                  <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '5px' }}>A/D Ratio</div>
                  <div style={{ fontSize: '3em', fontWeight: 'bold' }}>{marketDashboard.marketBreadth.advanceDeclineRatio.toFixed(2)}</div>
                  <div style={{ marginTop: '10px', padding: '5px 12px', background: `${sentimentColor(marketDashboard.marketBreadth.sentiment || '')}20`, borderRadius: '6px', fontSize: '0.85em', fontWeight: 'bold', textAlign: 'center' }}>
                    {(marketDashboard.marketBreadth.sentiment || '').replace('_', ' ')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Stock Spotlight ═══ */}
          {marketDashboard.stockSpotlight && marketDashboard.stockSpotlight.length > 0 && (
            <div className="screener-results" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', fontSize: '1.3em' }}>Stock Spotlight</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {marketDashboard.stockSpotlight.map((stock: any, idx: number) => {
                  const sigColor = stock.signal === 'STRONG_BUY' ? '#00ff64' : stock.signal === 'MOMENTUM_BUY' ? '#4ade80' : stock.signal === 'BUY' ? '#a3e635' : stock.signal === 'SHORT' ? '#ff0064' : stock.signal === 'SELL' ? '#f87171' : '#ffc107'
                  return (
                    <div key={idx} style={{ padding: '20px', background: `${sigColor}08`, border: `1px solid ${sigColor}30`, borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <h3 style={{ margin: 0, fontSize: '1.8em' }}>{stock.symbol}</h3>
                          <span style={{ padding: '4px 12px', background: `${sigColor}25`, border: `1px solid ${sigColor}`, borderRadius: '6px', fontSize: '0.85em', fontWeight: 'bold', color: sigColor }}>
                            {stock.signal.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{stock.sector}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '1.5em', fontWeight: 'bold' }}>Rs{stock.current.toFixed(2)}</span>
                          <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: changeColor(stock.changePercent), marginLeft: '10px' }}>
                            {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 10px 0', opacity: 0.9, lineHeight: '1.6' }}>{stock.analysis}</p>
                      <p style={{ margin: 0, fontSize: '0.9em', opacity: 0.8, padding: '10px', background: `${sigColor}10`, borderRadius: '8px' }}>
                        Strategy: {stock.recommendation}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ Top Gainers & Losers ═══ */}
          {marketDashboard.topGainers && marketDashboard.topLosers && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '25px' }}>
              <div className="screener-results">
                <h4 style={{ marginBottom: '15px' }}>Top Gainers</h4>
                <table className="screener-table">
                  <thead><tr><th>Symbol</th><th>Price</th><th>Change</th><th>Volume</th></tr></thead>
                  <tbody>
                    {marketDashboard.topGainers.slice(0, 5).map((stock: any, idx: number) => (
                      <tr key={idx}>
                        <td><strong>{stock.symbol}</strong></td>
                        <td>Rs{stock.current.toFixed(2)}</td>
                        <td className="positive">+{stock.changePercent.toFixed(2)}%</td>
                        <td>{(stock.volume / 100000).toFixed(1)}L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="screener-results">
                <h4 style={{ marginBottom: '15px' }}>Top Losers</h4>
                <table className="screener-table">
                  <thead><tr><th>Symbol</th><th>Price</th><th>Change</th><th>Volume</th></tr></thead>
                  <tbody>
                    {marketDashboard.topLosers.slice(0, 5).map((stock: any, idx: number) => (
                      <tr key={idx}>
                        <td><strong>{stock.symbol}</strong></td>
                        <td>Rs{stock.current.toFixed(2)}</td>
                        <td className="negative">{stock.changePercent.toFixed(2)}%</td>
                        <td>{(stock.volume / 100000).toFixed(1)}L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px', textAlign: 'center', opacity: 0.6, fontSize: '0.9em' }}>
            Last updated: {new Date(marketDashboard.timestamp).toLocaleString()}
            {mn?.generatedAt && ` | Note generated: ${new Date(mn.generatedAt).toLocaleTimeString()}`}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!marketDashboard && !isFetchingMarketDashboard && (
        <div style={{ marginTop: '30px', padding: '60px 20px', textAlign: 'center', background: 'rgba(102,126,234,0.05)', border: '2px dashed rgba(102,126,234,0.3)', borderRadius: '15px' }}>
          <div style={{ fontSize: '4em', marginBottom: '15px' }}>📋</div>
          <h3 style={{ marginBottom: '10px' }}>Morning Note Ready</h3>
          <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px' }}>
            Click "Refresh Dashboard" to generate your India Equity Morning Note
          </p>
          <div style={{ padding: '20px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', display: 'inline-block', textAlign: 'left' }}>
            <h4 style={{ marginBottom: '10px' }}>What You'll Get:</h4>
            <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              <li>Market Snapshot — Indices, VIX, Crude, USD/INR, Gold, Regime</li>
              <li>Key Drivers — News, geopolitics, macro events</li>
              <li>FII/DII Flows — Institutional buying/selling trends</li>
              <li>Sector Calls — BUY / TACTICAL / CAUTIOUS / AVOID per sector</li>
              <li>Technical Levels — NIFTY & Bank NIFTY support/resistance</li>
              <li>Risk Scenarios — Bull/Base/Bear with probabilities</li>
              <li>Playbook — Do's and Don'ts for today</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Sub-components ──────────────────────────────────────────────────────────

function MacroChip({ label, value, change }: { label: string; value: string; change: number }) {
  return (
    <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{label}:</span>
      <span style={{ fontWeight: 'bold' }}>{value}</span>
      <span style={{ fontSize: '0.85em', color: change >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
      </span>
    </div>
  )
}

function GlobalCard({ emoji, label, value, change, subtitle }: { emoji: string; label: string; value: string; change: number; subtitle?: string }) {
  const color = change > 0.3 ? '#00ff64' : change < -0.3 ? '#ff0064' : 'rgba(255,255,255,0.7)'
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: '0.78em', opacity: 0.6, marginBottom: '6px' }}>{emoji} {label}</div>
      <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{value}</div>
      {change !== 0 && (
        <div style={{ fontSize: '0.85em', fontWeight: 600, color, marginTop: '2px' }}>
          {change > 0 ? '▲' : '▼'} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </div>
      )}
      {subtitle && <div style={{ fontSize: '0.75em', opacity: 0.5, marginTop: '3px' }}>{subtitle}</div>}
    </div>
  )
}

function LevelsCard({ title, supports, resistances }: { title: string; supports: any[]; resistances: any[] }) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <h4 style={{ margin: '0 0 15px 0', fontSize: '1.1em' }}>{title}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        <div>
          <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#00ff64', marginBottom: '8px' }}>SUPPORT</div>
          {supports.map((s: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9em' }}>
              <span style={{ opacity: 0.7 }}>{s.label}</span>
              <span style={{ fontWeight: 'bold' }}>{s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#ff6b6b', marginBottom: '8px' }}>RESISTANCE</div>
          {resistances.map((r: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9em' }}>
              <span style={{ opacity: 0.7 }}>{r.label}</span>
              <span style={{ fontWeight: 'bold' }}>{r.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
