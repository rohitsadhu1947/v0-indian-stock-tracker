/**
 * Trade Now Tab
 * Main trading interface with News Alerts, High Conviction, and Moderate signals
 */

'use client'

import React, { useState, useEffect } from 'react'
import { SignalCard } from './SignalCard'
import MarketRegimeCard from './MarketRegimeCard'
import SmartMoneyCard from './SmartMoneyCard'
import EventCalendar from './EventCalendar'
import CorrelationMatrix from './CorrelationMatrix'
import type { MasterScore } from '@/lib/master-scorer'
import type { NewsPop } from '@/lib/news-pop-scanner'

interface TradeNowTabProps {
  capitalAvailable: number
  capitalDeployed: number
  openPositions: number
  maxPositions: number
  todayPnL: number
  onExecuteTrade: (signal: MasterScore | NewsPop, tradeType: 'MOMENTUM' | 'NEWS_POP') => void
}

export default function TradeNowTab({
  capitalAvailable,
  capitalDeployed,
  openPositions,
  maxPositions,
  todayPnL,
  onExecuteTrade
}: TradeNowTabProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highConviction, setHighConviction] = useState<MasterScore[]>([])
  const [moderate, setModerate] = useState<MasterScore[]>([])
  const [watch, setWatch] = useState<MasterScore[]>([]) // NEW: Watch tier
  const [newsPops, setNewsPops] = useState<NewsPop[]>([])
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [marketSentiment, setMarketSentiment] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('NEUTRAL')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Fetch signals
  const fetchSignals = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/scanner/trade-now?capital=${capitalAvailable}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch signals')
      }
      
      const data = await response.json()
      
      if (data.success) {
        setHighConviction(data.data.highConviction || [])
        setModerate(data.data.moderate || [])
        setWatch(data.data.watch || []) // NEW: Watch tier
        setNewsPops(data.data.newsPops || [])
        setLastScanTime(new Date())
      } else {
        throw new Error(data.error || 'Unknown error')
      }
    } catch (err: any) {
      console.error('Error fetching signals:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchSignals()
  }, [])

  // Auto-refresh (every 5 minutes)
  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchSignals()
    }, 5 * 60 * 1000)  // 5 minutes
    
    return () => clearInterval(interval)
  }, [autoRefresh])

  return (
    <div style={{
      minHeight: '600px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '30px',
      borderRadius: '20px'
    }}>
      {/* Market Context Banner */}
      <MarketContextBanner
        sentiment={marketSentiment}
        lastScanTime={lastScanTime}
        onRefresh={fetchSignals}
        isLoading={isLoading}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
      />

      {/* 📊 Market Regime Analysis */}
      <MarketRegimeCard />

      {/* 🐋 Smart Money Tracker - FII/DII Flows */}
      <SmartMoneyCard />

      {/* 📅 Event Calendar - Earnings, Dividends, Corporate Actions */}
      <details style={{ marginBottom: '20px' }}>
        <summary style={{
          cursor: 'pointer',
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '12px',
          padding: '15px',
          fontSize: '1.1em',
          fontWeight: 'bold',
          color: '#60A5FA',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          📅 Event Calendar
          <span style={{ fontSize: '0.8em', fontWeight: 'normal', opacity: 0.7 }}>
            (Click to expand - Earnings, Dividends, Corporate Actions)
          </span>
        </summary>
        <div style={{ marginTop: '10px' }}>
          <EventCalendar />
        </div>
      </details>

      {/* Capital Dashboard */}
      <CapitalDashboard
        capitalAvailable={capitalAvailable}
        capitalDeployed={capitalDeployed}
        openPositions={openPositions}
        maxPositions={maxPositions}
        todayPnL={todayPnL}
      />

      {/* 📊 Correlation Matrix - Portfolio Diversification Analysis */}
      <details style={{ marginBottom: '20px' }}>
        <summary style={{
          cursor: 'pointer',
          background: 'rgba(139, 92, 246, 0.15)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '12px',
          padding: '15px',
          fontSize: '1.1em',
          fontWeight: 'bold',
          color: '#A78BFA',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          📊 Correlation Analysis
          <span style={{ fontSize: '0.8em', fontWeight: 'normal', opacity: 0.7 }}>
            (Click to expand - Portfolio diversification)
          </span>
        </summary>
        <div style={{ marginTop: '10px' }}>
          <CorrelationMatrix />
        </div>
      </details>

      {/* Error Display */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.2)',
          border: '2px solid rgba(239, 68, 68, 0.5)',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '20px',
          color: '#FCA5A5'
        }}>
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      {/* News Alerts Section */}
      {newsPops.length > 0 && (
        <NewsAlertsSection
          newsPops={newsPops}
          onExecute={(pop) => onExecuteTrade(pop, 'NEWS_POP')}
        />
      )}

      {/* High Conviction Section */}
      <SignalsSection
        title="🔥 HIGH CONVICTION"
        subtitle="All stars aligned - Strong technical + Quality fundamental + Analyst support"
        signals={highConviction}
        onExecute={(signal) => onExecuteTrade(signal, 'MOMENTUM')}
        accentColor="#10B981"
        isLoading={isLoading}
        emptyMessage="No high conviction signals found. Try lowering filters or scan a broader universe."
      />

      {/* Moderate Section */}
      <SignalsSection
        title="✅ MODERATE"
        subtitle="Good setups - 2-3 factors strong"
        signals={moderate}
        onExecute={(signal) => onExecuteTrade(signal, 'MOMENTUM')}
        accentColor="#3B82F6"
        isLoading={isLoading}
        emptyMessage="No moderate signals found."
        defaultCollapsed={true}
      />

      {/* Watch Section - NEW! */}
      <SignalsSection
        title="👀 WATCH"
        subtitle="Decent setups but missing one factor. Monitor closely."
        signals={watch}
        onExecute={(signal) => onExecuteTrade(signal, 'MOMENTUM')}
        accentColor="#F59E0B"
        isLoading={isLoading}
        emptyMessage="No watch signals found."
        defaultCollapsed={true}
      />

      {/* Custom Stock Input */}
      <CustomStockInput
        onAnalyze={async (symbol, exchange) => {
          console.log('🔍 Analyzing custom stock:', symbol, exchange)
          setIsLoading(true)
          setError(null)
          
          try {
            // Call the trade-now scanner with a custom symbol
            const response = await fetch(`/api/scanner/trade-now?capital=${capitalAvailable}&customSymbols=${symbol}`)
            
            if (!response.ok) {
              throw new Error('Failed to analyze custom stock')
            }
            
            const data = await response.json()
            
            if (data.success) {
              // Add the custom stock results to the existing signals
              const customSignals = [
                ...(data.data.highConviction || []),
                ...(data.data.moderate || []),
                ...(data.data.watch || [])
              ]
              
              if (customSignals.length > 0) {
                // Find the custom stock (the one we just analyzed)
                const customStock = customSignals.find(s => s.symbol === symbol)
                
                if (customStock) {
                  // Add ONLY the custom stock to the appropriate category (avoid duplicates)
                  if (customStock.totalScore >= 85) {
                    setHighConviction(prev => {
                      const filtered = prev.filter(s => s.symbol !== symbol)
                      return [...filtered, customStock]
                    })
                  } else if (customStock.totalScore >= 75) {
                    setModerate(prev => {
                      const filtered = prev.filter(s => s.symbol !== symbol)
                      return [...filtered, customStock]
                    })
                  } else if (customStock.totalScore >= 60) {
                    setWatch(prev => {
                      const filtered = prev.filter(s => s.symbol !== symbol)
                      return [...filtered, customStock]
                    })
                  } else {
                    // Score < 60: Still add to watch for visibility (force-analyzed custom stock)
                    setWatch(prev => {
                      const filtered = prev.filter(s => s.symbol !== symbol)
                      return [...filtered, customStock]
                    })
                  }
                  
                  // Show detailed alert with reasoning
                  const reasoningText = customStock.reasoning.slice(0, 3).join('\n')
                  const tierEmoji = customStock.tier === 'HIGH_CONVICTION' ? '🔥' : 
                                   customStock.tier === 'MODERATE' ? '✅' : 
                                   customStock.tier === 'WATCH' ? '👀' : '⚠️'
                  
                  alert(
                    `${tierEmoji} ${symbol} analyzed!\n\n` +
                    `Score: ${customStock.totalScore}/100\n` +
                    `Tier: ${customStock.tier}\n\n` +
                    `Breakdown:\n` +
                    `Technical: ${customStock.technical.score}/40\n` +
                    `Fundamental: ${customStock.fundamental.score}/30\n` +
                    `Intelligence: ${customStock.intelligence.score}/30\n\n` +
                    `Top Reasons:\n${reasoningText}\n\n` +
                    (customStock.totalScore < 60 ? 
                      '⚠️ Score below 60 - Not recommended for trading currently.' : 
                      customStock.totalScore < 75 ? 
                      '👀 Decent setup - Monitor for confirmation.' :
                      '✅ Good opportunity!')
                  )
                } else {
                  // Stock scored < 60, not in any category
                  alert(
                    `⚠️ ${symbol} analyzed but scored below 60/100.\n\n` +
                    `This stock doesn't meet minimum criteria for trading signals.\n\n` +
                    `Possible reasons:\n` +
                    `- In downtrend or sideways movement\n` +
                    `- Weak momentum indicators\n` +
                    `- Low volume or liquidity\n` +
                    `- Poor fundamental quality\n\n` +
                    `Try analyzing during market hours or when stock shows more activity.`
                  )
                }
              } else {
                // No signals at all (shouldn't happen with force analysis)
                alert(
                  `⚠️ ${symbol} couldn't be analyzed.\n\n` +
                  `Possible reasons:\n` +
                  `- Symbol not found on NSE/BSE\n` +
                  `- Insufficient historical data\n` +
                  `- Stock suspended or delisted\n\n` +
                  `Please check the symbol and try again.`
                )
              }
            } else {
              throw new Error(data.error || 'Unknown error')
            }
          } catch (err: any) {
            console.error('Error analyzing custom stock:', err)
            setError(err.message)
            alert(`❌ Failed to analyze ${symbol}: ${err.message}`)
          } finally {
            setIsLoading(false)
          }
        }}
      />
    </div>
  )
}

// Sub-components (defined below)
function MarketContextBanner({ sentiment, lastScanTime, onRefresh, isLoading, autoRefresh, onToggleAutoRefresh }: any) {
  const sentimentConfig = {
    BULLISH: { emoji: '📈', color: '#10B981', text: 'BULLISH' },
    BEARISH: { emoji: '📉', color: '#EF4444', text: 'BEARISH' },
    NEUTRAL: { emoji: '➡️', color: '#F59E0B', text: 'NEUTRAL' }
  }
  
  const config = sentimentConfig[sentiment]
  
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '12px',
      padding: '15px 20px',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '15px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ fontSize: '1.5em' }}>{config.emoji}</div>
        <div>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Market Sentiment</div>
          <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: config.color }}>
            {config.text}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {lastScanTime && (
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
            Last scan: {lastScanTime.toLocaleTimeString()}
          </div>
        )}
        
        <button
          onClick={onToggleAutoRefresh}
          style={{
            padding: '8px 16px',
            background: autoRefresh ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 0, 0, 0.3)',
            border: `1px solid ${autoRefresh ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.9em'
          }}
        >
          {autoRefresh ? '⚡ Auto-Refresh ON' : '⏸️ Auto-Refresh OFF'}
        </button>
        
        <button
          onClick={onRefresh}
          disabled={isLoading}
          style={{
            padding: '8px 16px',
            background: 'rgba(59, 130, 246, 0.3)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            borderRadius: '8px',
            color: '#fff',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '0.9em',
            opacity: isLoading ? 0.5 : 1
          }}
        >
          {isLoading ? '⏳ Scanning...' : '🔄 Refresh'}
        </button>
      </div>
    </div>
  )
}

function CapitalDashboard({ capitalAvailable, capitalDeployed, openPositions, maxPositions, todayPnL }: any) {
  const capitalPercent = (capitalDeployed / capitalAvailable) * 100
  const positionPercent = (openPositions / maxPositions) * 100
  
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '30px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '20px'
    }}>
      <div>
        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>
          Capital Deployed
        </div>
        <div style={{ fontSize: '1.4em', fontWeight: 'bold', color: '#3B82F6' }}>
          ₹{capitalDeployed.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '2px' }}>
          of ₹{capitalAvailable.toLocaleString()} ({capitalPercent.toFixed(1)}%)
        </div>
      </div>
      
      <div>
        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>
          Open Positions
        </div>
        <div style={{ fontSize: '1.4em', fontWeight: 'bold', color: '#A78BFA' }}>
          {openPositions} / {maxPositions}
        </div>
        <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '2px' }}>
          ({positionPercent.toFixed(0)}% capacity)
        </div>
      </div>
      
      <div>
        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>
          Today's P&L
        </div>
        <div style={{ 
          fontSize: '1.4em', 
          fontWeight: 'bold',
          color: todayPnL >= 0 ? '#10B981' : '#EF4444'
        }}>
          {todayPnL >= 0 ? '+' : ''}₹{todayPnL.toLocaleString()}
        </div>
        <div style={{ 
          fontSize: '0.8em',
          opacity: 0.6,
          marginTop: '2px',
          color: todayPnL >= 0 ? '#10B981' : '#EF4444'
        }}>
          ({todayPnL >= 0 ? '+' : ''}{((todayPnL / capitalAvailable) * 100).toFixed(2)}%)
        </div>
      </div>
    </div>
  )
}

function NewsAlertsSection({ newsPops, onExecute }: any) {
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
        <h3 style={{ margin: 0, color: '#fff' }}>BREAKING NEWS ALERTS</h3>
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
        <div style={{
          fontSize: '0.9em',
          opacity: 0.8,
          marginBottom: '15px',
          padding: '10px',
          background: 'rgba(251, 191, 36, 0.15)',
          borderRadius: '8px',
          border: '1px solid rgba(251, 191, 36, 0.3)'
        }}>
          ⚠️ <strong>High Risk - Quick Trades:</strong> News-driven momentum fades fast. Auto-exit in 2 hours or at profit/loss targets.
        </div>
        
        {newsPops.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>
            🔇 No breaking news detected. Monitoring for volume spikes...
          </div>
        ) : (
          newsPops.map((pop: NewsPop, index: number) => (
            <div key={`${pop.symbol}-${index}`} style={{ marginBottom: index < newsPops.length - 1 ? '15px' : 0 }}>
              <NewsPopCard
                pop={pop}
                rank={index + 1}
                onExecute={() => onExecute(pop)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SignalsSection({ title, subtitle, signals, onExecute, accentColor, isLoading, emptyMessage, defaultCollapsed = false }: any) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  
  return (
    <div style={{ marginBottom: '30px' }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: `linear-gradient(135deg, ${accentColor}22 0%, ${accentColor}33 100%)`,
          padding: '15px 20px',
          borderRadius: collapsed ? '12px' : '12px 12px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          border: `2px solid ${accentColor}44`
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#fff' }}>{title}</h3>
          <div style={{ fontSize: '0.85em', opacity: 0.8, marginTop: '5px' }}>
            {subtitle}
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{
            background: accentColor,
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '0.9em',
            fontWeight: 'bold'
          }}>
            {signals.length} signal{signals.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '1.5em' }}>
            {collapsed ? '▼' : '▲'}
          </span>
        </div>
      </div>
      
      {!collapsed && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          border: `2px solid ${accentColor}44`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          padding: '20px'
        }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
              ⏳ Scanning and scoring signals...
            </div>
          ) : signals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
              {emptyMessage}
            </div>
          ) : (
            signals.map((signal: MasterScore, index: number) => (
              <div key={signal.symbol} style={{ marginBottom: index < signals.length - 1 ? '20px' : 0 }}>
                <SignalCard
                  signal={signal}
                  rank={index + 1}
                  onExecute={onExecute}
                  accentColor={accentColor}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function CustomStockInput({ onAnalyze }: any) {
  const [symbol, setSymbol] = useState('')
  const [exchange, setExchange] = useState('NSE')
  
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '12px',
      padding: '20px',
      border: '2px solid rgba(255, 255, 255, 0.1)'
    }}>
      <h4 style={{ margin: '0 0 15px 0' }}>📝 Analyze Custom Stock</h4>
      <div style={{ fontSize: '0.9em', opacity: 0.8, marginBottom: '15px' }}>
        Got a stock tip? Add it here and we'll run full analysis (technical + fundamental + analyst check)
      </div>
      
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Enter symbol (e.g., SYMPHONY)"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          style={{
            flex: 1,
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '1em'
          }}
        />
        
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value)}
          style={{
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '1em',
            cursor: 'pointer'
          }}
        >
          <option value="NSE">NSE</option>
          <option value="BSE">BSE</option>
        </select>
        
        <button
          onClick={() => {
            if (symbol) {
              onAnalyze(symbol, exchange)
              setSymbol('')
            }
          }}
          disabled={!symbol}
          style={{
            padding: '12px 24px',
            background: symbol ? 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)' : 'rgba(0, 0, 0, 0.3)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: 'bold',
            cursor: symbol ? 'pointer' : 'not-allowed',
            fontSize: '1em',
            opacity: symbol ? 1 : 0.5
          }}
        >
          🔍 Analyze
        </button>
      </div>
    </div>
  )
}

/**
 * News Pop Card Component
 * Displays news-driven volume/price spike alerts
 */
function NewsPopCard({ pop, rank, onExecute }: { pop: NewsPop, rank: number, onExecute: () => void }) {
  const urgencyColor = pop.urgency === 'HIGH' ? '#EF4444' : '#F59E0B'
  const urgencyBg = pop.urgency === 'HIGH' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)',
      border: '2px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '12px',
      padding: '20px',
      position: 'relative'
    }}>
      {/* Urgency Badge */}
      <div style={{
        position: 'absolute',
        top: '15px',
        right: '15px',
        background: urgencyBg,
        padding: '6px 12px',
        borderRadius: '20px',
        border: `1px solid ${urgencyColor}`,
        fontSize: '0.75em',
        fontWeight: 'bold',
        color: urgencyColor
      }}>
        {pop.urgency === 'HIGH' ? '🚨 HIGH URGENCY' : '⚠️ MEDIUM'}
      </div>

      {/* Header */}
      <div style={{ marginBottom: '15px', paddingRight: '120px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
          <span style={{
            background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '0.75em',
            fontWeight: 'bold',
            color: '#000'
          }}>
            #{rank}
          </span>
          <h4 style={{ margin: 0, fontSize: '1.3em', color: '#FCD34D' }}>{pop.symbol}</h4>
          <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{pop.tradingSymbol}</span>
        </div>
        
        {pop.newsAvailable && pop.newsSnippet && (
          <div style={{
            marginTop: '10px',
            padding: '10px',
            background: 'rgba(251, 191, 36, 0.15)',
            borderLeft: '3px solid #FCD34D',
            borderRadius: '4px',
            fontSize: '0.9em'
          }}>
            📰 <strong>News:</strong> {pop.newsSnippet}
          </div>
        )}
      </div>

      {/* Triggers */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '0.85em', opacity: 0.8, marginBottom: '8px' }}>
          <strong>Triggers:</strong>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {pop.triggers.map((trigger, i) => (
            <span key={i} style={{
              background: 'rgba(251, 191, 36, 0.2)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.85em',
              border: '1px solid rgba(251, 191, 36, 0.4)'
            }}>
              {trigger}
            </span>
          ))}
        </div>
      </div>

      {/* Price Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '15px',
        marginBottom: '15px'
      }}>
        <div>
          <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '4px' }}>Current Price</div>
          <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#FCD34D' }}>
            ₹{pop.currentPrice.toFixed(2)}
          </div>
          <div style={{
            fontSize: '0.85em',
            color: pop.priceChangePercent > 0 ? '#10B981' : '#EF4444'
          }}>
            {pop.priceChangePercent > 0 ? '+' : ''}{pop.priceChangePercent.toFixed(2)}%
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '4px' }}>Target</div>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#10B981' }}>
            ₹{pop.target.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
            +{((pop.target - pop.currentPrice) / pop.currentPrice * 100).toFixed(1)}%
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '4px' }}>Stop Loss</div>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#EF4444' }}>
            ₹{pop.stopLoss.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
            -{((pop.currentPrice - pop.stopLoss) / pop.currentPrice * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Trade Details */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '8px',
        marginBottom: '15px'
      }}>
        <div>
          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>Position Size</div>
          <div style={{ fontSize: '0.95em', fontWeight: 'bold' }}>{pop.positionSize} shares</div>
        </div>
        <div>
          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>Capital Required</div>
          <div style={{ fontSize: '0.95em', fontWeight: 'bold' }}>
            ₹{(pop.currentPrice * pop.positionSize).toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75em', opacity: 0.6 }}>Risk:Reward</div>
          <div style={{ fontSize: '0.95em', fontWeight: 'bold', color: '#10B981' }}>
            1:{pop.riskReward.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={onExecute}
        style={{
          width: '100%',
          padding: '15px',
          background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
          border: 'none',
          borderRadius: '8px',
          color: '#000',
          fontWeight: 'bold',
          fontSize: '1em',
          cursor: 'pointer',
          transition: 'transform 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        ⚡ EXECUTE TRADE (ACT FAST!)
      </button>

      {/* Detected Time */}
      <div style={{
        marginTop: '10px',
        fontSize: '0.75em',
        opacity: 0.5,
        textAlign: 'center'
      }}>
        Detected: {new Date(pop.detectedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

