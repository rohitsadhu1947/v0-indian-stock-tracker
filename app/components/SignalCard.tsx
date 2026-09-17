/**
 * Signal Cards
 * Display components for high conviction and moderate signals
 */

'use client'

import React, { useState } from 'react'
import type { MasterScore } from '@/lib/master-scorer'
import type { EnhancedSignal } from '@/lib/signal-enhancer'
import { SignalWarnings } from './SignalWarnings'

interface SignalCardProps {
  signal: MasterScore
  rank: number
  onExecute: (signal: MasterScore) => void
  accentColor: string
  enhancement?: EnhancedSignal
}

export function SignalCard({ signal, rank, onExecute, accentColor, enhancement }: SignalCardProps) {
  const [expanded, setExpanded] = useState(rank <= 3)  // Auto-expand top 3
  const [showModal, setShowModal] = useState(false)  // For detailed view modal
  
  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'HIGH_CONVICTION':
        return { emoji: '🔥', text: 'HIGH CONVICTION', color: '#10B981' }
      case 'MODERATE':
        return { emoji: '✅', text: 'MODERATE', color: '#3B82F6' }
      default:
        return { emoji: '👀', text: 'WATCH', color: '#F59E0B' }
    }
  }
  
  const tierBadge = getTierBadge(signal.tier)
  
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '12px',
      border: `1px solid ${accentColor}33`,
      overflow: 'hidden'
    }}>
      {/* Header - Always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '15px 20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: `linear-gradient(90deg, ${accentColor}11 0%, transparent 100%)`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            fontSize: '1.5em',
            fontWeight: 'bold',
            color: accentColor,
            minWidth: '30px'
          }}>
            #{rank}
          </div>
          
          <div>
            <h4 style={{ margin: 0, fontSize: '1.3em' }}>{signal.symbol}</h4>
            <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '2px' }}>
              {signal.fundamental?.data?.marketCap && signal.fundamental.data.marketCap > 0 && (
                <span>
                  Market Cap: ₹{(signal.fundamental.data.marketCap / 10000000).toFixed(0)} Cr
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: '1.5em',
              fontWeight: 'bold',
              color: accentColor
            }}>
              {signal.totalScore}/100
            </div>
            <div style={{
              fontSize: '0.8em',
              padding: '2px 8px',
              background: tierBadge.color,
              borderRadius: '8px',
              marginTop: '4px'
            }}>
              {tierBadge.emoji} {tierBadge.text}
            </div>
            {/* Compact warning indicator */}
            {enhancement && enhancement.warnings.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <SignalWarnings
                  warnings={enhancement.warnings}
                  suggestions={enhancement.suggestions}
                  riskLevel={enhancement.riskLevel}
                  positionSizeMultiplier={enhancement.positionSizeMultiplier}
                  compact={true}
                />
              </div>
            )}
          </div>
          
          <div style={{ fontSize: '1.2em', opacity: 0.7 }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>
      
      {/* Details - Expandable */}
      {expanded && (
        <div style={{ padding: '20px' }}>
          {/* Context Warnings & Suggestions (from post-processor) */}
          {enhancement ? (
            <div style={{ 
              marginBottom: '20px',
              padding: '15px',
              background: enhancement.warnings.length > 0 
                ? (enhancement.riskLevel === 'HIGH' || enhancement.riskLevel === 'VERY_HIGH' 
                    ? 'rgba(239, 68, 68, 0.1)' 
                    : 'rgba(251, 191, 36, 0.1)')
                : 'rgba(16, 185, 129, 0.1)',
              borderRadius: '8px',
              border: enhancement.warnings.length > 0
                ? (enhancement.riskLevel === 'HIGH' || enhancement.riskLevel === 'VERY_HIGH'
                    ? '1px solid rgba(239, 68, 68, 0.3)'
                    : '1px solid rgba(251, 191, 36, 0.3)')
                : '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <h5 style={{ margin: '0 0 12px 0', fontSize: '1em' }}>
                🔍 Context Analysis
              </h5>
              {enhancement.warnings.length > 0 || enhancement.suggestions.length > 0 ? (
                <SignalWarnings
                  warnings={enhancement.warnings}
                  suggestions={enhancement.suggestions}
                  riskLevel={enhancement.riskLevel}
                  positionSizeMultiplier={enhancement.positionSizeMultiplier}
                />
              ) : (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  color: '#10B981',
                  fontSize: '0.95em'
                }}>
                  ✅ <span>All clear - No earnings conflicts, regime favorable, no correlation issues</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              marginBottom: '20px',
              padding: '15px',
              background: 'rgba(107, 114, 128, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(107, 114, 128, 0.3)'
            }}>
              <h5 style={{ margin: '0 0 8px 0', fontSize: '1em' }}>
                🔍 Context Analysis
              </h5>
              <div style={{ 
                color: '#9CA3AF',
                fontSize: '0.9em'
              }}>
                ⏳ Loading market context...
              </div>
            </div>
          )}

          {/* Why This Trade */}
          <div style={{ marginBottom: '20px' }}>
            <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em', color: accentColor }}>
              Why This Trade?
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {signal.reasoning.map((reason, index) => (
                <div key={index} style={{ fontSize: '0.95em', opacity: 0.9 }}>
                  {reason}
                </div>
              ))}
            </div>
          </div>
          
          {/* Score Breakdown */}
          <div style={{
            marginBottom: '20px',
            padding: '15px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px'
          }}>
            <h5 style={{ margin: '0 0 12px 0', fontSize: '1.1em' }}>Score Breakdown</h5>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Technical</div>
                <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                  {signal.technical.score}/40
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                  {signal.technical.breakdown.breakout > 0 && 'Breakout • '}
                  {signal.technical.breakdown.volume > 0 && 'Volume • '}
                  RSI/MACD
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Fundamental</div>
                <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#3B82F6' }}>
                  {signal.fundamental.score}/30
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                  {signal.fundamental.tier}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Intelligence</div>
                <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#A78BFA' }}>
                  {signal.intelligence.score}/30
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                  Analyst + News
                </div>
              </div>
            </div>
          </div>
          
          {/* Trade Plan */}
          <div style={{
            marginBottom: '20px',
            padding: '15px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            border: '2px solid rgba(16, 185, 129, 0.3)'
          }}>
            <h5 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#10B981' }}>
              📝 Trade Plan
            </h5>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Entry</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  ₹{signal.tradePlan.entry.toFixed(2)}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Stop Loss</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#EF4444' }}>
                  ₹{signal.tradePlan.stopLoss.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
                  ({(((signal.tradePlan.stopLoss - signal.tradePlan.entry) / signal.tradePlan.entry) * 100).toFixed(1)}%)
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Target 1</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#10B981' }}>
                  ₹{signal.tradePlan.target1.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
                  (+{(((signal.tradePlan.target1 - signal.tradePlan.entry) / signal.tradePlan.entry) * 100).toFixed(1)}%)
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Target 2</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#10B981' }}>
                  ₹{signal.tradePlan.target2.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
                  (+{(((signal.tradePlan.target2 - signal.tradePlan.entry) / signal.tradePlan.entry) * 100).toFixed(1)}%)
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Position Size</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {signal.tradePlan.positionSize} shares
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
                  ₹{signal.tradePlan.capitalRequired.toLocaleString()}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>Risk</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#F59E0B' }}>
                  ₹{signal.tradePlan.riskAmount.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75em', opacity: 0.6 }}>
                  {signal.tradePlan.riskPercent.toFixed(1)}% of capital
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => onExecute(signal)}
              style={{
                flex: 1,
                padding: '14px 24px',
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}CC 100%)`,
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '1.05em',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              🚀 EXECUTE PAPER TRADE
            </button>
            
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '14px 24px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.05em'
              }}
            >
              📊 Details
            </button>
          </div>
        </div>
      )}
      
      {/* Detailed Modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRadius: '16px',
              border: `2px solid ${accentColor}`,
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '30px',
              color: '#fff'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '2em' }}>{signal.symbol}</h2>
                <div style={{ fontSize: '1.1em', opacity: 0.7, marginTop: '5px' }}>
                  {signal.exchange} • {signal.fundamental?.data?.companyName || 'Indian Stock'}
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '2em',
                  cursor: 'pointer',
                  opacity: 0.7
                }}
              >
                ✕
              </button>
            </div>

            {/* Master Score */}
            <div style={{
              background: `linear-gradient(135deg, ${accentColor}33 0%, transparent 100%)`,
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '25px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3em', fontWeight: 'bold', color: accentColor }}>
                {signal.totalScore}/100
              </div>
              <div style={{ fontSize: '1.2em', marginTop: '5px' }}>
                {getTierBadge(signal.tier).emoji} {getTierBadge(signal.tier).text}
              </div>
            </div>

            {/* Detailed Score Breakdown */}
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '1.3em' }}>📊 Complete Score Breakdown</h3>
              
              {/* Technical Details */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '15px',
                borderRadius: '10px',
                marginBottom: '15px',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '1.1em', fontWeight: 'bold' }}>📈 Technical Score</span>
                  <span style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                    {signal.technical.score}/40
                  </span>
                </div>
                <div style={{ fontSize: '0.9em', opacity: 0.9, marginBottom: '10px' }}>
                  {signal.technical.signals.map((sig, i) => (
                    <div key={i} style={{ marginBottom: '5px' }}>• {sig}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.85em' }}>
                  <div>Momentum: {signal.technical.breakdown.momentum}/15</div>
                  <div>Breakout: {signal.technical.breakdown.breakout}/10</div>
                  <div>Volume: {signal.technical.breakdown.volume}/10</div>
                  <div>Trend: {signal.technical.breakdown.trend}/5</div>
                </div>
              </div>

              {/* Fundamental Details */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                padding: '15px',
                borderRadius: '10px',
                marginBottom: '15px',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '1.1em', fontWeight: 'bold' }}>💎 Fundamental Score</span>
                  <span style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#3B82F6' }}>
                    {signal.fundamental.score}/30
                  </span>
                </div>
                <div style={{ fontSize: '0.95em', opacity: 0.9, marginBottom: '10px' }}>
                  {signal.fundamental.reasoning}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.9em' }}>
                  <div>Market Cap: ₹{signal.fundamental?.data?.marketCap ? (signal.fundamental.data.marketCap / 10000000).toFixed(0) : 'N/A'} Cr</div>
                  <div>P/E: {signal.fundamental?.data?.pe?.toFixed(2) || 'N/A'}</div>
                  <div>ROE: {signal.fundamental?.data?.roe?.toFixed(1) || 'N/A'}%</div>
                  <div>D/E: {signal.fundamental?.data?.debtToEquity?.toFixed(2) || 'N/A'}</div>
                  <div>Sector: {signal.fundamental?.data?.sector || 'N/A'}</div>
                  <div>Industry: {signal.fundamental?.data?.industry || 'N/A'}</div>
                </div>
              </div>

              {/* Intelligence Details */}
              <div style={{
                background: 'rgba(167, 139, 250, 0.1)',
                padding: '15px',
                borderRadius: '10px',
                border: '1px solid rgba(167, 139, 250, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '1.1em', fontWeight: 'bold' }}>🧠 Intelligence Score</span>
                  <span style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#A78BFA' }}>
                    {signal.intelligence.score}/30
                  </span>
                </div>
                <div style={{ fontSize: '0.9em', opacity: 0.9 }}>
                  {signal.intelligence.reasoning.map((reason, i) => (
                    <div key={i} style={{ marginBottom: '5px' }}>• {reason}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.85em', marginTop: '10px' }}>
                  <div>Analyst: {signal.intelligence.breakdown?.analystScore ?? 0}/10</div>
                  <div>Target Upside: {signal.intelligence.breakdown?.targetUpsideScore ?? 0}/8</div>
                  <div>News: {signal.intelligence.breakdown?.newsSentimentScore ?? (signal.intelligence.breakdown as any)?.newsScore ?? 0}/12</div>
                </div>
              </div>
            </div>

            {/* Trade Plan */}
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '1.3em' }}>📝 Recommended Trade Plan</h3>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '20px',
                borderRadius: '12px',
                border: '2px solid rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '15px' }}>
                  <div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Entry Price</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{signal.tradePlan.entry.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Stop Loss</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#EF4444' }}>
                      ₹{signal.tradePlan.stopLoss.toFixed(2)}
                      <span style={{ fontSize: '0.7em', marginLeft: '5px' }}>
                        ({(((signal.tradePlan.stopLoss - signal.tradePlan.entry) / signal.tradePlan.entry) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Position Size</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>{signal.tradePlan.positionSize} shares</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  <div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Target 1</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                      ₹{signal.tradePlan.target1.toFixed(2)}
                      <span style={{ fontSize: '0.7em', marginLeft: '5px' }}>
                        (+{(((signal.tradePlan.target1 - signal.tradePlan.entry) / signal.tradePlan.entry) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Target 2</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                      ₹{signal.tradePlan.target2.toFixed(2)}
                      <span style={{ fontSize: '0.7em', marginLeft: '5px' }}>
                        (+{(((signal.tradePlan.target2 - signal.tradePlan.entry) / signal.tradePlan.entry) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Max Risk</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#F59E0B' }}>
                      ₹{signal.tradePlan.riskAmount.toLocaleString()}
                      <span style={{ fontSize: '0.7em', marginLeft: '5px' }}>
                        ({signal.tradePlan.riskPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.9em' }}>
                    Capital Required: <strong>₹{signal.tradePlan.capitalRequired.toLocaleString()}</strong>
                  </div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                    Risk-Reward Ratio: 1:{(((signal.tradePlan.target1 - signal.tradePlan.entry) / (signal.tradePlan.entry - signal.tradePlan.stopLoss))).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Why This Trade */}
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '1.3em' }}>💡 Why This Trade?</h3>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '10px' }}>
                {signal.reasoning.map((reason, index) => (
                  <div key={index} style={{
                    padding: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    fontSize: '0.95em'
                  }}>
                    {reason}
                  </div>
                ))}
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={() => {
                setShowModal(false)
                onExecute(signal)
              }}
              style={{
                width: '100%',
                padding: '18px',
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}CC 100%)`,
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '1.2em',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: `0 4px 15px ${accentColor}44`
              }}
            >
              🚀 EXECUTE THIS TRADE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

