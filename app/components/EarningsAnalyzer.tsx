'use client'

import React, { useState, useEffect } from 'react'

interface AnalysisResult {
  success: boolean
  symbol: string
  analysisDate: string
  priceSetup: any
  financialTrend: any
  earningsReactions: any
  news: any[]
  sentiment: any
  options: any
  verdict: {
    recommendation: string
    confidence: string
    score: number
    breakdown: Record<string, number>
    tradePlan: any
    riskFactors: string[]
    summary: string
  }
}

interface StockData {
  symbol: string
  quarters: number
  latestQuarter: string
}

export default function EarningsAnalyzer() {
  const [stocks, setStocks] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch available stocks
  useEffect(() => {
    fetchStocks()
  }, [])

  const fetchStocks = async () => {
    try {
      const response = await fetch('/api/financials/list')
      const data = await response.json()
      if (data.success) {
        setStocks(data.stocks.map((s: any) => ({
          symbol: s.symbol,
          quarters: s.quarterCount || s.quarters?.length || 0,
          latestQuarter: s.latestQuarter
        })))
      }
    } catch (err) {
      console.error('Failed to fetch stocks:', err)
    } finally {
      setLoading(false)
    }
  }

  const runAnalysis = async (symbol: string) => {
    setAnalyzing(true)
    setError(null)
    setSelectedStock(symbol)
    setAnalysis(null)

    try {
      const response = await fetch(`/api/earnings/pre-analysis/${symbol}`)
      const data = await response.json()
      
      if (data.success) {
        setAnalysis(data)
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const getRecommendationColor = (rec: string) => {
    if (rec.includes('BUY')) return '#10B981'
    if (rec.includes('SELL')) return '#EF4444'
    return '#F59E0B'
  }

  const getScoreColor = (score: number) => {
    if (score >= 30) return '#10B981'
    if (score >= 0) return '#F59E0B'
    return '#EF4444'
  }

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3em' }}>
        🔬 Pre-Earnings Analyzer
      </h3>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
          ⏳ Loading stocks...
        </div>
      ) : stocks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
          <div style={{ fontSize: '2em', marginBottom: '12px' }}>📭</div>
          <div>No stocks with financial data</div>
          <div style={{ fontSize: '0.9em', marginTop: '8px' }}>
            Upload financial data first to run analysis
          </div>
        </div>
      ) : (
        <div>
          {/* Stock Selection */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '20px'
          }}>
            {stocks.map(stock => (
              <button
                key={stock.symbol}
                onClick={() => runAnalysis(stock.symbol)}
                disabled={analyzing}
                style={{
                  padding: '12px 20px',
                  background: selectedStock === stock.symbol 
                    ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
                    : 'rgba(0, 0, 0, 0.3)',
                  border: selectedStock === stock.symbol
                    ? '2px solid rgba(59, 130, 246, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  cursor: analyzing ? 'wait' : 'pointer',
                  fontSize: '1em',
                  fontWeight: selectedStock === stock.symbol ? 'bold' : 'normal'
                }}
              >
                <div>{stock.symbol}</div>
                <div style={{ fontSize: '0.75em', opacity: 0.7 }}>
                  {stock.quarters} qtrs
                </div>
              </button>
            ))}
          </div>

          {/* Analysis Loading */}
          {analyzing && (
            <div style={{
              textAlign: 'center',
              padding: '60px',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '3em', marginBottom: '16px' }}>🔬</div>
              <div style={{ fontSize: '1.2em', marginBottom: '8px' }}>Analyzing {selectedStock}...</div>
              <div style={{ opacity: 0.7 }}>
                Fetching price data, news, and generating verdict...
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              color: '#EF4444'
            }}>
              ❌ {error}
            </div>
          )}

          {/* Analysis Results */}
          {analysis && !analyzing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Verdict Banner */}
              <div style={{
                background: `linear-gradient(135deg, ${getRecommendationColor(analysis.verdict.recommendation)}20 0%, ${getRecommendationColor(analysis.verdict.recommendation)}10 100%)`,
                border: `2px solid ${getRecommendationColor(analysis.verdict.recommendation)}50`,
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: '8px' }}>
                  PRE-EARNINGS VERDICT
                </div>
                <div style={{ 
                  fontSize: '2.5em', 
                  fontWeight: 'bold',
                  color: getRecommendationColor(analysis.verdict.recommendation),
                  marginBottom: '8px'
                }}>
                  {analysis.verdict.recommendation.replace('_', ' ')}
                </div>
                <div style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '20px',
                  fontSize: '0.9em',
                  marginBottom: '16px'
                }}>
                  {analysis.verdict.confidence} Confidence • Score: {analysis.verdict.score}
                </div>
                <div style={{ fontSize: '1em', opacity: 0.9, maxWidth: '600px', margin: '0 auto' }}>
                  {analysis.verdict.summary}
                </div>
              </div>

              {/* Trade Plan */}
              {analysis.verdict.tradePlan && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <h4 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🎯 Trade Plan
                    <span style={{
                      padding: '4px 10px',
                      background: analysis.verdict.tradePlan.action === 'LONG' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                      borderRadius: '4px',
                      fontSize: '0.8em'
                    }}>
                      {analysis.verdict.tradePlan.action}
                    </span>
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '0.8em', opacity: 0.6 }}>Entry Price</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{analysis.verdict.tradePlan.entry}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8em', opacity: 0.6 }}>Stop Loss</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#EF4444' }}>
                        ₹{analysis.verdict.tradePlan.stopLoss}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8em', opacity: 0.6 }}>Target 1</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                        ₹{analysis.verdict.tradePlan.target1}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8em', opacity: 0.6 }}>Target 2</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#10B981' }}>
                        ₹{analysis.verdict.tradePlan.target2}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '16px', fontSize: '0.9em', opacity: 0.8 }}>
                    <strong>Position Size:</strong> {analysis.verdict.tradePlan.positionSize} | 
                    <strong> Risk:Reward:</strong> {analysis.verdict.tradePlan.riskReward} |
                    <strong> Holding:</strong> {analysis.verdict.tradePlan.holdingPeriod}
                  </div>
                </div>
              )}

              {/* Score Breakdown */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h4 style={{ margin: '0 0 16px 0' }}>📊 Score Breakdown</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {Object.entries(analysis.verdict.breakdown).map(([key, value]) => (
                    <div key={key} style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <div style={{ fontSize: '0.8em', opacity: 0.6, textTransform: 'capitalize' }}>
                        {key.replace(/([A-Z])/g, ' $1')}
                      </div>
                      <div style={{ 
                        fontSize: '1.5em', 
                        fontWeight: 'bold',
                        color: getScoreColor(value as number)
                      }}>
                        {value as number > 0 ? '+' : ''}{value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Analysis Sections */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                
                {/* Price Setup */}
                {analysis.priceSetup?.available && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    padding: '20px'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0' }}>📈 Price Setup</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9em' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Current Price</span>
                        <strong>₹{analysis.priceSetup.currentPrice}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Trend</span>
                        <strong style={{ color: analysis.priceSetup.trend === 'UPTREND' ? '#10B981' : analysis.priceSetup.trend === 'DOWNTREND' ? '#EF4444' : '#F59E0B' }}>
                          {analysis.priceSetup.trend}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>30D Momentum</span>
                        <strong style={{ color: analysis.priceSetup.momentum.thirtyDay > 0 ? '#10B981' : '#EF4444' }}>
                          {analysis.priceSetup.momentum.thirtyDay > 0 ? '+' : ''}{analysis.priceSetup.momentum.thirtyDay}%
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Support (30D)</span>
                        <strong>₹{analysis.priceSetup.levels.support30D.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Resistance (30D)</span>
                        <strong>₹{analysis.priceSetup.levels.resistance30D.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Avg Daily Range</span>
                        <strong>{analysis.priceSetup.volatility.avgDailyRange}%</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Financial Trend */}
                {analysis.financialTrend?.available && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    padding: '20px'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0' }}>💰 Financial Trend</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9em' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Latest Quarter</span>
                        <strong>{analysis.financialTrend.latestQuarter}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Revenue</span>
                        <strong>₹{analysis.financialTrend.metrics.revenue?.toLocaleString()} Cr</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Net Profit</span>
                        <strong>₹{analysis.financialTrend.metrics.netProfit?.toLocaleString()} Cr</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>YoY Profit Growth</span>
                        <strong style={{ color: (analysis.financialTrend.growth.yoyProfit || 0) > 0 ? '#10B981' : '#EF4444' }}>
                          {analysis.financialTrend.growth.yoyProfit ? `${analysis.financialTrend.growth.yoyProfit > 0 ? '+' : ''}${analysis.financialTrend.growth.yoyProfit}%` : 'N/A'}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Margin Trend</span>
                        <strong style={{ color: analysis.financialTrend.marginTrend === 'EXPANDING' ? '#10B981' : '#EF4444' }}>
                          {analysis.financialTrend.marginTrend}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Consecutive Growth</span>
                        <strong>{analysis.financialTrend.consecutiveGrowthQuarters} quarters</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Historical Reactions */}
                {analysis.earningsReactions?.available && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    padding: '20px'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0' }}>📊 Historical Earnings Reactions</h4>
                    <div style={{ marginBottom: '12px', fontSize: '0.9em' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ opacity: 0.7 }}>Avg Move on Results</span>
                        <strong>±{analysis.earningsReactions.summary.avgAbsoluteMove}%</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ opacity: 0.7 }}>Positive Reactions</span>
                        <strong style={{ color: '#10B981' }}>{analysis.earningsReactions.summary.positiveReactions}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ opacity: 0.7 }}>Negative Reactions</span>
                        <strong style={{ color: '#EF4444' }}>{analysis.earningsReactions.summary.negativeReactions}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ opacity: 0.7 }}>Pattern</span>
                        <strong>{analysis.earningsReactions.summary.consistency}</strong>
                      </div>
                    </div>
                    {analysis.earningsReactions.reactions.length > 0 && (
                      <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.8em' }}>
                        {analysis.earningsReactions.reactions.slice(0, 4).map((r: any, i: number) => (
                          <div key={i} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '6px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.05)'
                          }}>
                            <span>{r.quarter}</span>
                            <span style={{ color: r.oneDayMove > 0 ? '#10B981' : '#EF4444' }}>
                              {r.oneDayMove > 0 ? '+' : ''}{r.oneDayMove}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* News Sentiment */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <h4 style={{ margin: '0 0 12px 0' }}>📰 News Sentiment</h4>
                  {analysis.sentiment?.available ? (
                    <>
                      <div style={{ 
                        textAlign: 'center', 
                        marginBottom: '12px',
                        padding: '12px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: getScoreColor(analysis.sentiment.score) }}>
                          {analysis.sentiment.label.replace('_', ' ')}
                        </div>
                        <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                          Score: {analysis.sentiment.score} | {analysis.sentiment.breakdown.total} articles
                        </div>
                      </div>
                      {analysis.news.length > 0 && (
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {analysis.news.slice(0, 5).map((n: any, i: number) => (
                            <div key={i} style={{
                              padding: '8px 0',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              fontSize: '0.85em'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <span>{n.sentiment === 'POSITIVE' ? '📈' : n.sentiment === 'NEGATIVE' ? '📉' : '📊'}</span>
                                <div>
                                  <div style={{ lineHeight: 1.3 }}>{n.title}</div>
                                  <div style={{ fontSize: '0.8em', opacity: 0.5, marginTop: '4px' }}>
                                    {n.source} • {new Date(n.pubDate).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ opacity: 0.6, textAlign: 'center', padding: '20px' }}>
                      No recent news found
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Factors */}
              {analysis.verdict.riskFactors.length > 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#EF4444' }}>⚠️ Risk Factors</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {analysis.verdict.riskFactors.map((risk, i) => (
                      <li key={i} style={{ marginBottom: '8px' }}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Options Analysis */}
              {analysis.options?.available && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <h4 style={{ margin: '0 0 12px 0' }}>📊 Options Data</h4>
                  <div style={{ display: 'flex', gap: '24px', fontSize: '0.9em' }}>
                    <div>
                      <div style={{ opacity: 0.6 }}>Put-Call Ratio</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>{analysis.options.putCallRatio}</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.6 }}>Options Sentiment</div>
                      <div style={{ 
                        fontSize: '1.3em', 
                        fontWeight: 'bold',
                        color: analysis.options.sentiment.includes('BULLISH') ? '#10B981' : '#EF4444'
                      }}>
                        {analysis.options.sentiment}
                      </div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.6 }}>Expiry</div>
                      <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                        {new Date(analysis.options.expiry).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
