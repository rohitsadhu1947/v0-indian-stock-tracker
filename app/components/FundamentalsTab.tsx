'use client'

import React, { memo, useEffect } from 'react'
import { useUIStore } from '@/lib/stores/ui-store'
import { useWatchlistStore } from '@/lib/stores/watchlist-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import {
  calculateFundamentalScore,
  formatLargeNumber,
  getCompanySize,
} from '@/lib/fundamentals-utils'

export default memo(function FundamentalsTab() {
  const {
    fundamentalData, setFundamentalData,
    fundamentalScore, setFundamentalScore,
    fundamentalSymbol, setFundamentalSymbol,
    fundamentalExchange, setFundamentalExchange,
    isFetchingFundamentals, setIsFetchingFundamentals,
    stockNews, setStockNews,
    marketNews, setMarketNews,
    isFetchingNews, setIsFetchingNews,
    newsTab, setNewsTab,
    stockSentiment, setStockSentiment,
    marketSentiment, setMarketSentiment,
    multiLayerNews, setMultiLayerNews,
    error, setError,
  } = useUIStore()

  const { watchlist, stockData } = useWatchlistStore()
  const { authStatus } = useAuthStore()

  // ─── Functions ─────────────────────────────────────────────────────────────

  async function fetchMultiLayerNews(symbol?: string) {
    const targetSymbol = symbol || fundamentalSymbol.trim().toUpperCase()

    if (!targetSymbol) {
      alert('⚠️ Please enter a stock symbol first')
      return
    }

    setIsFetchingNews(true)

    try {
      console.log(`🎯 Fetching multi-layer news for ${targetSymbol}...`)

      const response = await fetch(`/api/news/multi-layer?symbol=${targetSymbol}&exchange=${fundamentalExchange}`)

      if (!response.ok) {
        throw new Error('Failed to fetch multi-layer news')
      }

      const result = await response.json()

      if (result.success) {
        setMultiLayerNews(result)
        setStockNews(result.stockNews.news)
        setStockSentiment(result.stockNews.sentiment)
        console.log(`✅ Multi-layer analysis complete for ${targetSymbol}`)
        console.log(`   📰 Stock: ${result.stockNews.sentiment.aggregate.overall}`)
        if (result.sectorNews) console.log(`   🏢 Sector: ${result.sectorNews.sentiment.aggregate.overall}`)
        if (result.macroNews) console.log(`   🌍 Macro: ${result.macroNews.sentiment.aggregate.overall}`)
      }

    } catch (error: any) {
      console.error('❌ Error fetching multi-layer news:', error)
      alert(`❌ Failed to fetch news: ${error.message}`)
    } finally {
      setIsFetchingNews(false)
    }
  }

  async function fetchStockNews(symbol?: string) {
    const targetSymbol = symbol || fundamentalSymbol.trim().toUpperCase()

    if (!targetSymbol) {
      alert('⚠️ Please enter a stock symbol first')
      return
    }

    setIsFetchingNews(true)

    try {
      console.log(`📰 Fetching news for ${targetSymbol}...`)

      const response = await fetch(`/api/news/quote?symbol=${targetSymbol}&exchange=${fundamentalExchange}`)

      if (!response.ok) {
        throw new Error('Failed to fetch news')
      }

      const result = await response.json()

      if (result.success && result.news) {
        setStockNews(result.news)
        setStockSentiment(result.sentiment)
        console.log(`✅ Loaded ${result.count} news items for ${targetSymbol}`)
        console.log(`📊 Sentiment: ${result.sentiment.aggregate.overall}`)
      }

    } catch (error: any) {
      console.error('❌ Error fetching stock news:', error)
      alert(`❌ Failed to fetch news: ${error.message}`)
    } finally {
      setIsFetchingNews(false)
    }
  }

  async function fetchMarketNews() {
    setIsFetchingNews(true)

    try {
      console.log('📰 Fetching market news...')

      const response = await fetch('/api/news/market')

      if (!response.ok) {
        throw new Error('Failed to fetch market news')
      }

      const result = await response.json()

      if (result.success && result.news) {
        setMarketNews(result.news)
        setMarketSentiment(result.sentiment)
        console.log(`✅ Loaded ${result.count} market news items`)
        console.log(`📊 Market Sentiment: ${result.sentiment.aggregate.overall}`)
      }

    } catch (error: any) {
      console.error('❌ Error fetching market news:', error)
      alert(`❌ Failed to fetch market news: ${error.message}`)
    } finally {
      setIsFetchingNews(false)
    }
  }

  async function fetchFundamentals() {
    const symbol = fundamentalSymbol.trim().toUpperCase()

    if (!symbol) {
      alert('⚠️ Please enter a stock symbol')
      return
    }

    setIsFetchingFundamentals(true)
    setFundamentalData(null)
    setFundamentalScore(null)

    try {
      console.log(`📊 Fetching fundamentals for ${symbol}...`)

      const response = await fetch(`/api/fundamentals/quote?symbol=${symbol}&exchange=${fundamentalExchange}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch fundamentals')
      }

      const result = await response.json()

      if (result.success && result.data) {
        setFundamentalData(result.data)

        const score = calculateFundamentalScore(result.data)
        setFundamentalScore(score)

        console.log(`✅ ${symbol} fundamentals loaded`)
        console.log(`   Score: ${score.overall}/100 (${score.rating})`)

        fetchMultiLayerNews(symbol)
      } else {
        throw new Error('No data received')
      }

    } catch (error: any) {
      console.error('❌ Error fetching fundamentals:', error)

      let errorMessage = error.message || 'Unknown error'
      let suggestion = 'Try different exchange (NSE/BSE) or check symbol spelling.'

      if (error.message.includes('Failed to fetch fundamental data')) {
        errorMessage = `Could not fetch data for ${symbol}`
        suggestion = 'This could be due to:\n• Invalid symbol name\n• Yahoo Finance API issue\n• Network connectivity\n• Symbol not available on selected exchange\n\nCheck browser console for detailed error logs.'
      }

      alert(`❌ ${errorMessage}\n\n${suggestion}`)
    } finally {
      setIsFetchingFundamentals(false)
    }
  }

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Search Section */}
      <div className="screener-results" style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '15px' }}>📊 Fundamental Analysis</h3>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '20px' }}>
          Fundamental data, valuation metrics and recent news for a stock. Information only: nothing here is a buy or sell signal
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={fundamentalSymbol}
            onChange={(e) => setFundamentalSymbol(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && fetchFundamentals()}
            placeholder="Enter Stock Symbol (e.g., RELIANCE, TCS)"
            style={{
              flex: '1',
              minWidth: '250px',
              padding: '12px',
              fontSize: '15px'
            }}
          />
          <select
            value={fundamentalExchange}
            onChange={(e) => setFundamentalExchange(e.target.value as 'NSE' | 'BSE')}
            style={{ padding: '12px', fontSize: '15px' }}
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
          <button
            onClick={fetchFundamentals}
            disabled={isFetchingFundamentals || !fundamentalSymbol}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              fontWeight: 'bold',
              background: isFetchingFundamentals
                ? 'rgba(255, 255, 255, 0.2)'
                : 'linear-gradient(45deg, #667eea, #764ba2)',
              cursor: isFetchingFundamentals || !fundamentalSymbol ? 'not-allowed' : 'pointer'
            }}
          >
            {isFetchingFundamentals ? '🔄 Analyzing...' : '📊 Analyze'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isFetchingFundamentals && (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          background: 'rgba(102, 126, 234, 0.1)',
          borderRadius: '15px',
          border: '2px solid rgba(102, 126, 234, 0.3)'
        }}>
          <div style={{ fontSize: '4em', marginBottom: '20px' }}>📊</div>
          <h3>Fetching Fundamental Data...</h3>
          <p style={{ opacity: 0.7, marginTop: '10px' }}>
            Analyzing valuation, profitability, financial health, and growth metrics
          </p>
        </div>
      )}

      {/* Fundamental Data Display */}
      {fundamentalData && fundamentalScore && !isFetchingFundamentals && (
        <div>
          {/* Company Header */}
          <div className="screener-results" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h2 style={{ fontSize: '2em', margin: 0, marginBottom: '5px', color: '#4facfe' }}>
                  {fundamentalData.symbol}
                </h2>
                <p style={{ fontSize: '1.1em', margin: 0, opacity: 0.8 }}>
                  {fundamentalData.companyName}
                </p>
                {fundamentalData.sector && (
                  <p style={{ fontSize: '0.9em', margin: 0, marginTop: '5px', opacity: 0.6 }}>
                    {fundamentalData.sector} • {getCompanySize(fundamentalData.marketCap)}
                  </p>
                )}
              </div>

              {/* Overall Score */}
              <div style={{
                padding: '20px 30px',
                background: fundamentalScore.overall >= 70
                  ? 'linear-gradient(135deg, rgba(0, 255, 100, 0.2), rgba(0, 255, 100, 0.1))'
                  : fundamentalScore.overall >= 50
                  ? 'linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 193, 7, 0.1))'
                  : 'linear-gradient(135deg, rgba(255, 0, 100, 0.2), rgba(255, 0, 100, 0.1))',
                border: `2px solid ${
                  fundamentalScore.overall >= 70 ? '#00ff64' :
                  fundamentalScore.overall >= 50 ? '#ffc107' : '#ff0064'
                }`,
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3em', fontWeight: 'bold', lineHeight: '1' }}>
                  {fundamentalScore.overall}
                </div>
                <div style={{ fontSize: '0.9em', opacity: 0.8, marginTop: '5px' }}>
                  out of 100
                </div>
                <div style={{
                  fontSize: '1.2em',
                  fontWeight: 'bold',
                  marginTop: '10px',
                  color: fundamentalScore.overall >= 70 ? '#00ff64' :
                         fundamentalScore.overall >= 50 ? '#ffc107' : '#ff0064'
                }}>
                  {fundamentalScore.rating}
                </div>
              </div>
            </div>
          </div>

          {/* Category Scores */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div className="card">
              <h4 style={{ marginBottom: '10px', color: '#4facfe' }}>💰 Valuation</h4>
              <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.valuation}/100</div>
              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                P/E, P/B, Dividend Yield
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '10px', color: '#00ff64' }}>📈 Profitability</h4>
              <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.profitability}/100</div>
              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                ROE, Profit Margins
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '10px', color: '#ffc107' }}>🏦 Financial Health</h4>
              <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.financial_health}/100</div>
              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                Debt, Liquidity Ratios
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '10px', color: '#8a2be2' }}>🚀 Growth</h4>
              <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{fundamentalScore.growth}/100</div>
              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                Revenue, Earnings Growth
              </div>
            </div>
          </div>

          {/* Key Insights */}
          {fundamentalScore.reasons.length > 0 && (
            <div className="screener-results" style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '15px' }}>💡 Key Insights</h4>
              <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                {fundamentalScore.reasons.map((reason: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed Metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '20px',
            marginBottom: '20px'
          }}>
            {/* Valuation Metrics */}
            <div className="card">
              <h4 style={{ marginBottom: '15px', color: '#4facfe' }}>💰 Valuation Metrics</h4>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                  <span style={{ opacity: 0.7 }}>Market Cap:</span>
                  <strong>{formatLargeNumber(fundamentalData.marketCap)}</strong>
                </div>
                {fundamentalData.peRatio && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>P/E Ratio:</span>
                    <strong>{fundamentalData.peRatio.toFixed(2)}</strong>
                  </div>
                )}
                {fundamentalData.pbRatio && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>P/B Ratio:</span>
                    <strong>{fundamentalData.pbRatio.toFixed(2)}</strong>
                  </div>
                )}
                {fundamentalData.dividendYield && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Dividend Yield:</span>
                    <strong>{(fundamentalData.dividendYield * 100).toFixed(2)}%</strong>
                  </div>
                )}
                {fundamentalData.eps && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>EPS:</span>
                    <strong>₹{fundamentalData.eps.toFixed(2)}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Profitability Metrics */}
            <div className="card">
              <h4 style={{ marginBottom: '15px', color: '#00ff64' }}>📈 Profitability</h4>
              <div style={{ display: 'grid', gap: '10px' }}>
                {fundamentalData.roe && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>ROE:</span>
                    <strong style={{ color: fundamentalData.roe > 0.15 ? '#00ff64' : '#fff' }}>
                      {(fundamentalData.roe * 100).toFixed(2)}%
                    </strong>
                  </div>
                )}
                {fundamentalData.profitMargin && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Profit Margin:</span>
                    <strong>{(fundamentalData.profitMargin * 100).toFixed(2)}%</strong>
                  </div>
                )}
                {fundamentalData.operatingMargin && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Operating Margin:</span>
                    <strong>{(fundamentalData.operatingMargin * 100).toFixed(2)}%</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Health */}
            <div className="card">
              <h4 style={{ marginBottom: '15px', color: '#ffc107' }}>🏦 Financial Health</h4>
              <div style={{ display: 'grid', gap: '10px' }}>
                {fundamentalData.debtToEquity !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Debt/Equity:</span>
                    <strong style={{ color: fundamentalData.debtToEquity < 0.5 ? '#00ff64' : fundamentalData.debtToEquity > 2 ? '#ff0064' : '#fff' }}>
                      {fundamentalData.debtToEquity.toFixed(2)}
                    </strong>
                  </div>
                )}
                {fundamentalData.currentRatio && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Current Ratio:</span>
                    <strong>{fundamentalData.currentRatio.toFixed(2)}</strong>
                  </div>
                )}
                {fundamentalData.quickRatio && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Quick Ratio:</span>
                    <strong>{fundamentalData.quickRatio.toFixed(2)}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Growth Metrics */}
            <div className="card">
              <h4 style={{ marginBottom: '15px', color: '#8a2be2' }}>🚀 Growth</h4>
              <div style={{ display: 'grid', gap: '10px' }}>
                {fundamentalData.revenueGrowth && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Revenue Growth:</span>
                    <strong style={{ color: fundamentalData.revenueGrowth > 0.15 ? '#00ff64' : fundamentalData.revenueGrowth < 0 ? '#ff0064' : '#fff' }}>
                      {(fundamentalData.revenueGrowth * 100).toFixed(2)}%
                    </strong>
                  </div>
                )}
                {fundamentalData.earningsGrowth && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ opacity: 0.7 }}>Earnings Growth:</span>
                    <strong style={{ color: fundamentalData.earningsGrowth > 0.15 ? '#00ff64' : fundamentalData.earningsGrowth < 0 ? '#ff0064' : '#fff' }}>
                      {(fundamentalData.earningsGrowth * 100).toFixed(2)}%
                    </strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Market Data */}
          <div className="screener-results">
            <h4 style={{ marginBottom: '15px' }}>📊 Market Data</h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px'
            }}>
              {fundamentalData.fiftyTwoWeekHigh && (
                <div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>52-Week High</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{fundamentalData.fiftyTwoWeekHigh.toFixed(2)}</div>
                </div>
              )}
              {fundamentalData.fiftyTwoWeekLow && (
                <div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>52-Week Low</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>₹{fundamentalData.fiftyTwoWeekLow.toFixed(2)}</div>
                </div>
              )}
              {fundamentalData.beta && (
                <div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Beta</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>{fundamentalData.beta.toFixed(2)}</div>
                </div>
              )}
              {fundamentalData.averageVolume && (
                <div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '5px' }}>Avg Volume</div>
                  <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                    {(fundamentalData.averageVolume / 1000000).toFixed(2)}M
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* News Section */}
          <div className="screener-results" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0 }}>📰 Latest News</h4>

              {/* News Type Tabs */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setNewsTab('multi')
                    if (!multiLayerNews) fetchMultiLayerNews()
                  }}
                  style={{
                    padding: '8px 16px',
                    background: newsTab === 'multi' ? 'linear-gradient(45deg, #f093fb, #f5576c)' : 'rgba(255, 255, 255, 0.1)',
                    border: newsTab === 'multi' ? '2px solid #f5576c' : '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: newsTab === 'multi' ? 'bold' : 'normal'
                  }}
                >
                  🎯 Multi-Layer Analysis
                </button>
                <button
                  onClick={() => {
                    setNewsTab('stock')
                    if (stockNews.length === 0) fetchStockNews()
                  }}
                  style={{
                    padding: '8px 16px',
                    background: newsTab === 'stock' ? 'linear-gradient(45deg, #667eea, #764ba2)' : 'rgba(255, 255, 255, 0.1)',
                    border: newsTab === 'stock' ? '2px solid #667eea' : '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: newsTab === 'stock' ? 'bold' : 'normal'
                  }}
                >
                  📰 {fundamentalData.symbol} News
                </button>
                <button
                  onClick={() => {
                    setNewsTab('market')
                    if (marketNews.length === 0) fetchMarketNews()
                  }}
                  style={{
                    padding: '8px 16px',
                    background: newsTab === 'market' ? 'linear-gradient(45deg, #667eea, #764ba2)' : 'rgba(255, 255, 255, 0.1)',
                    border: newsTab === 'market' ? '2px solid #667eea' : '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: newsTab === 'market' ? 'bold' : 'normal'
                  }}
                >
                  🌍 Market News
                </button>
                <button
                  onClick={() => {
                    if (newsTab === 'multi') fetchMultiLayerNews()
                    else if (newsTab === 'stock') fetchStockNews()
                    else fetchMarketNews()
                  }}
                  disabled={isFetchingNews}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    cursor: isFetchingNews ? 'not-allowed' : 'pointer',
                    opacity: isFetchingNews ? 0.5 : 1
                  }}
                >
                  {isFetchingNews ? '🔄' : '🔄 Refresh'}
                </button>
              </div>
            </div>

            {/* News Loading State */}
            {isFetchingNews && (
              <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.7 }}>
                <div style={{ fontSize: '2em', marginBottom: '10px' }}>📰</div>
                <div>Fetching latest news...</div>
              </div>
            )}

            {/* Multi-Layer Sentiment Analysis */}
            {!isFetchingNews && newsTab === 'multi' && multiLayerNews && (() => {
              const combined = multiLayerNews.combinedSentiment;
              const color = combined.overall === 'POSITIVE' ? '#00ff64' : combined.overall === 'NEGATIVE' ? '#ff0064' : '#888888';
              const emoji = combined.overall === 'POSITIVE' ? '🚀' : combined.overall === 'NEGATIVE' ? '💥' : '😐';

              return (
                <div style={{ marginBottom: '20px' }}>
                  {/* Combined Sentiment Header */}
                  <div style={{
                    padding: '25px',
                    background: `linear-gradient(135deg, ${color}20, ${color}10)`,
                    border: `3px solid ${color}`,
                    borderRadius: '15px',
                    marginBottom: '15px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                          <span style={{ fontSize: '3em' }}>{emoji}</span>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.8em', color }}>
                              {combined.overall} COMBINED SENTIMENT
                            </h3>
                            <p style={{ margin: '5px 0 0 0', fontSize: '1em', opacity: 0.9 }}>
                              {combined.reasoning}
                            </p>
                          </div>
                        </div>

                        {/* Layer Breakdown */}
                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
                          <div style={{ flex: 1, minWidth: '150px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>📰 STOCK NEWS</div>
                            <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                              {multiLayerNews.stockNews.sentiment.aggregate.overall}
                            </div>
                            <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                              Score: {combined.layers.stock.toFixed(2)}
                            </div>
                          </div>

                          {multiLayerNews.sectorNews && (
                            <div style={{ flex: 1, minWidth: '150px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                              <div style={{ fontSize: '0.85em', opacity: 0.7 }}>🏢 SECTOR NEWS</div>
                              <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                                {multiLayerNews.sectorNews.sentiment.aggregate.overall}
                              </div>
                              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                                {multiLayerNews.sectorNews.sector} / {multiLayerNews.sectorNews.industry}
                              </div>
                              <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                                Score: {combined.layers.sector.toFixed(2)}
                              </div>
                            </div>
                          )}

                          {multiLayerNews.macroNews && (
                            <div style={{ flex: 1, minWidth: '150px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                              <div style={{ fontSize: '0.85em', opacity: 0.7 }}>🌍 MACRO NEWS</div>
                              <div style={{ fontSize: '1.3em', fontWeight: 'bold', marginTop: '5px' }}>
                                {multiLayerNews.macroNews.sentiment.aggregate.overall}
                              </div>
                              <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '5px' }}>
                                {multiLayerNews.macroNews.affectedFactors[0]}
                              </div>
                              <div style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>
                                Score: {combined.layers.macro.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detailed News by Layer */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                    {/* Stock News */}
                    <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>📰 Stock-Specific News ({multiLayerNews.stockNews.news.length})</h5>
                      {multiLayerNews.stockNews.news.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} style={{ fontSize: '0.85em', padding: '8px 0', borderBottom: idx < 2 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{item.sentiment.emoji} {item.title.substring(0, 60)}...</div>
                          <div style={{ opacity: 0.6, fontSize: '0.9em' }}>{item.source}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sector News */}
                    {multiLayerNews.sectorNews && (
                      <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>🏢 Sector News ({multiLayerNews.sectorNews.news.length})</h5>
                        {multiLayerNews.sectorNews.news.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} style={{ fontSize: '0.85em', padding: '8px 0', borderBottom: idx < 2 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{item.sentiment.emoji} {item.title.substring(0, 60)}...</div>
                            <div style={{ opacity: 0.6, fontSize: '0.9em' }}>{item.source}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Macro News */}
                    {multiLayerNews.macroNews && (
                      <div style={{ padding: '15px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <h5 style={{ margin: '0 0 10px 0', fontSize: '1.1em' }}>🌍 Macro News ({multiLayerNews.macroNews.news.length})</h5>
                        {multiLayerNews.macroNews.news.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} style={{ fontSize: '0.85em', padding: '8px 0', borderBottom: idx < 2 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{item.sentiment.emoji} {item.title.substring(0, 60)}...</div>
                            <div style={{ opacity: 0.6, fontSize: '0.9em' }}>{item.source}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Sentiment Summary Card (for stock/market tabs) */}
            {!isFetchingNews && newsTab !== 'multi' && (newsTab === 'stock' ? stockSentiment : marketSentiment) && (newsTab === 'stock' ? stockNews : marketNews).length > 0 && (() => {
              const sentiment = newsTab === 'stock' ? stockSentiment : marketSentiment;
              const aggregate = sentiment.aggregate;

              return (
                <div style={{
                  padding: '20px',
                  background: `linear-gradient(135deg, ${aggregate.color}20, ${aggregate.color}10)`,
                  border: `2px solid ${aggregate.color}`,
                  borderRadius: '15px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '2.5em' }}>{aggregate.emoji}</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.5em', color: aggregate.color }}>
                            {aggregate.overall} SENTIMENT
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.9em', opacity: 0.8 }}>
                            {aggregate.description}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '20px', fontSize: '0.9em', marginTop: '10px' }}>
                        <span style={{ color: '#00ff64' }}>📈 {aggregate.positive} Positive</span>
                        <span style={{ color: '#ff0064' }}>📉 {aggregate.negative} Negative</span>
                        <span style={{ color: '#888888' }}>😐 {aggregate.neutral} Neutral</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* News List (only for stock/market tabs, not multi-layer) */}
            {!isFetchingNews && newsTab !== 'multi' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(newsTab === 'stock' ? stockNews : marketNews).length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.6 }}>
                    <div style={{ fontSize: '2em', marginBottom: '10px' }}>📰</div>
                    <div>No news articles loaded yet</div>
                    <div style={{ fontSize: '0.9em', marginTop: '10px' }}>
                      Click the {newsTab === 'stock' ? `"${fundamentalData.symbol} News"` : '"Market News"'} tab to load articles
                    </div>
                  </div>
                ) : (
                  (newsTab === 'stock' ? stockNews : marketNews).slice(0, 10).map((item: any, index: number) => (
                    <div key={index} style={{
                      padding: '15px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onClick={() => window.open(item.link, '_blank')}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                    }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <h5 style={{
                              margin: 0,
                              fontSize: '1.05em',
                              color: '#4facfe',
                              fontWeight: 'bold',
                              flex: 1
                            }}>
                              {item.title}
                            </h5>
                            {item.sentiment && (
                              <span style={{
                                padding: '4px 12px',
                                background: `${item.sentiment.color}20`,
                                border: `1px solid ${item.sentiment.color}`,
                                borderRadius: '12px',
                                fontSize: '0.75em',
                                fontWeight: 'bold',
                                color: item.sentiment.color,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                whiteSpace: 'nowrap'
                              }}>
                                <span>{item.sentiment.emoji}</span>
                                <span>{item.sentiment.label}</span>
                              </span>
                            )}
                          </div>
                          {item.snippet && (
                            <p style={{
                              margin: 0,
                              marginBottom: '8px',
                              fontSize: '0.9em',
                              opacity: 0.7,
                              lineHeight: '1.4'
                            }}>
                              {item.snippet}
                            </p>
                          )}
                          <div style={{
                            display: 'flex',
                            gap: '15px',
                            fontSize: '0.85em',
                            opacity: 0.6
                          }}>
                            <span>🏢 {item.source}</span>
                            <span>⏰ {new Date(item.pubDate).toLocaleDateString()} {new Date(item.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {item.sentiment && item.sentiment.confidence > 0 && (
                              <span>💡 {item.sentiment.confidence}% confidence</span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '1.5em', opacity: 0.5 }}>
                          🔗
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!fundamentalData && !isFetchingFundamentals && (
        <div style={{
          marginTop: '30px',
          padding: '60px 20px',
          textAlign: 'center',
          background: 'rgba(102, 126, 234, 0.05)',
          border: '2px dashed rgba(102, 126, 234, 0.3)',
          borderRadius: '15px'
        }}>
          <div style={{ fontSize: '4em', marginBottom: '15px' }}>📊</div>
          <h3 style={{ marginBottom: '10px' }}>Ready to Analyze Fundamentals</h3>
          <p style={{ fontSize: '1.1em', opacity: 0.8, marginBottom: '20px' }}>
            Enter a stock symbol above to get comprehensive fundamental analysis!
          </p>
          <div style={{
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '10px',
            display: 'inline-block',
            textAlign: 'left'
          }}>
            <h4 style={{ marginBottom: '10px' }}>💡 What You'll Get:</h4>
            <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>Valuation Metrics:</strong> Market Cap, P/E, P/B, Dividend Yield</li>
              <li><strong>Profitability:</strong> ROE, Profit Margins, Operating Margins</li>
              <li><strong>Financial Health:</strong> Debt/Equity, Current Ratio, Quick Ratio</li>
              <li><strong>Growth:</strong> Revenue Growth, Earnings Growth</li>
              <li><strong>Overall Score:</strong> 0-100 rating (EXCELLENT → VERY POOR)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
})
