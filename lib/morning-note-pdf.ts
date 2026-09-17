/**
 * Morning Note PDF Generator — Comprehensive Edition
 *
 * Generates a 6-8 page "India Equity Morning Note" PDF matching the
 * reference report format with:
 *  - Narrative paragraphs (not just bullet points)
 *  - Market Snapshot table with Remarks column
 *  - Key Events with "What Happened" / "What's Driving Today" narratives
 *  - Detailed geopolitical & macro analysis paragraphs
 *  - FII/DII table with Key Insight narrative
 *  - Sector Analysis table with emoji-coded stance and detailed rationale
 *  - Technical Levels with Expected Open analysis
 *  - Stock Recommendations: Intraday / Swing / Medium-Term tables
 *  - Multi-paragraph FX & Commodities outlook
 *  - Risk Scenarios table with Sector Impact
 *  - Actionable Playbook naming specific stocks
 *  - Professional disclaimer
 */

import PDFDocument from 'pdfkit'
import type { MorningNote, StockPick } from './morning-note'

// ─── Design Tokens ──────────────────────────────────────────────────────────

const C = {
  navy: '#0f1b3d',
  accent: '#2563eb',
  accentLight: '#dbeafe',
  green: '#16a34a',
  greenLight: '#dcfce7',
  red: '#dc2626',
  redLight: '#fee2e2',
  orange: '#ea580c',
  orangeLight: '#ffedd5',
  amber: '#d97706',
  gray: '#4b5563',
  grayLight: '#9ca3af',
  grayBorder: '#d1d5db',
  grayBg: '#f3f4f6',
  white: '#ffffff',
  black: '#111827',
}

const CALL_EMOJI: Record<string, string> = {
  BUY: '🟢',
  TACTICAL: '🔵',
  CAUTIOUS: '🟡',
  AVOID: '🔴',
  MIXED: '🟠',
}

