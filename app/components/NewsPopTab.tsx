import { useState, useEffect } from 'react';
import { MasterScore } from '@/lib/master-scorer';

// Extended interface for News Pop signals
interface NewsPopSignal extends MasterScore {
  news: Array<{
    title: string;
    link: string;
    pubDate: string;
    source: string;
    snippet?: string;
    timestamp: number;
    sentiment: {
      label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
      score: number;
      comparative: number;
      confidence: number;
      emoji: string;
      color: string;
    };
  }>;
  newsSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  newsSentimentScore: number;
  volumeSpike: number;
  detectedAt: Date | string;
}

interface NewsPopTabProps {
  capitalAvailable: number;
  onExecuteTrade: (signal: NewsPopSignal, tradeType: string) => Promise<void>;
}

export default function NewsPopTab({ capitalAvailable, onExecuteTrade }: NewsPopTabProps) {
  const [newsPops, setNewsPops] = useState<NewsPopSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanTime, setNextScanTime] = useState<Date | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const [customSymbolInput, setCustomSymbolInput] = useState('');

  // Manual scan trigger
  const runScan = async (customSymbols?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      let url = `/api/scanner/news-pop?capital=${capitalAvailable}`;
      if (customSymbols) {
        url += `&customSymbols=${encodeURIComponent(customSymbols)}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setNewsPops(data.newsPops || []);
        setLastScanTime(new Date());
        
        // If auto-scan is enabled, calculate next scan time
        if (autoScan) {
          const next = new Date(Date.now() + 30 * 60 * 1000);
          setNextScanTime(next);
        }
        
        if (data.newsPops.length === 0) {
          console.log('📰 No news pops found');
        } else {
          console.log(`✅ Found ${data.newsPops.length} news pops`);
        }
      } else {
        throw new Error(data.error || 'Failed to scan');
      }
    } catch (err: any) {
      console.error('Error scanning for news pops:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-scan every 30 minutes
  useEffect(() => {
    if (autoScan) {
      runScan(); // Initial scan
      
      const interval = setInterval(() => {
        console.log('🔄 Auto-scanning for news pops...');
        runScan();
      }, 30 * 60 * 1000); // 30 minutes

      return () => clearInterval(interval);
    }
  }, [autoScan, capitalAvailable]);

  return (
    <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '2em', fontWeight: 'bold', marginBottom: '10px', color: '#FCD34D' }}>
          📰 News Pops Scanner
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '1.1em' }}>
          Real-time detection of news-driven price/volume spikes
        </p>
      </div>

      {/* Controls */}
      <div style={{ 
        display: 'flex', 
        gap: '20px', 
        marginBottom: '30px', 
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Manual Scan Button */}
        <button
          onClick={() => runScan()}
          disabled={isLoading}
          style={{
            padding: '15px 30px',
            background: isLoading 
              ? 'rgba(100, 100, 100, 0.5)' 
              : 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '1.1em',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1,
            transition: 'all 0.2s'
          }}
        >
          {isLoading ? '🔄 Scanning...' : '🔍 Scan Now'}
        </button>

        {/* Auto-Scan Toggle */}
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px',
          cursor: 'pointer',
          padding: '10px 20px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '10px',
          border: '2px solid rgba(255, 255, 255, 0.1)'
        }}>
          <input
            type="checkbox"
            checked={autoScan}
            onChange={(e) => setAutoScan(e.target.checked)}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '1em', fontWeight: '500' }}>
            Auto-scan every 30 minutes
          </span>
        </label>

        {/* Custom Symbol Input */}
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Enter symbol (e.g., SBIN, RELIANCE)"
            value={customSymbolInput}
            onChange={(e) => setCustomSymbolInput(e.target.value.toUpperCase())}
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
          <button
            onClick={() => {
              if (customSymbolInput) {
                runScan(customSymbolInput);
                setCustomSymbolInput('');
              }
            }}
            disabled={!customSymbolInput || isLoading}
            style={{
              padding: '12px 24px',
              background: customSymbolInput && !isLoading 
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' 
                : 'rgba(0, 0, 0, 0.3)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 'bold',
              cursor: customSymbolInput && !isLoading ? 'pointer' : 'not-allowed',
              opacity: customSymbolInput && !isLoading ? 1 : 0.5
            }}
          >
            Analyze
          </button>
        </div>
      </div>

      {/* Last Scan Info */}
      {lastScanTime && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <span style={{ color: '#94a3b8' }}>
              ⏱️ Last scan: <strong style={{ color: '#fff' }}>{lastScanTime.toLocaleTimeString()}</strong>
            </span>
            {autoScan && nextScanTime && (
              <span style={{ color: '#94a3b8' }}>
                🔄 Next scan: <strong style={{ color: '#FCD34D' }}>{nextScanTime.toLocaleTimeString()}</strong>
              </span>
            )}
          </div>
          <span style={{ color: '#FCD34D', fontWeight: 'bold' }}>
            {newsPops.length} news pops found
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ 
          padding: '20px', 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '2px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          marginBottom: '20px',
          color: '#EF4444'
        }}>
          ❌ Error: {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div style={{ 
          padding: '60px', 
          textAlign: 'center',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>🔄</div>
          <div style={{ fontSize: '1.3em', color: '#94a3b8' }}>
            Scanning for news-driven moves...
          </div>
          <div style={{ fontSize: '0.9em', color: '#64748b', marginTop: '10px' }}>
            Checking volume spikes, price moves, and fetching news
          </div>
        </div>
      )}

      {/* No Results */}
      {!isLoading && newsPops.length === 0 && lastScanTime && (
        <div style={{ 
          padding: '60px', 
          textAlign: 'center',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>📰</div>
          <div style={{ fontSize: '1.3em', color: '#94a3b8', marginBottom: '10px' }}>
            No news pops detected
          </div>
          <div style={{ fontSize: '0.9em', color: '#64748b' }}>
            Try scanning again in a few minutes or during market hours
          </div>
        </div>
      )}

      {/* News Pops Grid */}
      {!isLoading && newsPops.length > 0 && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {newsPops.map((pop, idx) => (
            <NewsPopCard
              key={`${pop.symbol}-${idx}`}
              pop={pop}
              rank={idx + 1}
              onExecute={() => onExecuteTrade(pop, 'NEWS_POP')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * News Pop Card Component
 */
function NewsPopCard({ pop, rank, onExecute }: { 
  pop: NewsPopSignal; 
  rank: number; 
  onExecute: () => void;
}) {
  const [showFullNews, setShowFullNews] = useState(false);

  // Determine if this is a BUY or SELL signal
  const isBuy = pop.newsSentiment === 'POSITIVE' && (pop as any).changePercent >= 0;
  const isSell = pop.newsSentiment === 'NEGATIVE' && (pop as any).changePercent < 0;
  const signalType = isBuy ? 'BUY' : isSell ? 'SELL' : 'WATCH';
  const signalColor = isBuy ? '#10B981' : isSell ? '#EF4444' : '#F59E0B';

  // Get tier color
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'HIGH_CONVICTION': return '#00ff64';
      case 'MODERATE': return '#FCD34D';
      case 'WATCH': return '#F59E0B';
      default: return '#888888';
    }
  };

  const tierColor = getTierColor(pop.tier);

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
      border: `2px solid ${tierColor}40`,
      borderRadius: '16px',
      padding: '25px',
      position: 'relative'
    }}>
      {/* Header: Symbol + Score + Signal */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        {/* Left: Symbol + Volume/Price Info */}
        <div style={{ flex: 1, minWidth: '250px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '1.8em', fontWeight: 'bold', margin: 0 }}>
              {pop.symbol}
            </h3>
            <span style={{
              background: signalColor,
              color: '#000',
              padding: '6px 16px',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '0.9em'
            }}>
              {signalType}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', fontSize: '0.9em', color: '#94a3b8' }}>
            <span>
              📈 Volume: <strong style={{ color: '#FCD34D' }}>{pop.volumeSpike?.toFixed(1) || 'N/A'}x</strong>
            </span>
            <span>
              💹 Price: <strong style={{ color: ((pop as any).changePercent || 0) >= 0 ? '#10B981' : '#EF4444' }}>
                {((pop as any).changePercent || 0) >= 0 ? '+' : ''}{((pop as any).changePercent || 0).toFixed(2)}%
              </strong>
            </span>
          </div>
        </div>

        {/* Right: Master Score */}
        <div style={{ 
          textAlign: 'right',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '15px 25px',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '0.8em', color: '#94a3b8', marginBottom: '5px' }}>
            MASTER SCORE
          </div>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: tierColor }}>
            {pop.totalScore}
          </div>
          <div style={{ fontSize: '0.8em', color: '#64748b' }}>
            {pop.tier.replace('_', ' ')}
          </div>
        </div>
      </div>

      {/* Top News Headline (Prominent) */}
      <div style={{
        background: `linear-gradient(135deg, ${pop.news[0]?.sentiment.color}20 0%, ${pop.news[0]?.sentiment.color}10 100%)`,
        border: `2px solid ${pop.news[0]?.sentiment.color}40`,
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
          <div style={{ fontSize: '2em' }}>
            {pop.news[0]?.sentiment.emoji || '📰'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontSize: '0.85em', 
              color: '#94a3b8', 
              marginBottom: '8px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>{pop.news[0]?.source}</span>
              <span>{new Date(pop.news[0]?.pubDate || '').toLocaleTimeString()}</span>
            </div>
            <div style={{ fontSize: '1.1em', fontWeight: '500', lineHeight: '1.5', marginBottom: '10px' }}>
              {pop.news[0]?.title}
            </div>
            {pop.news[0]?.snippet && (
              <div style={{ fontSize: '0.9em', color: '#94a3b8', lineHeight: '1.4' }}>
                {pop.news[0].snippet}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional News */}
      {pop.news.length > 1 && (
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => setShowFullNews(!showFullNews)}
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '10px 20px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.9em',
              width: '100%',
              textAlign: 'left'
            }}
          >
            {showFullNews ? '▼' : '▶'} {pop.news.length - 1} more news items ({pop.news.filter(n => n.sentiment.label === 'POSITIVE').length} positive, {pop.news.filter(n => n.sentiment.label === 'NEGATIVE').length} negative)
          </button>
          
          {showFullNews && (
            <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pop.news.slice(1, 6).map((news, idx) => (
                <div key={idx} style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: `1px solid ${news.sentiment.color}40`,
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '0.9em'
                }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span>{news.sentiment.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', marginBottom: '5px' }}>{news.title}</div>
                      <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                        {news.source} • {new Date(news.pubDate).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Score Breakdown */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '15px',
        marginBottom: '20px'
      }}>
        <ScoreCard
          label="Technical"
          score={pop.technical.score}
          maxScore={40}
          color="#3B82F6"
        />
        <ScoreCard
          label="Fundamental"
          score={pop.fundamental.score}
          maxScore={30}
          color="#8B5CF6"
        />
        <ScoreCard
          label="Intelligence"
          score={pop.intelligence.score}
          maxScore={30}
          color="#EC4899"
        />
      </div>

      {/* Trade Plan */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '0.9em', color: '#94a3b8', marginBottom: '15px', fontWeight: 'bold' }}>
          TRADE PLAN
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '5px' }}>Entry</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#FCD34D' }}>
              ₹{pop.tradePlan.entry.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '5px' }}>Stop Loss</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#EF4444' }}>
              ₹{pop.tradePlan.stopLoss.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '5px' }}>Target 1</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#10B981' }}>
              ₹{pop.tradePlan.target1.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '5px' }}>Target 2</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#10B981' }}>
              ₹{pop.tradePlan.target2.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '5px' }}>Quantity</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
              {pop.tradePlan.positionSize}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75em', opacity: 0.6, marginBottom: '5px' }}>Capital</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
              ₹{(pop.tradePlan.capitalRequired / 1000).toFixed(1)}k
            </div>
          </div>
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={onExecute}
        style={{
          width: '100%',
          padding: '18px',
          background: `linear-gradient(135deg, ${signalColor} 0%, ${signalColor}CC 100%)`,
          border: 'none',
          borderRadius: '12px',
          color: signalType === 'WATCH' ? '#000' : '#fff',
          fontWeight: 'bold',
          fontSize: '1.1em',
          cursor: 'pointer',
          transition: 'transform 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        📝 EXECUTE {signalType} TRADE
      </button>
    </div>
  );
}

/**
 * Score Card Component
 */
function ScoreCard({ label, score, maxScore, color }: { 
  label: string; 
  score: number; 
  maxScore: number; 
  color: string;
}) {
  const percentage = (score / maxScore) * 100;
  
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.2)',
      padding: '15px',
      borderRadius: '10px'
    }}>
      <div style={{ fontSize: '0.85em', color: '#94a3b8', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '10px' }}>
        <span style={{ fontSize: '1.8em', fontWeight: 'bold', color }}>
          {score}
        </span>
        <span style={{ fontSize: '0.9em', color: '#64748b' }}>
          /{maxScore}
        </span>
      </div>
      <div style={{ 
        background: 'rgba(0, 0, 0, 0.3)',
        height: '6px',
        borderRadius: '3px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          background: color,
          transition: 'width 0.3s'
        }} />
      </div>
    </div>
  );
}

