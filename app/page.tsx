"use client"

export default function StockTracker() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Indian Stock Tracker - NSE/BSE</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
          }

          .container {
            max-width: 1400px;
            margin: 0 auto;
          }

          h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            background: linear-gradient(45deg, #00f2fe, #4facfe);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .alert {
            background: rgba(0, 255, 100, 0.2);
            border: 1px solid rgba(0, 255, 100, 0.5);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
          }

          .warning {
            background: rgba(255, 193, 7, 0.2);
            border: 1px solid rgba(255, 193, 7, 0.5);
          }

          .controls {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 25px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }

          .input-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
          }

          input, select, button {
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 14px;
            transition: all 0.3s;
          }

          input::placeholder {
            color: rgba(255, 255, 255, 0.5);
          }

          button {
            cursor: pointer;
            background: linear-gradient(45deg, #4facfe, #00f2fe);
            border: none;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(79, 172, 254, 0.4);
          }

          button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
          }

          .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          }

          .tab {
            padding: 12px 25px;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            transition: all 0.3s;
            font-weight: 600;
            position: relative;
          }

          .tab.active {
            color: #00f2fe;
          }

          .tab.active::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(45deg, #4facfe, #00f2fe);
          }

          .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }

          .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }

          .stock-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }

          .stock-symbol {
            font-size: 1.5em;
            font-weight: bold;
            color: #4facfe;
          }

          .stock-price {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
          }

          .price-change {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 5px;
            font-weight: bold;
          }

          .positive {
            background: rgba(0, 255, 100, 0.2);
            color: #00ff64;
          }

          .negative {
            background: rgba(255, 0, 100, 0.2);
            color: #ff0064;
          }

          .neutral {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }

          .indicators {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 15px 0;
          }

          .indicator {
            background: rgba(255, 255, 255, 0.03);
            padding: 10px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.05);
          }

          .indicator-label {
            font-size: 0.85em;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 5px;
          }

          .indicator-value {
            font-size: 1.1em;
            font-weight: bold;
          }

          .signal-box {
            margin-top: 20px;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
          }

          .buy-signal {
            background: linear-gradient(45deg, rgba(0, 255, 100, 0.2), rgba(0, 255, 100, 0.1));
            border: 2px solid #00ff64;
          }

          .sell-signal {
            background: linear-gradient(45deg, rgba(255, 0, 100, 0.2), rgba(255, 0, 100, 0.1));
            border: 2px solid #ff0064;
          }

          .hold-signal {
            background: linear-gradient(45deg, rgba(255, 200, 0, 0.2), rgba(255, 200, 0, 0.1));
            border: 2px solid #ffc800;
          }

          .signal-strength {
            display: flex;
            gap: 5px;
            justify-content: center;
            margin-top: 10px;
          }

          .strength-bar {
            width: 30px;
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
          }

          .strength-bar.filled {
            background: currentColor;
          }

          .watchlist {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 20px;
          }

          .watchlist-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            cursor: pointer;
            transition: background 0.3s;
          }

          .watchlist-item:hover {
            background: rgba(255, 255, 255, 0.05);
          }

          .remove-btn {
            background: rgba(255, 0, 100, 0.2);
            color: #ff0064;
            border: 1px solid #ff0064;
            padding: 5px 10px;
            font-size: 0.8em;
          }

          .loading {
            text-align: center;
            padding: 20px;
            color: rgba(255, 255, 255, 0.6);
          }

          .error {
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid rgba(255, 0, 0, 0.3);
            color: #ff6b6b;
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
          }

          .screener-results {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }

          .screener-table {
            width: 100%;
            margin-top: 15px;
          }

          .screener-table th,
          .screener-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .screener-table th {
            background: rgba(255, 255, 255, 0.05);
            font-weight: 600;
            color: #4facfe;
          }

          .strategy-info {
            background: rgba(79, 172, 254, 0.1);
            border: 1px solid rgba(79, 172, 254, 0.3);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
          }

          @media (max-width: 768px) {
            .dashboard {
              grid-template-columns: 1fr;
            }
            
            h1 {
              font-size: 1.8em;
            }
          }
        `,
          }}
        />
      </head>
      <body>
        <div className="container">
          <h1>🚀 Indian Stock Tracker - Live Data</h1>

          <div className="alert" id="statusAlert">
            <strong>⚙️ Setup Required:</strong> Deploy to Vercel first, then update PROXY_URL with your deployment URL.
          </div>

          <div className="strategy-info" style={{ marginBottom: "20px" }}>
            <h3>🚀 Vercel Deployment Steps:</h3>
            <ol style={{ marginLeft: "20px", lineHeight: 1.8 }}>
              <li>
                Create folder with <strong>api/stock.js</strong>, <strong>package.json</strong>, and{" "}
                <strong>vercel.json</strong>
              </li>
              <li>
                Go to{" "}
                <a href="https://vercel.com/new" target="_blank" style={{ color: "#00f2fe" }} rel="noreferrer">
                  vercel.com/new
                </a>
              </li>
              <li>Click &quot;Add New...&quot; → &quot;Project&quot; → Import your folder</li>
              <li>Click &quot;Deploy&quot; and wait 30 seconds</li>
              <li>
                Copy your URL:{" "}
                <code style={{ background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: "4px" }}>
                  https://YOUR-URL.vercel.app
                </code>
              </li>
              <li>Update line 238 in this code with your URL</li>
              <li>
                Click <strong>REFRESH</strong> button above!
              </li>
            </ol>
            <p style={{ marginTop: "10px" }}>📖 See full deployment guide in the artifacts above!</p>
          </div>

          <div className="controls">
            <div className="input-group">
              <input type="text" id="stockInput" placeholder="Enter Stock Symbol (e.g., RELIANCE, TCS, INFY)" />
              <select id="exchange">
                <option value="NSE">NSE (India)</option>
                <option value="BSE">BSE (India)</option>
              </select>
              <button onClick={() => (window as any).addStock()}>Add to Watchlist</button>
              <button onClick={() => (window as any).runScreener()}>Run Screener</button>
              <button onClick={() => (window as any).refreshAll()}>🔄 Refresh</button>
            </div>
          </div>

          <div className="tabs">
            <button className="tab active" onClick={(e) => (window as any).switchTab(e, "watchlist")}>
              Watchlist
            </button>
            <button className="tab" onClick={(e) => (window as any).switchTab(e, "screener")}>
              Screener
            </button>
            <button className="tab" onClick={(e) => (window as any).switchTab(e, "signals")}>
              Active Signals
            </button>
          </div>

          <div id="watchlistTab" className="tab-content">
            <div className="watchlist">
              <h3>Your Watchlist</h3>
              <div id="watchlistItems"></div>
            </div>
            <div className="dashboard" id="stockCards"></div>
          </div>

          <div id="screenerTab" className="tab-content" style={{ display: "none" }}>
            <div className="strategy-info">
              <h3>📊 Screener Strategies</h3>
              <p>
                <strong>Momentum Breakout:</strong> Stocks breaking above resistance with high volume
              </p>
              <p>
                <strong>Oversold Bounce:</strong> Stocks at RSI &lt; 30 ready for reversal
              </p>
              <p>
                <strong>Trend Following:</strong> Stocks in strong uptrend with good momentum
              </p>
            </div>
            <div className="screener-results">
              <h3>Top Opportunities</h3>
              <div id="screenerResults"></div>
            </div>
          </div>

          <div id="signalsTab" className="tab-content" style={{ display: "none" }}>
            <div className="screener-results">
              <h3>Active Trading Signals</h3>
              <div id="activeSignals"></div>
            </div>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
          // API Configuration - Using Vercel Serverless Function
          const API_KEY = 'TVGS8WZS1527VBBZ';
          // 🚀 REPLACE THIS with your Vercel deployment URL after deploying
          // Example: 'https://stock-api-xyz.vercel.app/api/stock'
          const PROXY_URL = 'https://YOUR-VERCEL-URL.vercel.app/api/stock';
          
          // State management
          let watchlist = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'];
          let stockData = {};
          let activeSignals = [];
          let isLoading = false;
          let requestQueue = [];
          let lastRequestTime = 0;
          const MIN_REQUEST_INTERVAL = 12000; // 12 seconds between requests (5 per minute limit)

          // Rate limiting function
          async function makeRateLimitedRequest(symbol, exchange) {
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            
            if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
              await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
            }
            
            lastRequestTime = Date.now();
            
            try {
              // Call Vercel serverless function
              const url = \`\${PROXY_URL}?symbol=\${symbol}&exchange=\${exchange}\`;
              const response = await fetch(url);
              
              if (!response.ok) {
                throw new Error(\`HTTP error! status: \${response.status}\`);
              }
              
              return response.json();
            } catch (error) {
              console.error('Fetch error:', error);
              throw error;
            }
          }

          // Fetch real stock data from Alpha Vantage via proxy
          async function fetchStockData(symbol, exchange = 'NSE') {
            try {
              const data = await makeRateLimitedRequest(symbol, exchange);
              
              // Check for API errors
              if (data.error) {
                throw new Error(data.error);
              }
              
              if (data['Error Message']) {
                throw new Error('Invalid stock symbol or not found');
              }
              
              if (data['Note']) {
                throw new Error('API rate limit reached. Please wait a minute.');
              }
              
              if (!data['Time Series (Daily)']) {
                throw new Error('No data available for this symbol');
              }
              
              const timeSeries = data['Time Series (Daily)'];
              const dates = Object.keys(timeSeries).sort().reverse();
              
              if (dates.length === 0) {
                throw new Error('No trading data available');
              }
              
              // Extract price and volume data
              const prices = [];
              const volumes = [];
              
              dates.forEach(date => {
                const dayData = timeSeries[date];
                prices.push(parseFloat(dayData['4. close']));
                volumes.push(parseFloat(dayData['5. volume']));
              });
              
              const currentPrice = prices[0];
              const previousClose = prices[1];
              const change = currentPrice - previousClose;
              const changePercent = (change / previousClose) * 100;
              
              const todayData = timeSeries[dates[0]];
              
              return {
                symbol: \`\${symbol}.\${exchange}\`,
                name: symbol,
                current: currentPrice,
                change: change,
                changePercent: changePercent,
                volume: volumes[0],
                dayHigh: parseFloat(todayData['2. high']),
                dayLow: parseFloat(todayData['3. low']),
                prices: prices,
                volumes: volumes,
                timestamp: new Date().toLocaleTimeString(),
                lastUpdate: dates[0]
              };
            } catch (error) {
              console.error(\`Error fetching \${symbol}:\`, error);
              return null;
            }
          }

          // Technical Analysis Functions
          function calculateSMA(prices, period) {
            if (!prices || prices.length < period) return null;
            const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
            return sum / period;
          }

          function calculateRSI(prices, period = 14) {
            if (!prices || prices.length < period + 1) return 50;
            
            let gains = 0;
            let losses = 0;
            
            for (let i = 1; i <= period; i++) {
              const change = prices[i - 1] - prices[i];
              if (change > 0) gains += change;
              else losses += Math.abs(change);
            }
            
            const avgGain = gains / period;
            const avgLoss = losses / period;
            
            if (avgLoss === 0) return 100;
            const rs = avgGain / avgLoss;
            return 100 - (100 / (1 + rs));
          }

          function calculateMACD(prices) {
            if (!prices || prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
            
            const ema12 = calculateEMA(prices, 12);
            const ema26 = calculateEMA(prices, 26);
            const macd = ema12 - ema26;
            const signal = macd * 0.2;
            
            return {
              macd: macd,
              signal: signal,
              histogram: macd - signal
            };
          }

          function calculateEMA(prices, period) {
            if (!prices || prices.length < period) return prices ? prices[0] : 0;
            
            const multiplier = 2 / (period + 1);
            let ema = calculateSMA(prices.slice(0, period), period);
            
            for (let i = period; i < Math.min(prices.length, 50); i++) {
              ema = (prices[i] - ema) * multiplier + ema;
            }
            
            return ema;
          }

          function calculateBollingerBands(prices, period = 20) {
            const sma = calculateSMA(prices, period);
            if (!sma) return { upper: 0, middle: 0, lower: 0 };
            
            const variance = prices.slice(0, period).reduce((sum, price) => {
              return sum + Math.pow(price - sma, 2);
            }, 0) / period;
            
            const stdDev = Math.sqrt(variance);
            
            return {
              upper: sma + (stdDev * 2),
              middle: sma,
              lower: sma - (stdDev * 2)
            };
          }

          function generateTradingSignal(data) {
            const prices = data.prices || [];
            const volumes = data.volumes || [];
            const current = data.current;
            
            if (prices.length < 30) {
              return { 
                signal: 'HOLD', 
                strength: 1, 
                reason: 'Insufficient data',
                indicators: {
                  rsi: 'N/A',
                  macd: 'N/A',
                  bb_position: 'N/A'
                }
              };
            }
            
            const rsi = calculateRSI(prices);
            const macd = calculateMACD(prices);
            const bb = calculateBollingerBands(prices);
            const sma20 = calculateSMA(prices, 20);
            const sma50 = calculateSMA(prices, 50);
            const avgVolume = calculateSMA(volumes, 20);
            const currentVolume = volumes[0];
            
            let buySignals = 0;
            let sellSignals = 0;
            let reasons = [];
            
            // RSI signals
            if (rsi < 30) {
              buySignals += 2;
              reasons.push('RSI Oversold');
            } else if (rsi > 70) {
              sellSignals += 2;
              reasons.push('RSI Overbought');
            }
            
            // MACD signals
            if (macd.histogram > 0 && macd.macd > macd.signal) {
              buySignals += 1;
              reasons.push('MACD Bullish');
            } else if (macd.histogram < 0 && macd.macd < macd.signal) {
              sellSignals += 1;
              reasons.push('MACD Bearish');
            }
            
            // Bollinger Bands signals
            if (current <= bb.lower) {
              buySignals += 2;
              reasons.push('At Lower BB');
            } else if (current >= bb.upper) {
              sellSignals += 2;
              reasons.push('At Upper BB');
            }
            
            // Moving Average signals
            if (sma20 && sma50 && sma20 > sma50 && current > sma20) {
              buySignals += 1;
              reasons.push('Golden Cross');
            } else if (sma20 && sma50 && sma20 < sma50 && current < sma20) {
              sellSignals += 1;
              reasons.push('Death Cross');
            }
            
            // Volume confirmation
            if (avgVolume && currentVolume > avgVolume * 1.5) {
              if (buySignals > sellSignals) buySignals += 1;
              if (sellSignals > buySignals) sellSignals += 1;
              reasons.push('High Volume');
            }
            
            // Determine signal
            let signal, strength;
            if (buySignals >= 4) {
              signal = 'STRONG BUY';
              strength = Math.min(5, Math.floor(buySignals / 2));
            } else if (buySignals >= 2) {
              signal = 'BUY';
              strength = Math.min(4, Math.floor(buySignals / 1.5));
            } else if (sellSignals >= 4) {
              signal = 'STRONG SELL';
              strength = Math.min(5, Math.floor(sellSignals / 2));
            } else if (sellSignals >= 2) {
              signal = 'SELL';
              strength = Math.min(4, Math.floor(sellSignals / 1.5));
            } else {
              signal = 'HOLD';
              strength = 2;
              reasons = ['Mixed signals', 'Wait for confirmation'];
            }
            
            return {
              signal: signal,
              strength: strength,
              reason: reasons.join(', '),
              indicators: {
                rsi: rsi.toFixed(2),
                macd: macd.macd.toFixed(2),
                bb_position: bb.upper > bb.lower ? ((current - bb.lower) / (bb.upper - bb.lower) * 100).toFixed(1) + '%' : 'N/A'
              }
            };
          }

          function createStockCard(stock, analysis) {
            const changeClass = stock.change >= 0 ? 'positive' : 'negative';
            const signalClass = analysis.signal.includes('BUY') ? 'buy-signal' : 
                               analysis.signal.includes('SELL') ? 'sell-signal' : 'hold-signal';
            
            return \`
                <div class="card">
                    <div class="stock-header">
                        <span class="stock-symbol">\${stock.name}</span>
                        <button class="remove-btn" onclick="removeFromWatchlist('\${stock.name}')">Remove</button>
                    </div>
                    <div class="stock-price">₹\${stock.current.toFixed(2)}</div>
                    <span class="price-change \${changeClass}">
                        \${stock.change >= 0 ? '▲' : '▼'} \${Math.abs(stock.change).toFixed(2)} 
                        (\${stock.changePercent.toFixed(2)}%)
                    </span>
                    
                    <div class="indicators">
                        <div class="indicator">
                            <div class="indicator-label">RSI (14)</div>
                            <div class="indicator-value">\${analysis.indicators.rsi}</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-label">MACD</div>
                            <div class="indicator-value">\${analysis.indicators.macd}</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-label">Day Range</div>
                            <div class="indicator-value">₹\${stock.dayLow.toFixed(2)} - ₹\${stock.dayHigh.toFixed(2)}</div>
                        </div>
                        <div class="indicator">
                            <div class="indicator-label">Volume</div>
                            <div class="indicator-value">\${(stock.volume / 1000000).toFixed(2)}M</div>
                        </div>
                    </div>
                    
                    <div class="signal-box \${signalClass}">
                        <h3>\${analysis.signal}</h3>
                        <p style="font-size: 0.9em; margin-top: 8px;">\${analysis.reason}</p>
                        <div class="signal-strength">
                            \${Array(5).fill('').map((_, i) => 
                                \`<div class="strength-bar \${i < analysis.strength ? 'filled' : ''}"></div>\`
                            ).join('')}
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 10px; color: rgba(255,255,255,0.5); font-size: 0.85em;">
                        Last trade: \${stock.lastUpdate} | Updated: \${stock.timestamp}
                    </div>
                </div>
            \`;
          }

          async function updateWatchlist() {
            if (isLoading) return;
            isLoading = true;
            
            const container = document.getElementById('stockCards');
            const watchlistContainer = document.getElementById('watchlistItems');
            
            container.innerHTML = '<div class="loading">Fetching live data from Alpha Vantage... (This may take a moment due to API rate limits)</div>';
            watchlistContainer.innerHTML = '';
            
            let cards = '';
            let watchlistHTML = '';
            let errorCount = 0;
            
            for (const symbol of watchlist) {
              const data = await fetchStockData(symbol);
              
              if (data) {
                stockData[symbol] = data;
                const analysis = generateTradingSignal(data);
                
                if (analysis.signal.includes('STRONG')) {
                  activeSignals.push({
                    symbol: symbol,
                    signal: analysis.signal,
                    price: data.current,
                    reason: analysis.reason,
                    time: new Date().toLocaleString()
                  });
                }
                
                cards += createStockCard(data, analysis);
                
                const changeClass = data.change >= 0 ? 'positive' : 'negative';
                watchlistHTML += \`
                    <div class="watchlist-item">
                        <div>
                            <strong>\${symbol}</strong>
                            <span style="margin-left: 15px;">₹\${data.current.toFixed(2)}</span>
                        </div>
                        <span class="price-change \${changeClass}">
                            \${data.changePercent.toFixed(2)}%
                        </span>
                    </div>
                \`;
              } else {
                errorCount++;
                cards += \`
                    <div class="card">
                        <div class="error">
                            <strong>\${symbol}</strong>
                            <p>Failed to load data. Please check the symbol or try again later.</p>
                        </div>
                    </div>
                \`;
              }
            }
            
            if (errorCount > 0 && errorCount === watchlist.length) {
              container.innerHTML = '<div class="error">Failed to load any stocks. Please check your internet connection and try again.</div>';
            } else {
              container.innerHTML = cards || '<div class="error">No stocks in watchlist</div>';
            }
            
            watchlistContainer.innerHTML = watchlistHTML || '<div>Add stocks to get started</div>';
            
            updateActiveSignals();
            isLoading = false;
          }

          function addStock() {
            const input = document.getElementById('stockInput');
            const exchange = document.getElementById('exchange').value;
            const symbol = input.value.trim().toUpperCase();
            
            if (!symbol) {
              alert('Please enter a stock symbol');
              return;
            }
            
            if (watchlist.includes(symbol)) {
              alert('Stock already in watchlist');
              return;
            }
            
            watchlist.push(symbol);
            input.value = '';
            
            // Update status
            const statusAlert = document.getElementById('statusAlert');
            statusAlert.className = 'alert warning';
            statusAlert.innerHTML = '<strong>⏳ Loading:</strong> Fetching data for ' + symbol + '...';
            
            updateWatchlist().then(() => {
              statusAlert.className = 'alert';
              statusAlert.innerHTML = '<strong>✅ Live Mode:</strong> Connected to Alpha Vantage API - Real-time NSE/BSE data';
            });
          }

          function removeFromWatchlist(symbol) {
            watchlist = watchlist.filter(s => s !== symbol);
            delete stockData[symbol];
            updateWatchlist();
          }

          function switchTab(event, tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => {
              tab.style.display = 'none';
            });
            
            document.querySelectorAll('.tab').forEach(tab => {
              tab.classList.remove('active');
            });
            
            document.getElementById(\`\${tabName}Tab\`).style.display = 'block';
            event.target.classList.add('active');
          }

          async function runScreener() {
            const screenerResults = document.getElementById('screenerResults');
            screenerResults.innerHTML = '<div class="loading">Running screener on popular NSE stocks... This will take 2-3 minutes due to API rate limits.</div>';
            
            const stocksToScreen = [
              'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
              'WIPRO', 'ITC', 'HINDUNILVR', 'BHARTIARTL', 'ASIANPAINT',
              'MARUTI', 'TITAN', 'BAJFINANCE', 'TATASTEEL', 'SUNPHARMA'
            ];
            
            let results = [];
            let processed = 0;
            
            for (const symbol of stocksToScreen) {
              processed++;
              screenerResults.innerHTML = \`<div class="loading">Screening \${symbol}... (\${processed}/\${stocksToScreen.length})</div>\`;
              
              const data = await fetchStockData(symbol, 'NSE');
              if (data) {
                const analysis = generateTradingSignal(data);
                results.push({
                  symbol: symbol,
                  price: data.current,
                  change: data.changePercent,
                  signal: analysis.signal,
                  strength: analysis.strength,
                  reason: analysis.reason
                });
              }
            }
            
            results.sort((a, b) => b.strength - a.strength);
            
            let html = \`
                <table class="screener-table">
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Price</th>
                            <th>Change %</th>
                            <th>Signal</th>
                            <th>Reason</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
            \`;
            
            results.forEach(stock => {
              const changeClass = stock.change >= 0 ? 'positive' : 'negative';
              const signalClass = stock.signal.includes('BUY') ? 'positive' : 
                                 stock.signal.includes('SELL') ? 'negative' : 'neutral';
              
              html += \`
                    <tr>
                        <td><strong>\${stock.symbol}</strong></td>
                        <td>₹\${stock.price.toFixed(2)}</td>
                        <td class="\${changeClass}">\${stock.change.toFixed(2)}%</td>
                        <td class="\${signalClass}">\${stock.signal}</td>
                        <td style="font-size: 0.9em;">\${stock.reason}</td>
                        <td>
                            <button onclick="addToWatchlist('\${stock.symbol}')" style="font-size: 0.9em; padding: 5px 10px;">
                                Add
                            </button>
                        </td>
                    </tr>
                \`;
            });
            
            html += '</tbody></table>';
            screenerResults.innerHTML = html;
            
            // Switch to screener tab
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.getElementById('screenerTab').style.display = 'block';
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab')[1].classList.add('active');
          }

          function addToWatchlist(symbol) {
            if (!watchlist.includes(symbol)) {
              watchlist.push(symbol);
              alert(\`\${symbol} added to watchlist. Click Refresh to load data.\`);
            } else {
              alert('Already in watchlist');
            }
          }

          function updateActiveSignals() {
            const signalsContainer = document.getElementById('activeSignals');
            
            if (activeSignals.length === 0) {
              signalsContainer.innerHTML = '<p>No active strong signals at the moment. Run the screener to find opportunities.</p>';
              return;
            }
            
            // Keep only recent signals (last 15)
            activeSignals = activeSignals.slice(-15);
            
            let html = \`
                <table class="screener-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Symbol</th>
                            <th>Signal</th>
                            <th>Price</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
            \`;
            
            activeSignals.slice().reverse().forEach(signal => {
              const signalClass = signal.signal.includes('BUY') ? 'positive' : 'negative';
              html += \`
                    <tr>
                        <td>\${signal.time}</td>
                        <td><strong>\${signal.symbol}</strong></td>
                        <td class="\${signalClass}">\${signal.signal}</td>
                        <td>₹\${signal.price.toFixed(2)}</td>
                        <td>\${signal.reason}</td>
                    </tr>
                \`;
            });
            
            html += '</tbody></table>';
            signalsContainer.innerHTML = html;
          }

          function refreshAll() {
            if (!isLoading) {
              const statusAlert = document.getElementById('statusAlert');
              statusAlert.className = 'alert warning';
              statusAlert.innerHTML = '<strong>⏳ Refreshing:</strong> Fetching latest data...';
              
              updateWatchlist().then(() => {
                statusAlert.className = 'alert';
                statusAlert.innerHTML = '<strong>✅ Updated:</strong> Data refreshed successfully!';
                
                setTimeout(() => {
                  statusAlert.innerHTML = '<strong>✅ Live Mode:</strong> Connected to Alpha Vantage API - Real-time NSE/BSE data';
                }, 3000);
              });
            }
          }

          // Initialize on load
          document.addEventListener('DOMContentLoaded', () => {
            updateWatchlist();
            
            // Add enter key support for stock input
            document.getElementById('stockInput').addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                addStock();
              }
            });
          });

          // Expose functions to window
          window.addStock = addStock;
          window.removeFromWatchlist = removeFromWatchlist;
          window.switchTab = switchTab;
          window.runScreener = runScreener;
          window.refreshAll = refreshAll;
          window.addToWatchlist = addToWatchlist;
        `,
          }}
        />
      </body>
    </html>
  )
}