const PAGE_MARGIN = { top: 40, bottom: 50, left: 45, right: 45 }

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generateMorningNotePDF(note: MorningNote): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: PAGE_MARGIN,
      info: {
        Title: `India Equity Morning Note — ${fmtDate()}`,
        Author: 'Vibe Trades Intelligence',
        Subject: 'Daily Market Intelligence Report',
      },
      bufferPages: true,
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width - PAGE_MARGIN.left - PAGE_MARGIN.right
    const X = PAGE_MARGIN.left

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE 1: Title Block + Market Snapshot + Key Events
    // ═══════════════════════════════════════════════════════════════════════

    // ── Title Banner ─────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 95).fill(C.navy)

    // Left: Title and date
    doc.fontSize(24).fillColor(C.white).font('Helvetica-Bold')
      .text('India Equity Morning Note', X, 18, { width: W * 0.65 })
    doc.fontSize(10).fillColor('#94a3b8').font('Helvetica')
      .text(
        fmtDateLong() + '  |  Vibe Trades Intelligence',
        X, 50, { width: W * 0.65 }
      )
    doc.fontSize(8).fillColor('#64748b').font('Helvetica')
      .text(`Report generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`, X, 68, { width: W * 0.65 })

    // Right: Sentiment badge
    const sentLabel = note.sentiment.overall.replace('_', ' ')
    const sentColor = note.sentiment.overall.includes('BULLISH') ? C.green
      : note.sentiment.overall.includes('BEARISH') ? C.red : C.amber
    const badgeX = X + W - 130
    doc.roundedRect(badgeX, 14, 135, 65, 8).fill(sentColor)
    doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
      .text('MARKET SENTIMENT', badgeX + 5, 20, { width: 125, align: 'center' })
    doc.fontSize(28).fillColor(C.white).font('Helvetica-Bold')
      .text(`${note.sentiment.score}`, badgeX + 5, 34, { width: 125, align: 'center' })
    doc.fontSize(9).fillColor(C.white).font('Helvetica')
      .text(sentLabel, badgeX + 5, 62, { width: 125, align: 'center' })

    doc.fillColor(C.black)
    let y = 108

    // ── Section 1: Market Snapshot ────────────────────────────────────────
    y = sectionTitle(doc, '1. MARKET SNAPSHOT', y, W, X)
    const snap = note.marketSnapshot

    // Build rows: Indicator | Value | Change | Remarks
    const snapRows: string[][] = []
    if (snap.nifty) {
      const remarkN = snap.nifty.changePercent > 1 ? 'Strong rally, positive momentum' :
        snap.nifty.changePercent < -1 ? 'Under pressure, bears in control' : 'Range-bound, wait for breakout'
      snapRows.push(['NIFTY 50', fmtNum(snap.nifty.price), pctStr(snap.nifty.changePercent), remarkN])
    }
    if (snap.bankNifty) {
      const remarkB = snap.bankNifty.changePercent > 1 ? 'Banking sector leading' :
        snap.bankNifty.changePercent < -1 ? 'Banking weakness, drag on market' : 'In-line with broader market'
      snapRows.push(['BANK NIFTY', fmtNum(snap.bankNifty.price), pctStr(snap.bankNifty.changePercent), remarkB])
    }
    if (snap.vix) {
      const vixRemark = snap.vix.value > 30 ? 'Extreme fear — hedging essential' :
        snap.vix.value > 25 ? 'Elevated — reduce position sizes' :
        snap.vix.value > 20 ? 'Above comfort zone — stay cautious' :
        snap.vix.value > 15 ? 'Moderate — normal trading conditions' : 'Low volatility — complacency risk'
      snapRows.push(['India VIX', snap.vix.value.toFixed(2), snap.vix.change ? pctStr(snap.vix.change) : '—', vixRemark])
    }
    if (snap.crude) {
      const crudeRemark = snap.crude.change > 3 ? 'Spiking — negative for CAD & inflation' :
        snap.crude.change < -3 ? 'Falling — fiscal tailwind for India' :
        'Stable — no material impact on macro'
      snapRows.push([`Crude Oil (${snap.crude.label})`, `$${snap.crude.price.toFixed(2)}`, pctStr(snap.crude.change), crudeRemark])
    }
    if (snap.usdInr) {
      const fxRemark = snap.usdInr.trend === 'WEAKENING' ? 'INR depreciating — FII outflow concern' :
        snap.usdInr.trend === 'STRENGTHENING' ? 'INR appreciating — positive for FII flows' :
        'Stable — RBI likely managing within band'
      snapRows.push(['USD/INR', `₹${snap.usdInr.rate.toFixed(2)}`, snap.usdInr.change ? pctStr(snap.usdInr.change) : snap.usdInr.trend, fxRemark])
    }
    if (snap.gold) {
      const goldRemark = snap.gold.change > 2 ? 'Risk-off bid — safe haven demand rising' :
        snap.gold.change < -2 ? 'Risk-on rotation — equities preferred' : 'Steady — no strong directional cue'
      snapRows.push(['Gold', `$${snap.gold.price.toFixed(0)}`, pctStr(snap.gold.change), goldRemark])
    }
    if (snap.regime) {
      const regimeRemark = snap.regime.label === 'STRONG_BEAR' ? 'Multi-day downtrend, price below all SMAs' :
        snap.regime.label === 'BEAR' ? 'Bearish structure, lower highs/lows' :
        snap.regime.label === 'STRONG_BULL' ? 'Strong uptrend, all SMAs aligned' :
        snap.regime.label === 'BULL' ? 'Bullish structure, higher highs/lows' :
        'No clear trend — choppy price action'
      snapRows.push(['Market Regime', snap.regime.label.replace('_', ' '), `${snap.regime.confidence}% confidence`, regimeRemark])
    }

    y = drawTableWithRemarks(doc, ['Indicator', 'Value', 'Change', 'Remarks'], snapRows, y, W, X, [0.18, 0.15, 0.15, 0.52])
    y += 12

    // ── Section 2: Key Events & Drivers ──────────────────────────────────
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, '2. KEY EVENTS & DRIVERS', y, W, X)

    // "What Happened Last Session" narrative
    const lastSessionDrivers = note.keyDrivers.drivers.filter(d => !d.startsWith('['))
    const geoDrivers = note.keyDrivers.drivers.filter(d => d.startsWith('['))

    if (lastSessionDrivers.length > 0) {
      y = subHeading(doc, 'What Happened Last Session:', y, X)
      const lastSessionNarrative = lastSessionDrivers.join('. ')
        + (lastSessionDrivers.length > 0 && !lastSessionDrivers[lastSessionDrivers.length - 1].endsWith('.') ? '.' : '')
      y = paragraph(doc, lastSessionNarrative, y, W, X)
      y += 6
    }

    // "What's Driving Today" narrative
    y = subHeading(doc, "What's Driving Today:", y, X)
    const todayDrivers: string[] = []
    if (snap.vix && snap.vix.value > 20) todayDrivers.push(`India VIX remains elevated at ${snap.vix.value.toFixed(1)}, indicating heightened options activity and hedging demand.`)
    if (snap.crude && Math.abs(snap.crude.change) > 2) todayDrivers.push(`Crude oil has moved ${snap.crude.change > 0 ? 'up' : 'down'} ${Math.abs(snap.crude.change).toFixed(1)}%, which ${snap.crude.change > 0 ? 'pressures India\'s current account deficit and could weigh on market sentiment' : 'provides a tailwind for India as a net crude importer, easing fiscal burden'}.`)
    if (snap.usdInr && snap.usdInr.trend === 'WEAKENING') todayDrivers.push(`The rupee continues to weaken against the dollar, signaling continued FII outflows and potential RBI intervention.`)
    if (geoDrivers.length > 0) todayDrivers.push(...geoDrivers.map(d => d.replace(/^\[.*?\]\s*/, '') + '.'))
    if (note.institutionalFlows.fiiTrend === 'SELLING' && note.institutionalFlows.fiiConsecutiveDays >= 3) {
      todayDrivers.push(`FII selling continues for ${note.institutionalFlows.fiiConsecutiveDays} consecutive sessions with cumulative net outflow, maintaining downward pressure on large-caps.`)
    }
    if (todayDrivers.length === 0) todayDrivers.push('Markets likely to take cues from global developments and overnight US/Asian market action.')
    y = paragraph(doc, todayDrivers.join(' '), y, W, X)
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 3: Geopolitical & Macro Situation
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, '3. GEOPOLITICAL & MACRO SITUATION', y, W, X)

    // Risk badge inline
    const riskColor = note.geopolitical.riskLevel === 'EXTREME' ? C.red :
      note.geopolitical.riskLevel === 'HIGH' ? C.orange :
      note.geopolitical.riskLevel === 'MODERATE' ? C.amber : C.green
    doc.roundedRect(X, y, 110, 18, 4).fill(riskColor)
    doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
      .text(`RISK: ${note.geopolitical.riskLevel}`, X + 5, y + 4, { width: 100, align: 'center' })
    y += 24

    // Geopolitical narrative
    if (note.geopolitical.events.length > 0) {
      for (const event of note.geopolitical.events.slice(0, 4)) {
        y = checkPage(doc, y, 40)
        doc.fontSize(9.5).fillColor(C.black).font('Helvetica-Bold')
          .text(`${event.type}: ${event.title}`, X, y, { width: W })
        y += 14
        // Build narrative for each event
        const impactDir = event.sentimentImpact < 0 ? 'negative' : event.sentimentImpact > 0 ? 'positive' : 'neutral'
        const severity = event.severity === 'CRITICAL' ? 'This is a critical development requiring immediate attention.' :
          event.severity === 'HIGH' ? 'This carries significant implications for Indian markets.' :
          'Monitor this development for potential escalation.'
        y = paragraph(doc, `Impact assessment: ${impactDir} (sentiment impact: ${event.sentimentImpact > 0 ? '+' : ''}${event.sentimentImpact}). ${severity}`, y, W, X)
        y += 6
      }
    } else {
      y = paragraph(doc, note.geopolitical.summary, y, W, X)
    }

    // India-Specific Macro sub-section
    if (note.fxCommodities.usMarkets || note.fxCommodities.asianMarkets) {
      y += 4
      y = checkPage(doc, y, 40)
      y = subHeading(doc, 'India-Specific Macro:', y, X)
      const macroParts: string[] = []
      if (note.fxCommodities.usMarkets) {
        macroParts.push(`US markets closed ${note.fxCommodities.usMarkets.direction === 'RISK_ON' ? 'higher' : note.fxCommodities.usMarkets.direction === 'RISK_OFF' ? 'lower' : 'mixed'} (S&P 500: ${note.fxCommodities.usMarkets.sp500Change > 0 ? '+' : ''}${note.fxCommodities.usMarkets.sp500Change.toFixed(1)}%).`)
      }
      if (note.fxCommodities.asianMarkets) {
        macroParts.push(`Asian markets trading ${note.fxCommodities.asianMarkets.direction === 'RISK_ON' ? 'higher' : note.fxCommodities.asianMarkets.direction === 'RISK_OFF' ? 'lower' : 'mixed'} in early trade.`)
      }
      if (snap.regime) {
        macroParts.push(`India market regime: ${snap.regime.label.replace('_', ' ')} with ${snap.regime.confidence}% confidence.`)
      }
      y = paragraph(doc, macroParts.join(' '), y, W, X)
    }
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 4: FII/DII Institutional Flows
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, '4. FII/DII INSTITUTIONAL FLOWS', y, W, X)

    if (note.institutionalFlows.signal) {
      const flowRows: string[][] = []
      if (note.institutionalFlows.fiiNet !== null) {
        const fiiDir = note.institutionalFlows.fiiTrend === 'SELLING' ? '📉 Selling' : note.institutionalFlows.fiiTrend === 'BUYING' ? '📈 Buying' : 'Neutral'
        flowRows.push([
          'FII (Foreign Institutional)',
          `₹${Math.abs(note.institutionalFlows.fiiNet).toLocaleString('en-IN')} Cr`,
          note.institutionalFlows.fiiNet >= 0 ? 'Net Buy' : 'Net Sell',
          fiiDir,
          `${note.institutionalFlows.fiiConsecutiveDays} days`,
        ])
      }
      if (note.institutionalFlows.diiNet !== null) {
        const diiDir = note.institutionalFlows.diiTrend === 'SELLING' ? '📉 Selling' : note.institutionalFlows.diiTrend === 'BUYING' ? '📈 Buying' : 'Neutral'
        flowRows.push([
          'DII (Domestic Institutional)',
          `₹${Math.abs(note.institutionalFlows.diiNet).toLocaleString('en-IN')} Cr`,
          note.institutionalFlows.diiNet >= 0 ? 'Net Buy' : 'Net Sell',
          diiDir,
          `${note.institutionalFlows.diiConsecutiveDays} days`,
        ])
      }

      y = drawTableWithRemarks(doc, ['Category', 'Amount', 'Action', 'Trend', 'Streak'], flowRows, y, W, X, [0.25, 0.18, 0.14, 0.18, 0.12])
      y += 6

      // Key Insight narrative
      y = subHeading(doc, 'Key Insight:', y, X)
      const flowNarrative = buildFlowNarrative(note.institutionalFlows)
      y = paragraph(doc, flowNarrative, y, W, X)
    } else {
      y = paragraph(doc, 'Institutional flow data unavailable for this session.', y, W, X)
    }
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 5: Sector Analysis — BUY vs AVOID
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, '5. SECTOR ANALYSIS — BUY vs AVOID', y, W, X)

    if (note.sectorCalls.calls.length > 0) {
      const sectorRows: string[][] = note.sectorCalls.calls.map(c => [
        c.sector,
        `${CALL_EMOJI[c.call] || ''} ${c.call}`,
        pctStr(c.change),
        c.rationale,
      ])
      y = drawTableWithRemarks(doc, ['Sector', 'Stance', 'Change', 'Rationale'], sectorRows, y, W, X, [0.16, 0.12, 0.10, 0.62])
    } else {
      y = paragraph(doc, 'Sector data unavailable — unable to generate sector calls.', y, W, X)
    }
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 6: Technical Levels
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, '6. TECHNICAL LEVELS', y, W, X)

    const levelSets = [
      { title: 'NIFTY 50', data: note.technicalLevels.nifty },
      { title: 'BANK NIFTY', data: note.technicalLevels.bankNifty },
    ].filter(l => l.data)

    for (const ls of levelSets) {
      if (!ls.data) continue
      y = checkPage(doc, y, 60)
      y = subHeading(doc, ls.title, y, X)

      const techRows: string[][] = []
      // Build: Strong Support | Immediate Support | Immediate Resistance | Strong Resistance
      const sups = ls.data.supports
      const ress = ls.data.resistances

      techRows.push([
        sups[1] ? `${sups[1].label}: ${fmtNum(sups[1].value)}` : '—',
        sups[0] ? `${sups[0].label}: ${fmtNum(sups[0].value)}` : '—',
        ress[0] ? `${ress[0].label}: ${fmtNum(ress[0].value)}` : '—',
        ress[1] ? `${ress[1].label}: ${fmtNum(ress[1].value)}` : '—',
      ])

      y = drawTableWithRemarks(doc, ['Strong Support', 'Immediate Support', 'Immediate Resistance', 'Strong Resistance'], techRows, y, W, X, [0.25, 0.25, 0.25, 0.25])
      y += 6
    }

    // Expected Open analysis
    if (note.marketSnapshot.nifty) {
      y = checkPage(doc, y, 30)
      y = subHeading(doc, 'Expected Open:', y, X)
      const niftyPct = note.marketSnapshot.nifty.changePercent
      const openExpect = niftyPct > 0.5 ? 'gap-up' : niftyPct < -0.5 ? 'gap-down' : 'flat-to-slightly positive'
      const usDir = note.fxCommodities.usMarkets?.direction === 'RISK_ON' ? 'positive US close' :
        note.fxCommodities.usMarkets?.direction === 'RISK_OFF' ? 'weak US close' : 'mixed global cues'
      const giftNote = note.marketSnapshot.giftNifty ? ` GIFT Nifty suggests ${openExpect} opening.` : ''
      y = paragraph(doc, `Based on ${usDir} and overnight developments, expect a ${openExpect} opening.${giftNote} Key level to watch: ${note.technicalLevels.nifty?.supports[0] ? fmtNum(note.technicalLevels.nifty.supports[0].value) : 'previous day low'} on the downside and ${note.technicalLevels.nifty?.resistances[0] ? fmtNum(note.technicalLevels.nifty.resistances[0].value) : 'previous day high'} on the upside.`, y, W, X)
    }
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 7: Stock Recommendations
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 140)
    y = sectionTitle(doc, '7. STOCK RECOMMENDATIONS', y, W, X)

    const recs = note.stockRecommendations

    // A. Intraday Picks
    if (recs.intraday.length > 0) {
      y = checkPage(doc, y, 60)
      y = subHeading(doc, 'A. Intraday Picks', y, X)
      y = drawStockTable(doc, recs.intraday, y, W, X)
      y += 8
    }

    // B. Swing Trades (3-10 days)
    if (recs.swing.length > 0) {
      y = checkPage(doc, y, 60)
      y = subHeading(doc, 'B. Swing Trades (3-10 Days)', y, X)
      y = drawStockTable(doc, recs.swing, y, W, X)
      y += 8
    }

    // C. Medium-Term Positions (1-3 Months)
    if (recs.mediumTerm.length > 0) {
      y = checkPage(doc, y, 60)
      y = subHeading(doc, 'C. Medium-Term Positions (1-3 Months)', y, X)
      y = drawStockTable(doc, recs.mediumTerm, y, W, X)
      y += 8
    }

    if (recs.intraday.length === 0 && recs.swing.length === 0 && recs.mediumTerm.length === 0) {
      y = paragraph(doc, 'No high-conviction stock recommendations for today. Market conditions do not favor directional bets — wait for clarity before deploying capital.', y, W, X)
    }
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 8: FX & Commodities Outlook
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 140)
    y = sectionTitle(doc, '8. FX & COMMODITIES OUTLOOK', y, W, X)

    // USD/INR
    if (note.fxCommodities.usdInr) {
      y = checkPage(doc, y, 50)
      y = subHeading(doc, `USD/INR: ₹${note.fxCommodities.usdInr.rate.toFixed(2)} (${pctStr(note.fxCommodities.usdInr.change)})`, y, X)
      y = paragraph(doc, buildFxNarrative('USD/INR', note.fxCommodities.usdInr, note.institutionalFlows), y, W, X)
      y += 6
    }

    // Crude Oil
    if (note.fxCommodities.crude) {
      y = checkPage(doc, y, 50)
      y = subHeading(doc, `Crude Oil: $${note.fxCommodities.crude.price.toFixed(2)} (${pctStr(note.fxCommodities.crude.change)})`, y, X)
      y = paragraph(doc, buildCrudeNarrative(note.fxCommodities.crude, note.geopolitical), y, W, X)
      y += 6
    }

    // Gold
    if (note.fxCommodities.gold) {
      y = checkPage(doc, y, 50)
      y = subHeading(doc, `Gold: $${note.fxCommodities.gold.price.toFixed(0)} (${pctStr(note.fxCommodities.gold.change)})`, y, X)
      y = paragraph(doc, buildGoldNarrative(note.fxCommodities.gold, note.geopolitical, note.marketSnapshot.vix), y, W, X)
      y += 6
    }
    y += 6

    // ═══════════════════════════════════════════════════════════════════════
    // Section 9: Risk Scenarios
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 160)
    y = sectionTitle(doc, '9. RISK SCENARIOS', y, W, X)

    if (note.riskScenarios.length > 0) {
      const scenarioRows: string[][] = note.riskScenarios.map(s => [
        `${s.label === 'Bull' ? '🟢' : s.label === 'Bear' ? '🔴' : '🟡'} ${s.label.toUpperCase()} (${s.probability}%)`,
        s.niftyTarget,
        s.triggers.join('; '),
        s.sectorImplications.join('; '),
      ])
      y = drawTableWithRemarks(doc, ['Scenario', 'NIFTY Target', 'Key Triggers', 'Sector Impact'], scenarioRows, y, W, X, [0.18, 0.14, 0.34, 0.34])
    }
    y += 10

    // ═══════════════════════════════════════════════════════════════════════
    // Section 10: Today's Playbook
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, "10. TODAY'S PLAYBOOK", y, W, X)

    // Do's
    if (note.playbook.dos.length > 0) {
      doc.roundedRect(X, y, W, 18, 3).fill(C.green)
      doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
        .text("DO's — Recommended Actions", X + 8, y + 4, { width: W - 16 })
      y += 22

      for (const d of note.playbook.dos) {
        y = checkPage(doc, y, 16)
        doc.fontSize(9).fillColor(C.black).font('Helvetica')
          .text(`✅  ${d}`, X + 8, y, { width: W - 16 })
        y += doc.heightOfString(`✅  ${d}`, { width: W - 16 }) + 4
      }
      y += 6
    }

    // Don'ts
    if (note.playbook.donts.length > 0) {
      y = checkPage(doc, y, 30)
      doc.roundedRect(X, y, W, 18, 3).fill(C.red)
      doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
        .text("DON'Ts — Actions to Avoid", X + 8, y + 4, { width: W - 16 })
      y += 22

      for (const d of note.playbook.donts) {
        y = checkPage(doc, y, 16)
        doc.fontSize(9).fillColor(C.black).font('Helvetica')
          .text(`❌  ${d}`, X + 8, y, { width: W - 16 })
        y += doc.heightOfString(`❌  ${d}`, { width: W - 16 }) + 4
      }
      y += 6
    }
    y += 8

    // ═══════════════════════════════════════════════════════════════════════
    // Sentiment Score Breakdown (compact)
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 120)
    y = sectionTitle(doc, 'SENTIMENT V2 — SCORE BREAKDOWN', y, W, X)

    const comps = note.sentiment.components
    const scoreRows: string[][] = [
      ['Market Regime', '25%', `${comps.regime}/100`],
      ['VIX + Macro', '20%', `${comps.vixMacro}/100`],
      ['FII/DII Flows', '15%', `${comps.fiiDii}/100`],
      ['Intraday Technicals', '15%', `${comps.technicals}/100`],
      ['Market Breadth', '10%', `${comps.breadth}/100`],
      ['News + Geopolitical', '10%', `${comps.newsGeo}/100`],
      ['Sector Confirmation', '5%', `${comps.sectors}/100`],
    ]
    y = drawTableWithRemarks(doc, ['Component', 'Weight', 'Score'], scoreRows, y, W, X, [0.40, 0.20, 0.40])
    y += 6

    // Composite
    doc.fontSize(11).fillColor(sentColor).font('Helvetica-Bold')
      .text(`Composite Score: ${note.sentiment.score}/100 — ${sentLabel}`, X, y, { width: W })
    y += 16

    // Overrides
    if (note.sentiment.overrides.length > 0) {
      doc.fontSize(8).fillColor(C.red).font('Helvetica-Bold').text('Active Overrides:', X, y)
      y += 12
      for (const ov of note.sentiment.overrides) {
        doc.fontSize(8).fillColor(C.red).font('Helvetica')
          .text(`⚠️  ${ov}`, X + 8, y, { width: W - 16 })
        y += doc.heightOfString(`⚠️  ${ov}`, { width: W - 16 }) + 3
      }
      y += 4
    }

    // Recommendation
    doc.fontSize(9.5).fillColor(C.black).font('Helvetica-Bold')
      .text('Recommendation: ', X, y, { continued: true })
      .font('Helvetica').text(note.sentiment.recommendation)
    y += 20

    // ═══════════════════════════════════════════════════════════════════════
    // Disclaimer
    // ═══════════════════════════════════════════════════════════════════════
    y = checkPage(doc, y, 100)
    doc.moveTo(X, y).lineTo(X + W, y).strokeColor(C.grayBorder).lineWidth(0.5).stroke()
    y += 10
    doc.fontSize(8).fillColor(C.gray).font('Helvetica-Bold')
      .text('DISCLAIMER', X, y, { width: W })
    y += 12
    doc.fontSize(7).fillColor(C.grayLight).font('Helvetica')
      .text(DISCLAIMER_TEXT, X, y, { width: W, lineGap: 2 })
    y += doc.heightOfString(DISCLAIMER_TEXT, { width: W, lineGap: 2 }) + 10

    // Footer line
    doc.moveTo(X, y).lineTo(X + W, y).strokeColor(C.grayBorder).lineWidth(0.5).stroke()
    y += 6
    doc.fontSize(7).fillColor(C.grayLight).font('Helvetica')
      .text(
        'Generated by Vibe Trades Intelligence Engine  |  ' +
        `Report time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
        X, y, { width: W, align: 'center' }
      )

    // Add page numbers
    const pageCount = doc.bufferedPageRange().count
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).fillColor(C.grayLight).font('Helvetica')
        .text(
          `Page ${i + 1} of ${pageCount}`,
          X, doc.page.height - 30,
          { width: W, align: 'right' }
        )
    }

    doc.end()
  })
}

// ─── Table Renderers ────────────────────────────────────────────────────────

function drawTableWithRemarks(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  startY: number,
  pageWidth: number,
  startX: number,
  colRatios: number[],
): number {
  const colWidths = colRatios.map(r => pageWidth * r)
  let y = startY

  // Header row
  doc.rect(startX, y, pageWidth, 20).fill(C.navy)
  let xOff = startX + 5
  for (let i = 0; i < headers.length; i++) {
    doc.fontSize(7.5).fillColor(C.white).font('Helvetica-Bold')
      .text(headers[i], xOff, y + 5, { width: colWidths[i] - 10 })
    xOff += colWidths[i]
  }
  y += 20

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    // Calculate row height based on tallest cell
    let maxH = 16
    for (let c = 0; c < rows[r].length; c++) {
      const h = doc.fontSize(8).font('Helvetica').heightOfString(rows[r][c] || '', { width: colWidths[c] - 10 })
      maxH = Math.max(maxH, h + 8)
    }

    y = checkPage(doc, y, maxH)
    const bgColor = r % 2 === 0 ? C.grayBg : C.white
    doc.rect(startX, y, pageWidth, maxH).fill(bgColor)

    // Cell border
    doc.rect(startX, y, pageWidth, maxH).strokeColor(C.grayBorder).lineWidth(0.3).stroke()

    xOff = startX + 5
    for (let c = 0; c < rows[r].length; c++) {
      const cellText = rows[r][c] || ''
      // Color code values
      const isLastCol = c === rows[r].length - 1
      const cellColor = cellText.startsWith('+') ? C.green :
        cellText.startsWith('-') ? C.red :
        cellText.includes('BUY') ? C.green :
        cellText.includes('AVOID') ? C.red :
        cellText.includes('CAUTIOUS') ? C.amber :
        isLastCol ? C.gray : C.black

      const fontWeight = c === 0 ? 'Helvetica-Bold' : 'Helvetica'
      doc.fontSize(8).fillColor(cellColor).font(fontWeight)
        .text(cellText, xOff, y + 4, { width: colWidths[c] - 10 })
      xOff += colWidths[c]
    }
    y += maxH
  }

  // Bottom border
  doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor(C.grayBorder).lineWidth(0.5).stroke()
  return y
}

function drawStockTable(doc: PDFKit.PDFDocument, picks: StockPick[], startY: number, pageWidth: number, startX: number): number {
  const headers = ['Stock', 'Direction', 'Entry', 'Target 1', 'Target 2', 'Stop Loss', 'Rationale']
  const colRatios = [0.10, 0.08, 0.10, 0.09, 0.09, 0.10, 0.44]
  const colWidths = colRatios.map(r => pageWidth * r)
  let y = startY

  // Header
  doc.rect(startX, y, pageWidth, 18).fill(C.navy)
  let xOff = startX + 4
  for (let i = 0; i < headers.length; i++) {
    doc.fontSize(7).fillColor(C.white).font('Helvetica-Bold')
      .text(headers[i], xOff, y + 4, { width: colWidths[i] - 6 })
    xOff += colWidths[i]
  }
  y += 18

  // Data
  for (let r = 0; r < picks.length; r++) {
    const p = picks[r]
    const rationaleH = doc.fontSize(7.5).font('Helvetica').heightOfString(p.rationale, { width: colWidths[6] - 8 })
    const rowH = Math.max(18, rationaleH + 8)

    y = checkPage(doc, y, rowH)
    const bg = r % 2 === 0 ? C.grayBg : C.white
    doc.rect(startX, y, pageWidth, rowH).fill(bg)
    doc.rect(startX, y, pageWidth, rowH).strokeColor(C.grayBorder).lineWidth(0.3).stroke()

    const dirColor = p.direction === 'LONG' ? C.green : C.red
    const cells = [p.symbol, p.direction, p.entry, p.target1, p.target2, p.stopLoss, p.rationale]
    const cellColors = [C.black, dirColor, C.black, C.green, C.green, C.red, C.gray]
    const cellFonts = ['Helvetica-Bold', 'Helvetica-Bold', 'Helvetica', 'Helvetica', 'Helvetica', 'Helvetica', 'Helvetica']

    xOff = startX + 4
    for (let c = 0; c < cells.length; c++) {
      doc.fontSize(7.5).fillColor(cellColors[c]).font(cellFonts[c])
        .text(cells[c], xOff, y + 4, { width: colWidths[c] - 6 })
      xOff += colWidths[c]
    }
    y += rowH
  }

  doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor(C.grayBorder).lineWidth(0.5).stroke()
  return y
}

// ─── Narrative Builders ─────────────────────────────────────────────────────

function buildFlowNarrative(flows: MorningNote['institutionalFlows']): string {
  const parts: string[] = []

  if (flows.fiiTrend === 'SELLING' && flows.fiiConsecutiveDays >= 3) {
    parts.push(`Foreign institutional investors have been net sellers for ${flows.fiiConsecutiveDays} consecutive sessions, indicating sustained risk-off positioning in Indian equities. This sustained selling pressure weighs heavily on large-cap and index heavyweights.`)
  } else if (flows.fiiTrend === 'BUYING' && flows.fiiConsecutiveDays >= 2) {
    parts.push(`FIIs have turned net buyers for ${flows.fiiConsecutiveDays} sessions, suggesting improving sentiment toward Indian equities. This is a positive signal for market breadth and large-cap performance.`)
  } else if (flows.fiiNet !== null) {
    parts.push(`FIIs were net ${flows.fiiNet >= 0 ? 'buyers' : 'sellers'} of ₹${Math.abs(flows.fiiNet).toLocaleString('en-IN')} Cr in the latest session.`)
  }

  if (flows.diiTrend === 'BUYING' && flows.diiConsecutiveDays >= 2) {
    parts.push(`Domestic institutional investors continue to provide support with sustained buying, partly offsetting FII outflows. DII buying is driven by mutual fund SIP flows and insurance allocations.`)
  } else if (flows.diiNet !== null) {
    parts.push(`DIIs were net ${flows.diiNet >= 0 ? 'buyers' : 'sellers'} of ₹${Math.abs(flows.diiNet).toLocaleString('en-IN')} Cr.`)
  }

  if (flows.signal) {
    parts.push(`Overall institutional signal: ${flows.signal.replace('_', ' ')} (${flows.confidence}% confidence).`)
  }

  return parts.join(' ') || 'Institutional flow data unavailable.'
}

function buildFxNarrative(
  _label: string,
  fx: NonNullable<MorningNote['fxCommodities']['usdInr']>,
  flows: MorningNote['institutionalFlows'],
): string {
  const parts: string[] = []
  parts.push(fx.outlook + '.')

  if (fx.change > 0.3) {
    parts.push(`The rupee has weakened ${fx.change.toFixed(2)}% in the recent session, reflecting dollar strength and potential FII repatriation.`)
  } else if (fx.change < -0.3) {
    parts.push(`The rupee has strengthened ${Math.abs(fx.change).toFixed(2)}%, likely supported by RBI intervention and improved trade balance expectations.`)
  }

  if (flows.fiiTrend === 'SELLING') {
    parts.push('Continued FII selling adds depreciation pressure on INR through dollar demand for repatriation.')
  }

  parts.push('Impact on sectors: Weak INR benefits IT, Pharma, and export-oriented sectors while hurting importers (Oil & Gas, Chemicals). Watch for RBI intervention around key psychological levels.')

  return parts.join(' ')
}

function buildCrudeNarrative(
  crude: NonNullable<MorningNote['fxCommodities']['crude']>,
  geo: MorningNote['geopolitical'],
): string {
  const parts: string[] = []
  parts.push(crude.outlook + '.')

  if (crude.change > 3) {
    parts.push(`With crude surging ${crude.change.toFixed(1)}%, India's import bill faces upward pressure. This negatively impacts fiscal deficit (every $10/bbl increase adds ~0.4% to CAD) and inflation expectations.`)
    parts.push('Sectors impacted: Oil Marketing Companies (HPCL, BPCL, IOC) face margin compression. Airlines (IndiGo, SpiceJet) see cost headwinds. Paint sector (Asian Paints) faces raw material pressure.')
  } else if (crude.change < -3) {
    parts.push(`Falling crude prices benefit India as a net importer. Lower crude eases fiscal pressure, helps contain inflation, and supports RBI\'s rate-cut trajectory.`)
    parts.push('Positive for: OMCs, Airlines, Paints, Chemicals. Negative for: ONGC, Oil India (upstream E&P).')
  } else {
    parts.push('At current levels, crude oil has limited impact on India\'s macro outlook. Monitor geopolitical developments that could trigger supply disruptions.')
  }

  if (geo.riskLevel === 'HIGH' || geo.riskLevel === 'EXTREME') {
    parts.push('Geopolitical risk premium remains embedded in crude prices due to ongoing tensions.')
  }

  return parts.join(' ')
}

