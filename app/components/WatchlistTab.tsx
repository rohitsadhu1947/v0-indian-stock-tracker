'use client'

import React, { memo } from 'react'
import { useWatchlistStore, type StockData } from '@/lib/stores/watchlist-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { generateTradingSignal } from '@/lib/market-utils'

function StockCard({ stock, onRemove }: { stock: StockData; onRemove: (symbol: string) => void }) {
  const changeClass = stock.change >= 0 ? 'positive' : 'negative'
  const analysis = generateTradingSignal(stock.current, stock.prices, stock.volumes)
  const signalClass = analysis.signal.includes('BUY')
    ? 'buy-signal'
    : analysis.signal.includes('SELL')
    ? 'sell-signal'
    : 'hold-signal'

  return (
    <div className="card">
      <div className="stock-header">
        <span className="stock-symbol">{stock.name}</span>
        <button className="remove-btn" onClick={() => onRemove(stock.symbol)}>
          Remove
        </button>
      </div>
      <div className="stock-price">₹{stock.current.toFixed(2)}</div>
      <span className={`price-change ${changeClass}`}>
        {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.change).toFixed(2)}(
        {stock.changePercent.toFixed(2)}%)
      </span>

      <div className="indicators">
        <div className="indicator">
          <div className="indicator-label">RSI (14)</div>
          <div className="indicator-value">{analysis.indicators.rsi}</div>
        </div>
        <div className="indicator">
          <div className="indicator-label">MACD</div>
          <div className="indicator-value">{analysis.indicators.macd}</div>
        </div>
        <div className="indicator">
          <div className="indicator-label">Day Range</div>
          <div className="indicator-value">
            ₹{stock.dayLow.toFixed(2)} - ₹{stock.dayHigh.toFixed(2)}
          </div>
        </div>
        <div className="indicator">
          <div className="indicator-label">Volume</div>
          <div className="indicator-value">{(stock.volume / 1000000).toFixed(2)}M</div>
        </div>
      </div>

      <div className={`signal-box ${signalClass}`}>
        <h3>{analysis.signal}</h3>
        <p style={{ fontSize: '0.9em', marginTop: '8px' }}>{analysis.reason}</p>
        <div className="signal-strength">
          {Array(5)
            .fill('')
            .map((_, i) => (
              <div
                key={i}
                className={`strength-bar ${i < analysis.strength ? 'filled' : ''}`}
              />
            ))}
        </div>
      </div>

      <div
        style={{ textAlign: 'center', marginTop: '10px', color: 'rgba(255,255,255,0.5)', fontSize: '0.85em' }}
      >
        Updated: {stock.timestamp}
      </div>
    </div>
  )
}

const MemoStockCard = memo(StockCard)

export default memo(function WatchlistTab() {
  const { watchlist, stockData, setWatchlist, setStockData, exchange } = useWatchlistStore()
  const { authStatus } = useAuthStore()

  async function removeFromWatchlist(symbol: string) {
    if (authStatus.authenticated) {
      try {
        await fetch('/api/watchlist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, exchange }),
        })
      } catch (err) {
        console.error('Error removing from watchlist:', err)
      }
    }
    setWatchlist(watchlist.filter((s) => s !== symbol))
    const newData = { ...stockData }
    delete newData[symbol]
    setStockData(newData)
  }

  return (
    <div>
      <div className="watchlist">
        <h3>Your Watchlist</h3>
        <div>
          {watchlist.map((symbol) => {
            const data = stockData[symbol]
            if (!data)
              return (
                <div key={symbol} className="watchlist-item">
                  <strong>{symbol}</strong>
                  <span>Loading...</span>
                </div>
              )
            const changeClass = data.change >= 0 ? 'positive' : 'negative'
            return (
              <div key={symbol} className="watchlist-item">
                <div>
                  <strong>{symbol}</strong>
                  <span style={{ marginLeft: '15px' }}>₹{data.current.toFixed(2)}</span>
                </div>
                <span className={`price-change ${changeClass}`}>
                  {data.changePercent.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="dashboard">
        {watchlist.map((symbol) => {
          const data = stockData[symbol]
          if (!data)
            return (
              <div key={symbol} className="card">
                <div className="loading">Loading {symbol}...</div>
              </div>
            )
          return <MemoStockCard key={symbol} stock={data} onRemove={removeFromWatchlist} />
        })}
      </div>
    </div>
  )
})
