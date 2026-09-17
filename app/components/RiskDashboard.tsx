'use client'

import React, { useState, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface RiskState {
  circuitBreaker: {
    halt: boolean
    reasons: string[]
    triggers: {
      dailyLossExceeded: boolean
      drawdownExceeded: boolean
      consecutiveSLs: boolean
      highVix: boolean
    }
  }
  positionLimits: {
    currentPositions: number
    maxPositions: number
    regime: string
  }
  sectorConcentration: Record<string, number>
  portfolioDrawdown: number
  dailyPnL: number
  riskUtilization: number // 0-100%
}

interface MacroSnapshot {
  volatility: { indiaVix: number; vixTrend: string }
  overallSentiment: string
  sentimentScore: number
}

// ============================================================================
// COMPONENT
// ============================================================================

interface RiskDashboardProps {
  paperPositions: any[]
  capital?: number
}

export default function RiskDashboard({ paperPositions, capital = 300000 }: RiskDashboardProps) {
  const [macroData, setMacroData] = useState<MacroSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Calculate risk metrics from paper positions
  const calculateRiskMetrics = useCallback((): RiskState => {
    const openPositions = paperPositions.filter(p => p.status === 'open')

    // Sector concentration
    const sectorConcentration: Record<string, number> = {}
    let totalDeployed = 0

    for (const pos of openPositions) {
      const sector = pos.sector || 'Unknown'
      const value = (pos.quantity || 0) * (pos.currentPrice || pos.entryPrice || 0)
      sectorConcentration[sector] = (sectorConcentration[sector] || 0) + value
      totalDeployed += value
    }

    // Normalize to percentages
    if (totalDeployed > 0) {
      for (const sector in sectorConcentration) {
        sectorConcentration[sector] = (sectorConcentration[sector] / totalDeployed) * 100
      }
    }

    // Daily P&L
    const dailyPnL = openPositions.reduce((sum, pos) => {
      return sum + (pos.unrealizedPnL || 0)
    }, 0)

    // Portfolio drawdown (simplified - from peak capital)
    const currentValue = capital + dailyPnL
    const portfolioDrawdown = ((capital - currentValue) / capital) * 100

    // Determine regime from macro data
    const regime = macroData?.overallSentiment || 'NEUTRAL'
    const maxPositions = getMaxPositions(regime)

    // Circuit breaker check
    const vixLevel = macroData?.volatility?.indiaVix || 0
    const dailyLossPercent = (dailyPnL / capital) * 100

    const triggers = {
      dailyLossExceeded: dailyLossPercent < -5,
      drawdownExceeded: portfolioDrawdown > 10,
      consecutiveSLs: false, // Would need historical data
      highVix: vixLevel > 25,
    }

    const halt = triggers.dailyLossExceeded || triggers.drawdownExceeded

    const reasons: string[] = []
    if (triggers.dailyLossExceeded) reasons.push(`Daily loss ${dailyLossPercent.toFixed(1)}% exceeds 5% limit`)
    if (triggers.drawdownExceeded) reasons.push(`Portfolio drawdown ${portfolioDrawdown.toFixed(1)}% exceeds 10% limit`)
    if (triggers.highVix) reasons.push(`India VIX at ${vixLevel.toFixed(1)} — extreme volatility`)

    const riskUtilization = totalDeployed > 0 ? (totalDeployed / capital) * 100 : 0

    return {
      circuitBreaker: { halt, reasons, triggers },
      positionLimits: {
        currentPositions: openPositions.length,
        maxPositions,
        regime,
      },
      sectorConcentration,
      portfolioDrawdown: Math.max(0, portfolioDrawdown),
      dailyPnL,
      riskUtilization: Math.min(100, riskUtilization),
    }
  }, [paperPositions, capital, macroData])

  // Fetch macro data for VIX
  useEffect(() => {
    const fetchMacro = async () => {
      try {
        setIsLoading(true)
        const res = await fetch('/api/market/global')
        const data = await res.json()
        if (data.success && data.macro) {
          setMacroData(data.macro)
        }
      } catch { /* non-fatal */ }
      finally { setIsLoading(false) }
    }
    fetchMacro()
  }, [])

  const risk = calculateRiskMetrics()

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '15px',
      padding: '20px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      marginTop: '20px',
    }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2em', fontWeight: 600 }}>
        🛡️ Risk Management Dashboard
      </h3>

      {/* Kill Switch Status */}
      <div style={{
        background: risk.circuitBreaker.halt ? 'rgba(255, 0, 100, 0.1)' : 'rgba(0, 255, 100, 0.05)',
        border: `1px solid ${risk.circuitBreaker.halt ? 'rgba(255, 0, 100, 0.3)' : 'rgba(0, 255, 100, 0.2)'}`,
        borderRadius: '12px',
        padding: '15px',
        marginBottom: '15px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95em', marginBottom: '4px' }}>
            {risk.circuitBreaker.halt ? '🛑 KILL SWITCH ACTIVE' : '✅ Kill Switch: Standby'}
          </div>
          {risk.circuitBreaker.reasons.length > 0 ? (
            <div style={{ fontSize: '0.8em', color: risk.circuitBreaker.halt ? '#ff6b9d' : '#FCD34D' }}>
              {risk.circuitBreaker.reasons.join(' | ')}
            </div>
          ) : (
            <div style={{ fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.4)' }}>
              All risk parameters within limits
            </div>
          )}
        </div>
        <div style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: risk.circuitBreaker.halt ? '#ff0064' : '#00ff64',
          boxShadow: risk.circuitBreaker.halt ? '0 0 10px rgba(255, 0, 100, 0.5)' : '0 0 10px rgba(0, 255, 100, 0.3)',
        }} />
      </div>

      {/* Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '15px',
      }}>
        {/* Position Count */}
        <MetricCard
          label="Open Positions"
          value={`${risk.positionLimits.currentPositions} / ${risk.positionLimits.maxPositions}`}
          subtitle={`Regime: ${risk.positionLimits.regime.replace(/_/g, ' ')}`}
          progress={(risk.positionLimits.currentPositions / risk.positionLimits.maxPositions) * 100}
          color={risk.positionLimits.currentPositions >= risk.positionLimits.maxPositions ? '#ff0064' : '#4facfe'}
        />

        {/* Capital Utilization */}
        <MetricCard
          label="Capital Utilization"
          value={`${risk.riskUtilization.toFixed(0)}%`}
          subtitle={`of ₹${(capital / 100000).toFixed(1)}L deployed`}
          progress={risk.riskUtilization}
          color={risk.riskUtilization > 80 ? '#ff0064' : risk.riskUtilization > 60 ? '#FCD34D' : '#00ff64'}
        />

        {/* Daily P&L */}
        <MetricCard
          label="Today's P&L"
          value={`${risk.dailyPnL >= 0 ? '+' : ''}₹${Math.abs(risk.dailyPnL).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle={`${((risk.dailyPnL / capital) * 100).toFixed(2)}% of capital`}
          progress={Math.min(100, Math.abs((risk.dailyPnL / capital) * 100) * 10)}
          color={risk.dailyPnL >= 0 ? '#00ff64' : '#ff0064'}
        />

        {/* Drawdown */}
        <MetricCard
          label="Portfolio Drawdown"
          value={`${risk.portfolioDrawdown.toFixed(1)}%`}
          subtitle={risk.portfolioDrawdown > 5 ? '⚠️ Approaching limit' : 'From peak'}
          progress={Math.min(100, (risk.portfolioDrawdown / 10) * 100)}
          color={risk.portfolioDrawdown > 7 ? '#ff0064' : risk.portfolioDrawdown > 4 ? '#FCD34D' : '#00ff64'}
        />

        {/* VIX */}
        {macroData && (
          <MetricCard
            label="India VIX"
            value={macroData.volatility.indiaVix.toFixed(1)}
            subtitle={`Trend: ${macroData.volatility.vixTrend}`}
            progress={Math.min(100, (macroData.volatility.indiaVix / 35) * 100)}
            color={macroData.volatility.indiaVix > 25 ? '#ff0064' : macroData.volatility.indiaVix > 20 ? '#FCD34D' : '#00ff64'}
          />
        )}
      </div>

      {/* Sector Concentration */}
      {Object.keys(risk.sectorConcentration).length > 0 && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '10px',
          padding: '15px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          <div style={{ fontSize: '0.85em', fontWeight: 600, marginBottom: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
            📊 Sector Concentration
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Object.entries(risk.sectorConcentration)
              .sort((a, b) => b[1] - a[1])
              .map(([sector, pct]) => (
                <div key={sector} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '90px', fontSize: '0.8em', color: 'rgba(255, 255, 255, 0.5)', flexShrink: 0 }}>
                    {sector}
                  </div>
                  <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, pct)}%`,
                      borderRadius: '4px',
                      background: pct > 25 ? '#ff0064' : pct > 15 ? '#FCD34D' : '#4facfe',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{
                    width: '45px',
                    fontSize: '0.8em',
                    fontWeight: 600,
                    textAlign: 'right',
                    color: pct > 25 ? '#ff0064' : 'rgba(255, 255, 255, 0.6)',
                  }}>
                    {pct.toFixed(0)}%
                  </div>
                </div>
              ))}
          </div>
          <div style={{ fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.3)', marginTop: '8px' }}>
            Max 25% in any single sector. Red = over limit.
          </div>
        </div>
      )}

      {/* Circuit Breaker Indicators */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '8px',
        marginTop: '15px',
      }}>
        <BreakIndicator label="Daily Loss < 5%" active={!risk.circuitBreaker.triggers.dailyLossExceeded} />
        <BreakIndicator label="Drawdown < 10%" active={!risk.circuitBreaker.triggers.drawdownExceeded} />
        <BreakIndicator label="No Consecutive SLs" active={!risk.circuitBreaker.triggers.consecutiveSLs} />
        <BreakIndicator label="VIX < 25" active={!risk.circuitBreaker.triggers.highVix} />
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MetricCard({
  label,
  value,
  subtitle,
  progress,
  color,
}: {
  label: string
  value: string
  subtitle: string
  progress: number
  color: string
}) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '10px',
      padding: '14px',
      border: '1px solid rgba(255, 255, 255, 0.06)',
    }}>
      <div style={{ fontSize: '0.75em', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4em', fontWeight: 700, color, marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.4)', marginBottom: '8px' }}>
        {subtitle}
      </div>
      <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255, 255, 255, 0.06)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, progress)}%`,
          borderRadius: '2px',
          background: color,
          opacity: 0.7,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

function BreakIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '8px',
      background: active ? 'rgba(0, 255, 100, 0.03)' : 'rgba(255, 0, 100, 0.08)',
      border: `1px solid ${active ? 'rgba(0, 255, 100, 0.15)' : 'rgba(255, 0, 100, 0.25)'}`,
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: active ? '#00ff64' : '#ff0064',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: '0.78em', color: active ? 'rgba(255, 255, 255, 0.5)' : '#ff6b9d' }}>
        {active ? '✓' : '✗'} {label}
      </span>
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function getMaxPositions(regime: string): number {
  switch (regime) {
    case 'STRONGLY_RISK_OFF': return 3
    case 'RISK_OFF': return 5
    case 'NEUTRAL': return 8
    case 'RISK_ON': return 12
    case 'STRONGLY_RISK_ON': return 15
    // Map from market regime names too
    case 'STRONG_BEAR': return 3
    case 'BEAR': return 5
    case 'SIDEWAYS': return 8
    case 'BULL': return 12
    case 'STRONG_BULL': return 15
    default: return 8
  }
}