function buildGoldNarrative(
  gold: NonNullable<MorningNote['fxCommodities']['gold']>,
  geo: MorningNote['geopolitical'],
  vix: MorningNote['marketSnapshot']['vix'],
): string {
  const parts: string[] = []
  parts.push(gold.outlook + '.')

  if (gold.change > 2) {
    parts.push(`Gold's ${gold.change.toFixed(1)}% advance signals risk-aversion in global markets. Rising gold typically correlates with equity weakness and flight to safety.`)
  } else if (gold.change < -2) {
    parts.push(`Gold's decline suggests risk appetite is improving globally, with investors rotating from safe havens to equities.`)
  }

  if (vix && vix.value > 22) {
    parts.push(`Elevated VIX at ${vix.value.toFixed(1)} combined with gold's movement confirms the current risk-off environment.`)
  }

  if (geo.riskLevel === 'HIGH' || geo.riskLevel === 'EXTREME') {
    parts.push('Geopolitical uncertainty continues to support gold as a safe-haven asset. Consider gold-related stocks (Titan) as portfolio hedges.')
  }

  parts.push('For Indian investors, gold also serves as an INR depreciation hedge — consider allocating 5-10% of portfolio to gold ETFs/SGBs in current environment.')

  return parts.join(' ')
}

// ─── Layout Helpers ─────────────────────────────────────────────────────────

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number, w: number, x: number): number {
  // Accent bar + title
  doc.rect(x, y, 4, 16).fill(C.accent)
  doc.fontSize(11).fillColor(C.navy).font('Helvetica-Bold')
    .text(title, x + 10, y + 1, { width: w - 10 })
  y += 20
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(C.accent).lineWidth(1).stroke()
  y += 8
  doc.lineWidth(0.5) // reset
  return y
}

