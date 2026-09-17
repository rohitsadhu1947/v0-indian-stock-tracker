'use client'

import React, { useState, useEffect } from 'react'

// ============================================================================
// TYPES (match lib/recommendation-engine.ts)
// ============================================================================

interface StockRecommendation {
  symbol: string
  sector: string
  industry: string
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'SELL'
  conviction: number
  macroAlignmentScore: number
  thesis: {
    oneLiner: string
    summary: string
    bullishFactors: string[]
    bearishFactors: string[]
    macroTailwinds: string[]
    macroHeadwinds: string[]
    secondOrderEffects: string[]
    geopoliticalContext: string[]
  }
  tradePlan: {
    suggestedAction: string
    timeframe: string
    positionSizeAdvice: string
    riskNote: string
  }
  scoreBreakdown: {
    macroAlignment: number
    sectorMomentum: number
    geopoliticalRisk: number
    vixAdjustment: number
    currencyEffect: number
  }
  relevantMacroData: { factor: string; value: string; impact: string }[]
}

interface SectorOutlook {
  sector: string
  outlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  score: number
  reason: string
  topStock: string
}

interface RecommendationReport {
  timestamp: string
  marketContext: {
    overallSentiment: string
    sentimentScore: number
    summary: string
    riskLevel: string
    keyFactors: string[]
  }
  topPicks: StockRecommendation[]
  avoidList: StockRecommendation[]
  sectorOutlook: SectorOutlook[]
  geopoliticalAlerts: string[]
  generatedAt: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function RecommendationEngine() {
  const [report, setReport] = useState<RecommendationReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [showAvoids, setShowAvoids] = useState(false)

  const fetchRecommendations = async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/recommendations?forceRefresh=${forceRefresh}&includeAll=true`)
      const data = await res.json()
      if (data.success) {
        setReport(data.report)
      } else {
        setError(data.error || 'Failed to fetch recommendations')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecommendations()
  }, [])

  if (isLoading && !report) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2em', marginBottom: '15px' }}>🎯</div>
        <div style={{ fontSize: '1.1em', fontWeight: 600, marginBottom: '8px' }}>
          Generating Recommendations...
        </div>
        <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.5)' }}>
          Analyzing macro conditions, geopolitical events, sector impacts, and stock-specific factors
        </div>
        <div style={{
          width: '200px', height: '3px', background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px', margin: '20px auto', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: '40%', background: 'linear-gradient(90deg, #4facfe, #00f2fe)',
            borderRadius: '2px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5em', marginBottom: '10px' }}>⚠️</div>
        <div style={{ color: '#ff6b9d', marginBottom: '10px' }}>{error}</div>
        <button
          onClick={() => fetchRecommendations(true)}
          style={{
            padding: '8px 20px', background: 'rgba(79, 172, 254, 0.2)',
            border: '1px solid rgba(79, 172, 254, 0.4)', borderRadius: '8px',
            color: '#4facfe', cursor: 'pointer', fontSize: '0.85em',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!report) return null

  return (
    <div style={{ padding: '0' }}>
      {/* Market Pulse Header */}
      <MarketPulse context={report.marketContext} onRefresh={() => fetchRecommendations(true)} isLoading={isLoading} />

      {/* Geopolitical Alerts */}
      {report.geopoliticalAlerts.length > 0 && (
        <div style={{
          background: 'rgba(255, 100, 0, 0.06)',
          border: '1px solid rgba(255, 100, 0, 0.2)',
          borderRadius: '12px', padding: '12px 15px', marginBottom: '20px',
        }}>
          {report.geopoliticalAlerts.map((alert, i) => (
            <div key={i} style={{ fontSize: '0.85em', color: '#ffa500', marginBottom: i < report.geopoliticalAlerts.length - 1 ? '6px' : 0 }}>
              {alert}
            </div>
          ))}
        </div>
      )}

      {/* TOP PICKS — The main value-add */}
      <div style={{ marginBottom: '25px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '15px',
        }}>
          <h3 style={{ margin: 0, fontSize: '1.2em', fontWeight: 700 }}>
            🎯 Today&apos;s Top Picks
          </h3>
          <span style={{
            fontSize: '0.75em', color: 'rgba(255,255,255,0.4)',
            padding: '4px 10px', background: 'rgba(255,255,255,0.05)',
            borderRadius: '20px',
          }}>
            Based on macro + geopolitical + sector analysis
          </span>
        </div>

        {report.topPicks.length === 0 ? (
          <div style={{
            padding: '30px', textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: '1.5em', marginBottom: '8px' }}>🔍</div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>
              No strong buy signals in current macro environment.
              Market conditions may be risk-off or uncertain.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {report.topPicks.map((pick, index) => (
              <RecommendationCard
                key={pick.symbol}
                rec={pick}
                rank={index + 1}
                isExpanded={expandedCard === pick.symbol}
                onToggle={() => setExpandedCard(expandedCard === pick.symbol ? null : pick.symbol)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sector Outlook */}
      <SectorOutlookSection sectors={report.sectorOutlook} />

      {/* Avoid List (collapsible) */}
      {report.avoidList.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={() => setShowAvoids(!showAvoids)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', fontSize: '0.9em', fontWeight: 600, padding: '8px 0',
            }}
          >
            <span style={{ transform: showAvoids ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
            🚫 Stocks to Avoid ({report.avoidList.length})
          </button>
          {showAvoids && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {report.avoidList.map(rec => (
                <AvoidCard key={rec.symbol} rec={rec} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last updated */}
      <div style={{
        textAlign: 'center', fontSize: '0.7em', color: 'rgba(255,255,255,0.25)',
        marginTop: '20px', paddingTop: '15px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        Generated at {new Date(report.generatedAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit',
          day: 'numeric', month: 'short',
        })} IST • Recommendations based on macro analysis only — combine with technical signals for best results
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MarketPulse({ context, onRefresh, isLoading }: {
  context: RecommendationReport['marketContext']
  onRefresh: () => void
  isLoading: boolean
}) {
  const sentimentColor = context.sentimentScore > 20 ? '#00ff64' :
    context.sentimentScore < -20 ? '#ff0064' : '#FCD34D'

  const sentimentEmoji = context.sentimentScore > 30 ? '🚀' :
    context.sentimentScore > 10 ? '📈' :
    context.sentimentScore < -30 ? '💥' :
    context.sentimentScore < -10 ? '📉' : '😐'

  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(${context.sentimentScore > 0 ? '0,255,100' : '255,0,100'},0.04), rgba(0,0,0,0))`,
      borderRadius: '15px', padding: '18px 20px', marginBottom: '20px',
      border: `1px solid rgba(${context.sentimentScore > 0 ? '0,255,100' : '255,0,100'},0.12)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '1.6em' }}>{sentimentEmoji}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1em' }}>
                Market Pulse: <span style={{ color: sentimentColor }}>
                  {context.overallSentiment.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{
                fontSize: '0.75em',
                color: 'rgba(255,255,255,0.4)',
                padding: '2px 8px',
                background: `rgba(${context.riskLevel === 'LOW' ? '0,255,100' : context.riskLevel === 'HIGH' || context.riskLevel === 'EXTREME' ? '255,0,100' : '255,200,0'},0.1)`,
                borderRadius: '4px', display: 'inline-block', marginTop: '4px',
              }}>
                Risk: {context.riskLevel}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)', marginBottom: '10px', lineHeight: 1.5 }}>
            {context.summary}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {context.keyFactors.map((factor, i) => (
              <span key={i} style={{
                fontSize: '0.72em', padding: '3px 8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '4px', color: 'rgba(255,255,255,0.5)',
              }}>
                {factor}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          style={{
            padding: '6px 14px', background: 'rgba(79,172,254,0.15)',
            border: '1px solid rgba(79,172,254,0.3)', borderRadius: '8px',
            color: '#4facfe', cursor: isLoading ? 'wait' : 'pointer',
            fontSize: '0.8em', opacity: isLoading ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          {isLoading ? '...' : '🔄 Refresh'}
        </button>
      </div>
    </div>
  )
}

function RecommendationCard({ rec, rank, isExpanded, onToggle }: {
  rec: StockRecommendation
  rank: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const actionConfig = getActionConfig(rec.action)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '14px',
      border: `1px solid ${actionConfig.borderColor}`,
      overflow: 'hidden',
      transition: 'all 0.2s ease',
    }}>
      {/* Header — always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: '16px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {/* Rank */}
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: actionConfig.bgGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '0.9em', color: '#fff', flexShrink: 0,
        }}>
          {rank}
        </div>

        {/* Stock info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span style={{ fontWeight: 700, fontSize: '1.05em' }}>{rec.symbol}</span>
            <span style={{
              fontSize: '0.65em', padding: '2px 7px',
              background: actionConfig.badgeBg,
              color: actionConfig.color,
              borderRadius: '4px', fontWeight: 700,
              letterSpacing: '0.5px',
            }}>
              {rec.action.replace('_', ' ')}
            </span>
            <span style={{
              fontSize: '0.65em', padding: '2px 6px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '4px', color: 'rgba(255,255,255,0.4)',
            }}>
              {rec.sector}
            </span>
          </div>
          <div style={{
            fontSize: '0.82em', color: 'rgba(255,255,255,0.55)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {rec.thesis.oneLiner}
          </div>
        </div>

        {/* Conviction gauge */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '1.3em', fontWeight: 800,
            color: actionConfig.color,
          }}>
            {rec.conviction}
          </div>
          <div style={{ fontSize: '0.6em', color: 'rgba(255,255,255,0.35)', marginTop: '-2px' }}>
            conviction
          </div>
        </div>

        {/* Expand arrow */}
        <div style={{
          fontSize: '0.8em', color: 'rgba(255,255,255,0.3)',
          transform: isExpanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.2s',
        }}>
          ▶
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{
          padding: '0 18px 18px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Summary */}
          <div style={{
            fontSize: '0.88em', color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.6, padding: '14px 0', marginBottom: '14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {rec.thesis.summary}
          </div>

          {/* Two-column: Bullish vs Bearish */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <FactorList
              title="Bullish Factors"
              factors={rec.thesis.bullishFactors}
              color="#00ff64"
            />
            <FactorList
              title="Risk Factors"
              factors={rec.thesis.bearishFactors}
              color="#ff6b9d"
            />
          </div>

          {/* Macro Tailwinds & Headwinds */}
          {(rec.thesis.macroTailwinds.length > 0 || rec.thesis.macroHeadwinds.length > 0) && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.75em', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                MACRO CONTEXT
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {rec.thesis.macroTailwinds.map((tw, i) => (
                  <div key={`tw-${i}`} style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.55)', paddingLeft: '8px', borderLeft: '2px solid rgba(0,255,100,0.3)' }}>
                    {tw}
                  </div>
                ))}
                {rec.thesis.macroHeadwinds.map((hw, i) => (
                  <div key={`hw-${i}`} style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.55)', paddingLeft: '8px', borderLeft: '2px solid rgba(255,0,100,0.3)' }}>
                    {hw}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Second-order effects */}
          {rec.thesis.secondOrderEffects.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.75em', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                SECOND-ORDER EFFECTS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {rec.thesis.secondOrderEffects.map((e, i) => (
                  <div key={i} style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.45)' }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Geopolitical context */}
          {rec.thesis.geopoliticalContext.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.75em', fontWeight: 600, color: '#ffa500', marginBottom: '8px' }}>
                GEOPOLITICAL IMPACT
              </div>
              {rec.thesis.geopoliticalContext.map((g, i) => (
                <div key={i} style={{ fontSize: '0.78em', color: '#ffa500', opacity: 0.8, marginBottom: '3px' }}>
                  {g}
                </div>
              ))}
            </div>
          )}

          {/* Macro Data Points */}
          {rec.relevantMacroData.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.75em', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                KEY DATA POINTS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
                {rec.relevantMacroData.map((d, i) => (
                  <div key={i} style={{
                    fontSize: '0.75em', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>{d.factor}</div>
                    <div style={{ fontWeight: 600 }}>{d.value}</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9em', marginTop: '2px' }}>{d.impact}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score Breakdown */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '0.75em', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
              SCORE BREAKDOWN
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <ScorePill label="Macro" value={rec.scoreBreakdown.macroAlignment} max={50} />
              <ScorePill label="Sector" value={rec.scoreBreakdown.sectorMomentum} max={25} />
              <ScorePill label="Geopolitical" value={rec.scoreBreakdown.geopoliticalRisk} max={25} />
              <ScorePill label="VIX" value={rec.scoreBreakdown.vixAdjustment} max={10} />
              <ScorePill label="Currency" value={rec.scoreBreakdown.currencyEffect} max={10} />
            </div>
          </div>

          {/* Trade Plan */}
          <div style={{
            background: 'rgba(79,172,254,0.05)',
            borderRadius: '10px', padding: '14px',
            border: '1px solid rgba(79,172,254,0.15)',
          }}>
            <div style={{ fontSize: '0.75em', fontWeight: 600, color: '#4facfe', marginBottom: '10px' }}>
              TRADE PLAN
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <PlanItem label="Action" value={rec.tradePlan.suggestedAction} />
              <PlanItem label="Timeframe" value={rec.tradePlan.timeframe} />
              <PlanItem label="Position Size" value={rec.tradePlan.positionSizeAdvice} />
              <PlanItem label="Risk Management" value={rec.tradePlan.riskNote} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FactorList({ title, factors, color }: { title: string; factors: string[]; color: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.75em', fontWeight: 600, color, opacity: 0.7, marginBottom: '6px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {factors.slice(0, 4).map((f, i) => (
          <div key={i} style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
            {f}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.abs(value) / max * 100
  const color = value > 0 ? '#00ff64' : value < 0 ? '#ff0064' : 'rgba(255,255,255,0.3)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', background: 'rgba(255,255,255,0.03)',
      borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: '0.7em', color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: '0.8em', fontWeight: 700, color }}>
        {value > 0 ? '+' : ''}{value}
      </span>
      <div style={{
        width: '30px', height: '3px', borderRadius: '2px',
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(100, pct)}%`,
          background: color, borderRadius: '2px',
        }} />
      </div>
    </div>
  )
}

function PlanItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.68em', color: 'rgba(255,255,255,0.35)', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.8em', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
        {value}
      </div>
    </div>
  )
}

function SectorOutlookSection({ sectors }: { sectors: SectorOutlook[] }) {
  if (sectors.length === 0) return null

  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1em', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
        📊 Sector Outlook
      </h3>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '8px',
      }}>
        {sectors.map(s => {
          const outlookConfig = s.outlook === 'BULLISH'
            ? { color: '#00ff64', bg: 'rgba(0,255,100,0.04)', border: 'rgba(0,255,100,0.12)', emoji: '🟢' }
            : s.outlook === 'BEARISH'
            ? { color: '#ff0064', bg: 'rgba(255,0,100,0.04)', border: 'rgba(255,0,100,0.12)', emoji: '🔴' }
            : { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)', emoji: '🟡' }

          return (
            <div key={s.sector} style={{
              background: outlookConfig.bg, borderRadius: '10px',
              padding: '12px 14px', border: `1px solid ${outlookConfig.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.85em' }}>{outlookConfig.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9em' }}>{s.sector}</span>
                </div>
                <span style={{
                  fontSize: '0.65em', fontWeight: 700, color: outlookConfig.color,
                  padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px',
                }}>
                  {s.outlook}
                </span>
              </div>
              <div style={{ fontSize: '0.75em', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginBottom: '6px' }}>
                {s.reason}
              </div>
              <div style={{ fontSize: '0.7em', color: 'rgba(255,255,255,0.3)' }}>
                Top pick: <span style={{ color: outlookConfig.color, fontWeight: 600 }}>{s.topStock}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AvoidCard({ rec }: { rec: StockRecommendation }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px', borderRadius: '10px',
      background: 'rgba(255,0,100,0.03)',
      border: '1px solid rgba(255,0,100,0.1)',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#ff0064', flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9em' }}>{rec.symbol}</span>
          <span style={{ fontSize: '0.65em', color: '#ff6b9d' }}>{rec.action}</span>
          <span style={{ fontSize: '0.65em', color: 'rgba(255,255,255,0.3)' }}>{rec.sector}</span>
        </div>
        <div style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
          {rec.thesis.oneLiner}
        </div>
      </div>
      <div style={{ fontSize: '0.8em', fontWeight: 700, color: '#ff0064' }}>
        {rec.conviction}
      </div>
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function getActionConfig(action: StockRecommendation['action']) {
  switch (action) {
    case 'STRONG_BUY':
      return {
        color: '#00ff64',
        borderColor: 'rgba(0,255,100,0.2)',
        bgGradient: 'linear-gradient(135deg, #00b346, #00ff64)',
        badgeBg: 'rgba(0,255,100,0.15)',
      }
    case 'BUY':
      return {
        color: '#4facfe',
        borderColor: 'rgba(79,172,254,0.2)',
        bgGradient: 'linear-gradient(135deg, #4facfe, #00f2fe)',
        badgeBg: 'rgba(79,172,254,0.15)',
      }
    case 'HOLD':
      return {
        color: '#FCD34D',
        borderColor: 'rgba(252,211,77,0.2)',
        bgGradient: 'linear-gradient(135deg, #f59e0b, #FCD34D)',
        badgeBg: 'rgba(252,211,77,0.15)',
      }
    case 'AVOID':
      return {
        color: '#ff6b9d',
        borderColor: 'rgba(255,107,157,0.2)',
        bgGradient: 'linear-gradient(135deg, #ff0064, #ff6b9d)',
        badgeBg: 'rgba(255,107,157,0.15)',
      }
    case 'SELL':
      return {
        color: '#ff0064',
        borderColor: 'rgba(255,0,100,0.25)',
        bgGradient: 'linear-gradient(135deg, #cc0050, #ff0064)',
        badgeBg: 'rgba(255,0,100,0.15)',
      }
  }
}