function subHeading(doc: PDFKit.PDFDocument, text: string, y: number, x: number): number {
  doc.fontSize(9.5).fillColor(C.navy).font('Helvetica-Bold')
    .text(text, x, y)
  return y + 14
}

function paragraph(doc: PDFKit.PDFDocument, text: string, y: number, w: number, x: number): number {
  doc.fontSize(9).fillColor(C.gray).font('Helvetica')
    .text(text, x, y, { width: w, lineGap: 2 })
  return y + doc.heightOfString(text, { width: w, lineGap: 2 }) + 2
}

function checkPage(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  const maxY = doc.page.height - PAGE_MARGIN.bottom
  if (y + needed > maxY) {
    doc.addPage()
    return PAGE_MARGIN.top
  }
  return y
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function pctStr(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtDate(): string {
  return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateLong(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DISCLAIMER_TEXT = `This report is generated by an automated intelligence engine and is intended for informational and educational purposes only. It does not constitute investment advice, a recommendation, or an offer to buy or sell any security. The information, analysis, opinions, and projections contained herein are based on publicly available data sources and automated algorithmic analysis which may contain errors or inaccuracies.

Past performance is not indicative of future results. Trading in equities, derivatives, and other financial instruments involves substantial risk of loss and is not suitable for every investor. You should not rely solely on this report for making investment decisions. Always consult with a qualified financial advisor and conduct your own due diligence before investing.

The authors, developers, and distributors of this report expressly disclaim all liability for any loss or damage arising from the use of or reliance on this report. Market conditions can change rapidly, and the information herein may become outdated quickly. All investment decisions are made at your own risk.`
