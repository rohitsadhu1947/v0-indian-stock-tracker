/**
 * Database Schema for Indian Stock Tracker
 * Using Drizzle ORM with Neon PostgreSQL
 */

import { pgTable, text, serial, integer, real, timestamp, boolean, jsonb, index, uniqueIndex, varchar, doublePrecision, date } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================
// USERS & SESSIONS
// ============================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  
  // Kite Connect (optional now - only for admin or traders with own Kite)
  kiteUserId: text('kite_user_id').unique(),
  
  // Email/Password Authentication (NEW)
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(), // bcrypt hashed password
  
  // User Info
  name: text('name'),
  
  // Role & Status (NEW)
  role: text('role').notNull().default('viewer'), // 'admin' | 'viewer' | 'trader' | 'custom'
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'pending'
  
  // Master Kite Token (NEW - for admin, shared with viewers)
  masterKiteToken: text('master_kite_token'), // Encrypted token for all viewers to use
  masterKiteUserId: text('master_kite_user_id'), // Which Kite account is the master
  
  // Hierarchy (NEW)
  createdBy: integer('created_by').references((): any => users.id), // Which admin created this user
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLogin: timestamp('last_login'),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  kiteUserIdx: index('users_kite_user_id_idx').on(table.kiteUserId),
  roleIdx: index('users_role_idx').on(table.role),
  statusIdx: index('users_status_idx').on(table.status),
}))

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
}))

// ============================================
// BROKER CONNECTIONS (Multi-Broker Support)
// ============================================

export const brokerConnections = pgTable('broker_connections', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  brokerId: varchar('broker_id', { length: 50 }).notNull(), // 'kite', 'groww', etc.
  displayName: varchar('display_name', { length: 100 }),
  accessToken: text('access_token'),
  apiKey: varchar('api_key', { length: 100 }),
  apiSecret: text('api_secret'),
  brokerUserId: varchar('broker_user_id', { length: 100 }),
  isActive: boolean('is_active').default(true).notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  lastConnected: timestamp('last_connected'),
  tokenExpiry: timestamp('token_expiry'),
  metadata: jsonb('metadata'), // Broker-specific extra data
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userBrokerIdx: index('broker_connections_user_broker_idx').on(table.userId, table.brokerId),
  activeIdx: index('broker_connections_active_idx').on(table.isActive),
}))

// ============================================
// WATCHLISTS & POSITIONS
// ============================================

export const watchlists = pgTable('watchlists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  instrumentToken: integer('instrument_token'),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  userSymbolIdx: uniqueIndex('watchlists_user_symbol_idx').on(table.userId, table.symbol, table.exchange),
}))

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  positionType: text('position_type').notNull(), // 'BUY' or 'SELL'
  entryPrice: real('entry_price').notNull(),
  quantity: integer('quantity').notNull(),
  currentPrice: real('current_price'),
  stopLoss: real('stop_loss'),
  target: real('target'),
  pnl: real('pnl'),
  pnlPercent: real('pnl_percent'),
  status: text('status').notNull().default('open'), // 'open', 'closed', 'stopped'
  entryTime: timestamp('entry_time').notNull(),
  exitTime: timestamp('exit_time'),
  exitPrice: real('exit_price'),
  notes: text('notes'),
  strategy: text('strategy'), // 'momentum', 'breakout', 'orb', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('positions_user_id_idx').on(table.userId),
  statusIdx: index('positions_status_idx').on(table.status),
  symbolIdx: index('positions_symbol_idx').on(table.symbol),
}))

// Paper Trading Positions (simulated trades)
export const paperPositions = pgTable('paper_positions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  positionType: text('position_type').notNull(), // 'BUY' or 'SELL'
  entryPrice: real('entry_price').notNull(),
  quantity: integer('quantity').notNull(),
  currentPrice: real('current_price'),
  stopLoss: real('stop_loss'),
  target1: real('target1'), // 1.5% target
  target2: real('target2'), // 2.5% target
  pnl: real('pnl'),
  pnlPercent: real('pnl_percent'),
  status: text('status').notNull().default('open'), // 'open', 'closed', 'stopped'
  entryTime: timestamp('entry_time').notNull(),
  exitTime: timestamp('exit_time'),
  exitPrice: real('exit_price'),
  exitReason: text('exit_reason'), // 'target1', 'target2', 'stop_loss', 'manual'
  notes: text('notes'),
  strategy: text('strategy').notNull(), // 'momentum', 'breakout', 'orb', etc.
  signalData: jsonb('signal_data'), // Full momentum signal data
  momentumScore: integer('momentum_score'),
  confidence: real('confidence'),
  riskAmount: real('risk_amount'),
  capitalRequired: real('capital_required'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('paper_positions_user_id_idx').on(table.userId),
  statusIdx: index('paper_positions_status_idx').on(table.status),
  symbolIdx: index('paper_positions_symbol_idx').on(table.symbol),
  strategyIdx: index('paper_positions_strategy_idx').on(table.strategy),
}))

// ============================================
// STOCK DATA CACHE
// ============================================

export const stockQuotes = pgTable('stock_quotes', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  data: jsonb('data').notNull(), // Store full quote response as JSON
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  symbolExchangeIdx: uniqueIndex('stock_quotes_symbol_exchange_idx').on(table.symbol, table.exchange),
  timestampIdx: index('stock_quotes_timestamp_idx').on(table.timestamp),
}))

export const historicalData = pgTable('historical_data', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  interval: text('interval').notNull(), // '1minute', '5minute', 'day', 'week'
  fromDate: timestamp('from_date').notNull(),
  toDate: timestamp('to_date').notNull(),
  data: jsonb('data').notNull(), // Store array of candles as JSON
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  symbolIntervalIdx: uniqueIndex('historical_data_symbol_interval_idx').on(
    table.symbol, 
    table.interval,
    table.fromDate,
    table.toDate
  ),
  timestampIdx: index('historical_data_timestamp_idx').on(table.timestamp),
}))

// ============================================
// PATTERN ANALYSIS & INTELLIGENCE CACHE
// ============================================

export const patternAnalysis = pgTable('pattern_analysis', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  analysisType: text('analysis_type').notNull(), // 'intraday', 'swing', 'momentum'
  recommendation: text('recommendation').notNull(), // 'STRONG_BUY', 'BUY', 'WATCH', 'SKIP'
  score: integer('score').notNull(),
  confidence: real('confidence'),
  successRate: real('success_rate'),
  patterns: jsonb('patterns'), // Detected patterns
  intelligence: jsonb('intelligence'), // Full analysis data
  validUntil: timestamp('valid_until').notNull(), // Cache expiry
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  symbolAnalysisIdx: index('pattern_analysis_symbol_type_idx').on(table.symbol, table.analysisType),
  validUntilIdx: index('pattern_analysis_valid_until_idx').on(table.validUntil),
}))

export const fundamentalData = pgTable('fundamental_data', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  marketCap: text('market_cap'),
  peRatio: real('pe_ratio'),
  pbRatio: real('pb_ratio'),
  dividendYield: real('dividend_yield'),
  debtToEquity: real('debt_to_equity'),
  roe: real('roe'),
  sector: text('sector'),
  industry: text('industry'),
  data: jsonb('data').notNull(), // Full fundamental data
  score: integer('score'),
  signal: text('signal'),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => ({
  symbolExchangeIdx: uniqueIndex('fundamental_data_symbol_exchange_idx').on(table.symbol, table.exchange),
  fetchedAtIdx: index('fundamental_data_fetched_at_idx').on(table.fetchedAt),
}))

export const newsData = pgTable('news_data', {
  id: serial('id').primaryKey(),
  symbol: text('symbol'),
  newsType: text('news_type').notNull(), // 'stock', 'sector', 'market', 'macro'
  title: text('title').notNull(),
  link: text('link'),
  snippet: text('snippet'),
  source: text('source'),
  publishedAt: timestamp('published_at'),
  sentiment: jsonb('sentiment'), // Sentiment analysis result
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('news_data_symbol_idx').on(table.symbol),
  newsTypeIdx: index('news_data_news_type_idx').on(table.newsType),
  publishedAtIdx: index('news_data_published_at_idx').on(table.publishedAt),
}))

// ============================================
// SCREENER RESULTS & TRADE HISTORY
// ============================================

export const screenerResults = pgTable('screener_results', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  screenerType: text('screener_type').notNull(), // 'morning', 'evening', 'orb', 'universe'
  screenerLevel: text('screener_level'), // 'conservative', 'moderate', 'aggressive'
  results: jsonb('results').notNull(), // Full screener results
  totalStocks: integer('total_stocks'),
  signalCount: integer('signal_count'),
  runAt: timestamp('run_at').defaultNow().notNull(),
}, (table) => ({
  userTypeIdx: index('screener_results_user_type_idx').on(table.userId, table.screenerType),
  runAtIdx: index('screener_results_run_at_idx').on(table.runAt),
}))

export const tradeHistory = pgTable('trade_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  // No FK: may reference paper_positions.id or positions.id — see `source`
  positionId: integer('position_id'),
  source: text('source').default('paper').notNull(), // 'paper' | 'live'
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price').notNull(),
  quantity: integer('quantity').notNull(),
  pnl: real('pnl').notNull(),
  pnlPercent: real('pnl_percent').notNull(),
  strategy: text('strategy'),
  exitReason: text('exit_reason'), // 'target', 'stop_loss', 'time_stop', 'manual'
  entryTime: timestamp('entry_time').notNull(),
  exitTime: timestamp('exit_time').notNull(),
  duration: integer('duration'), // Duration in minutes
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('trade_history_user_id_idx').on(table.userId),
  symbolIdx: index('trade_history_symbol_idx').on(table.symbol),
  entryTimeIdx: index('trade_history_entry_time_idx').on(table.entryTime),
}))

// ============================================
// MARKET DASHBOARD & ALERTS
// ============================================

export const marketDashboard = pgTable('market_dashboard', {
  id: serial('id').primaryKey(),
  dashboardType: text('dashboard_type').notNull(), // 'daily', 'intraday'
  data: jsonb('data').notNull(), // Full dashboard data
  marketSentiment: text('market_sentiment'),
  validUntil: timestamp('valid_until').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  typeValidIdx: index('market_dashboard_type_valid_idx').on(table.dashboardType, table.validUntil),
}))

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  symbol: text('symbol'),
  alertType: text('alert_type').notNull(), // 'price', 'entry', 'exit', 'market', 'news'
  message: text('message').notNull(),
  priority: text('priority').notNull().default('medium'), // 'low', 'medium', 'high', 'critical'
  isRead: boolean('is_read').default(false),
  actionRequired: boolean('action_required').default(false),
  metadata: jsonb('metadata'), // Additional alert data
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('alerts_user_id_idx').on(table.userId),
  isReadIdx: index('alerts_is_read_idx').on(table.isRead),
  createdAtIdx: index('alerts_created_at_idx').on(table.createdAt),
}))

// ============================================
// USER PREFERENCES & SETTINGS
// ============================================

export const userPreferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).unique().notNull(),
  theme: text('theme').default('dark'),
  defaultScreenerLevel: text('default_screener_level').default('moderate'),
  notificationsEnabled: boolean('notifications_enabled').default(true),
  autoRefreshInterval: integer('auto_refresh_interval').default(60), // seconds
  defaultPositionSize: integer('default_position_size').default(100),
  riskPercentage: real('risk_percentage').default(2.0),
  preferences: jsonb('preferences'), // Additional settings as JSON
  
  // Telegram Alerts Integration
  telegramEnabled: boolean('telegram_enabled').default(false),
  telegramBotToken: text('telegram_bot_token'),
  telegramChatId: text('telegram_chat_id'),
  telegramAlertPreferences: jsonb('telegram_alert_preferences'), // { newSignals: true, newsPops: true, orbBreakouts: true, targetHits: true, stopLossHits: true, dailySummary: true, positionUpdates: false }
  
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================
// USER PERMISSIONS & RBAC (NEW)
// ============================================

export const userPermissions = pgTable('user_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).unique().notNull(),
  
  // Access Control
  canViewSignals: boolean('can_view_signals').default(true).notNull(),
  canViewPositions: boolean('can_view_positions').default(false).notNull(), // Can see admin's positions
  canPaperTrade: boolean('can_paper_trade').default(true).notNull(),
  canViewResearch: boolean('can_view_research').default(true).notNull(),
  canRunBacktests: boolean('can_run_backtests').default(false).notNull(),
  canAddCustomStocks: boolean('can_add_custom_stocks').default(false).notNull(),
  canViewMarketDashboard: boolean('can_view_market_dashboard').default(true).notNull(),
  canManageUsers: boolean('can_manage_users').default(false).notNull(), // Admin only
  
  // Visible Tabs (JSON array of tab names)
  visibleTabs: jsonb('visible_tabs').default(['tradenow', 'research']), // ['tradenow', 'research', 'positions', 'backtest', 'market', etc.]
  
  // Subscription Tier (for future monetization)
  subscriptionTier: text('subscription_tier').default('free').notNull(), // 'free' | 'pro' | 'premium'
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  
  // Limits
  maxPaperPositions: integer('max_paper_positions').default(10).notNull(),
  maxBacktestsPerDay: integer('max_backtests_per_day').default(3).notNull(),
  maxCustomStocks: integer('max_custom_stocks').default(5).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex('user_permissions_user_id_idx').on(table.userId),
}))

// ============================================
// INSIDER TRADES & DELIVERY DATA (Hedge Fund Edge)
// ============================================

export const insiderTrades = pgTable('insider_trades', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  insiderName: text('insider_name').notNull(),
  designation: text('designation'),
  company: text('company'),
  tradeType: text('trade_type').notNull(),
  quantity: integer('quantity').notNull(),
  value: real('value'),
  tradeDate: timestamp('trade_date').notNull(),
  exchange: text('exchange').default('NSE'),
  category: text('category'),
  preHolding: real('pre_holding'),
  postHolding: real('post_holding'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('insider_trades_symbol_idx').on(table.symbol),
  tradeDateIdx: index('insider_trades_trade_date_idx').on(table.tradeDate),
  tradeTypeIdx: index('insider_trades_trade_type_idx').on(table.tradeType),
  symbolDateIdx: index('insider_trades_symbol_date_idx').on(table.symbol, table.tradeDate),
}))

export const deliveryData = pgTable('delivery_data', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  date: timestamp('date').notNull(),
  totalVolume: integer('total_volume').notNull(),
  deliveryVolume: integer('delivery_volume').notNull(),
  deliveryPct: real('delivery_pct').notNull(),
  closePrice: real('close_price'),
  priceChange: real('price_change'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index('delivery_data_symbol_idx').on(table.symbol),
  dateIdx: index('delivery_data_date_idx').on(table.date),
  symbolDateIdx: uniqueIndex('delivery_data_symbol_date_idx').on(table.symbol, table.date),
}))

export const smartAlerts = pgTable('smart_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  alertType: text('alert_type').notNull(),
  symbol: text('symbol'),
  message: text('message').notNull(),
  severity: text('severity').notNull().default('info'),
  actionable: text('actionable'),
  seen: boolean('seen').default(false).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('smart_alerts_user_id_idx').on(table.userId),
  seenIdx: index('smart_alerts_seen_idx').on(table.seen),
  createdAtIdx: index('smart_alerts_created_at_idx').on(table.createdAt),
  typeIdx: index('smart_alerts_type_idx').on(table.alertType),
}))

// ============================================
// RELATIONS (Optional, for Drizzle Queries)
// ============================================

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  brokerConnections: many(brokerConnections),
  watchlists: many(watchlists),
  positions: many(positions),
  paperPositions: many(paperPositions),
  screenerResults: many(screenerResults),
  tradeHistory: many(tradeHistory),
  alerts: many(alerts),
  smartAlerts: many(smartAlerts),
  preferences: one(userPreferences),
  permissions: one(userPermissions),
}))

export const brokerConnectionsRelations = relations(brokerConnections, ({ one }) => ({
  user: one(users, {
    fields: [brokerConnections.userId],
    references: [users.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const watchlistsRelations = relations(watchlists, ({ one }) => ({
  user: one(users, {
    fields: [watchlists.userId],
    references: [users.id],
  }),
}))

export const positionsRelations = relations(positions, ({ one }) => ({
  user: one(users, {
    fields: [positions.userId],
    references: [users.id],
  }),
}))

export const paperPositionsRelations = relations(paperPositions, ({ one }) => ({
  user: one(users, {
    fields: [paperPositions.userId],
    references: [users.id],
  }),
}))

export const screenerResultsRelations = relations(screenerResults, ({ one }) => ({
  user: one(users, {
    fields: [screenerResults.userId],
    references: [users.id],
  }),
}))

export const tradeHistoryRelations = relations(tradeHistory, ({ one }) => ({
  user: one(users, {
    fields: [tradeHistory.userId],
    references: [users.id],
  }),
  position: one(positions, {
    fields: [tradeHistory.positionId],
    references: [positions.id],
  }),
}))

export const alertsRelations = relations(alerts, ({ one }) => ({
  user: one(users, {
    fields: [alerts.userId],
    references: [users.id],
  }),
}))

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}))

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userPermissions.userId],
    references: [users.id],
  }),
}))

export const smartAlertsRelations = relations(smartAlerts, ({ one }) => ({
  user: one(users, {
    fields: [smartAlerts.userId],
    references: [users.id],
  }),
}))

// ============================================
// ANALYST REPORTS & MARKET INTELLIGENCE
// ============================================

export const analystReports = pgTable('analyst_reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Report Classification
  type: text('type').notNull(), // 'STOCK_REPORT' | 'MARKET_COMMENTARY'
  symbol: text('symbol'), // Nullable for market commentary
  
  // Basic Info
  title: text('title').notNull(),
  source: text('source').notNull(), // 'HDFC Securities', 'Perplexity', etc.
  reportDate: timestamp('report_date').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  
  // File Storage
  pdfPath: text('pdf_path').notNull(), // Local path: /uploads/reports/{hash}.pdf
  fullText: text('full_text'), // Extracted PDF text
  
  // Structured Data (JSONB for flexibility)
  structuredData: jsonb('structured_data'), // Different structure for stock vs market reports
  /*
    For STOCK_REPORT:
    {
      targetPrice: number,
      currentPrice: number,
      upside: number, // Percentage
      rating: 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL',
      analystName: string,
      keyPoints: string[],
      risks: string[],
      financialHighlights: {...}
    }
    
    For MARKET_COMMENTARY:
    {
      marketSentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH',
      sectorsBullish: string[],
      sectorsBearish: string[],
      keyThemes: string[],
      macroOutlook: string,
      recommendations: string[]
    }
  */
  
  // AI Analysis
  sentiment: text('sentiment'), // 'BULLISH' | 'NEUTRAL' | 'BEARISH'
  sentimentScore: real('sentiment_score'), // -1 to 1
  confidenceLevel: real('confidence_level'), // 0 to 1
  summary: text('summary'), // AI-generated 2-3 line summary
  
  // Metadata
  tags: jsonb('tags'), // ['earnings', 'growth', 'dividend'] etc.
  isActive: boolean('is_active').default(true).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('analyst_reports_user_id_idx').on(table.userId),
  symbolIdx: index('analyst_reports_symbol_idx').on(table.symbol),
  typeIdx: index('analyst_reports_type_idx').on(table.type),
  reportDateIdx: index('analyst_reports_report_date_idx').on(table.reportDate),
  sentimentIdx: index('analyst_reports_sentiment_idx').on(table.sentiment),
}))

export const analystReportsRelations = relations(analystReports, ({ one }) => ({
  user: one(users, {
    fields: [analystReports.userId],
    references: [users.id],
  }),
}))

// ============================================
// COMPANY FINANCIALS (for Earnings Analysis)
// ============================================

/**
 * Quarterly Financial Data
 * Stores quarterly P&L for earnings comparison
 */
export const quarterlyFinancials = pgTable('quarterly_financials', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  
  // Quarter identification
  quarter: text('quarter').notNull(), // 'Q1', 'Q2', 'Q3', 'Q4'
  fiscalYear: text('fiscal_year').notNull(), // 'FY26', 'FY25', etc.
  endDate: timestamp('end_date').notNull(), // End date of quarter (e.g., Sep 30, 2025)
  
  // P&L Items (in Crores)
  revenue: real('revenue'), // Operating Revenue
  operatingExpenses: real('operating_expenses'),
  operatingProfit: real('operating_profit'), // EBITDA-like
  depreciation: real('depreciation'),
  interest: real('interest'),
  tax: real('tax'),
  netProfit: real('net_profit'), // PAT
  
  // Per Share Data
  eps: real('eps'), // Earnings Per Share
  
  // Growth Metrics (calculated)
  revenueGrowthQoQ: real('revenue_growth_qoq'), // vs previous quarter
  revenueGrowthYoY: real('revenue_growth_yoy'), // vs same quarter last year
  profitGrowthQoQ: real('profit_growth_qoq'),
  profitGrowthYoY: real('profit_growth_yoy'),
  
  // Metadata
  dataSource: text('data_source').default('manual'), // 'manual', 'api', 'scraped'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  symbolQuarterIdx: uniqueIndex('quarterly_fin_symbol_quarter_idx').on(table.symbol, table.fiscalYear, table.quarter),
  symbolIdx: index('quarterly_fin_symbol_idx').on(table.symbol),
  endDateIdx: index('quarterly_fin_end_date_idx').on(table.endDate),
}))

/**
 * Annual Financial Data
 * Stores yearly financials for trend analysis
 */
export const annualFinancials = pgTable('annual_financials', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  
  // Year identification
  fiscalYear: text('fiscal_year').notNull(), // 'FY25', 'FY24', etc.
  endDate: timestamp('end_date').notNull(), // End of fiscal year (e.g., Mar 31, 2025)
  
  // P&L Items (in Crores)
  revenue: real('revenue'),
  operatingExpenses: real('operating_expenses'),
  operatingProfit: real('operating_profit'),
  depreciation: real('depreciation'),
  interest: real('interest'),
  tax: real('tax'),
  netProfit: real('net_profit'),
  
  // Per Share Data
  eps: real('eps'),
  bookValue: real('book_value'),
  
  // Cash Flow (in Crores)
  cashFromOperations: real('cash_from_operations'),
  cashFromInvesting: real('cash_from_investing'),
  cashFromFinancing: real('cash_from_financing'),
  netCashFlow: real('net_cash_flow'),
  
  // Key Ratios (in %)
  roe: real('roe'), // Return on Equity
  roce: real('roce'), // Return on Capital Employed
  operatingMargin: real('operating_margin'),
  netMargin: real('net_margin'),
  debtToEquity: real('debt_to_equity'),
  
  // Metadata
  dataSource: text('data_source').default('manual'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  symbolYearIdx: uniqueIndex('annual_fin_symbol_year_idx').on(table.symbol, table.fiscalYear),
  symbolIdx: index('annual_fin_symbol_idx').on(table.symbol),
}))

/**
 * Company Metadata
 * Basic info for NIFTY 50/500 companies
 */
export const companyInfo = pgTable('company_info', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').unique().notNull(),
  companyName: text('company_name').notNull(),
  sector: text('sector'),
  industry: text('industry'),
  
  // Index membership
  isNifty50: boolean('is_nifty_50').default(false),
  isNifty100: boolean('is_nifty_100').default(false),
  isNifty500: boolean('is_nifty_500').default(false),
  
  // Commodity dependencies (for analysis)
  commodityDependencies: jsonb('commodity_dependencies'), // ['CRUDE_OIL', 'GOLD', 'STEEL']
  
  // Financial data status
  hasQuarterlyData: boolean('has_quarterly_data').default(false),
  hasAnnualData: boolean('has_annual_data').default(false),
  lastQuarterUpdated: text('last_quarter_updated'), // 'Q2FY26'
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sectorIdx: index('company_info_sector_idx').on(table.sector),
  nifty50Idx: index('company_info_nifty50_idx').on(table.isNifty50),
}))


// ============================================================================
// PORTFOLIO ENGINE (monthly factor portfolios, see lib/portfolio)
// ============================================================================

/**
 * One end-of-day bar per symbol. Stocks use their current NSE symbol; indices
 * are prefixed "IDX:" (e.g. "IDX:NIFTY 200").
 *
 * Prices are adjusted for splits, bonuses, demergers and extraordinary
 * dividends (see lib/market-data/adjust.ts), so the series is continuous.
 * Official bars come from NSE's daily archive (lib/market-data/daily-update);
 * `provisional` bars were captured from broker quotes before the close and
 * are replaced when the official file arrives.
 */
export const dailyBars = pgTable('daily_bars', {
  symbol: text('symbol').notNull(),
  date: date('date').notNull(),
  open: doublePrecision('open').notNull(),
  high: doublePrecision('high').notNull(),
  low: doublePrecision('low').notNull(),
  close: doublePrecision('close').notNull(),
  volume: doublePrecision('volume').notNull(),
  provisional: boolean('provisional').default(false).notNull(),
  turnover: doublePrecision('turnover'),        // rupees traded; unaffected by adjustments
  deliveryQty: doublePrecision('delivery_qty'), // shares taken into delivery
}, (table) => ({
  symbolDateIdx: uniqueIndex('daily_bars_symbol_date_idx').on(table.symbol, table.date),
  dateIdx: index('daily_bars_date_idx').on(table.date),
}))

/**
 * Corporate actions from NSE, one row per company and ex-date. `status` is
 * 'pending' until the ex-date bar arrives, then 'confirmed' / 'inferred'
 * (earlier bars were rescaled by priceFactor), 'dividend' (no price change)
 * or 'rejected' (the stated ratio did not match the price; nothing applied).
 */
export const corporateActions = pgTable('corporate_actions', {
  symbol: text('symbol').notNull(),
  exDate: date('ex_date').notNull(),
  purposes: jsonb('purposes').$type<string[]>().notNull(),
  status: text('status').notNull(),
  priceFactor: doublePrecision('price_factor').default(1).notNull(),
  shareFactor: doublePrecision('share_factor').default(1).notNull(),
  dividend: doublePrecision('dividend').default(0).notNull(),
  note: text('note'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  symbolDateIdx: uniqueIndex('corporate_actions_symbol_date_idx').on(table.symbol, table.exDate),
  statusIdx: index('corporate_actions_status_idx').on(table.status),
}))

/**
 * What each traded symbol is. Exchange-traded funds and rights entitlements
 * trade alongside shares and must stay out of stock rankings
 * (lib/market-data/classify.ts).
 */
export const securities = pgTable('securities', {
  symbol: text('symbol').primaryKey(),
  name: text('name'),
  kind: text('kind').notNull(), // 'stock' | 'fund' | 'rights'
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * The picks each Monthly Plan mode made at a month-end, frozen when made.
 * Later price corrections never change a row, so the track record built from
 * these is a genuine forward record (lib/portfolio/track-record.ts).
 */
export const monthlySignals = pgTable('monthly_signals', {
  id: serial('id').primaryKey(),
  mode: text('mode').notNull(),
  signalDate: date('signal_date').notNull(),
  /** Best first: { symbol, rank, scorePct, close } */
  picks: jsonb('picks').$type<Array<{ symbol: string; rank: number; scorePct: number; close: number }>>().notNull(),
  /** Whether the trend filter would have been invested (NIFTY 200 above its 200-day average). */
  trendInvested: boolean('trend_invested').notNull(),
  universeSize: integer('universe_size').notNull(),
  rankedCount: integer('ranked_count').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (table) => ({
  modeDateIdx: uniqueIndex('monthly_signals_mode_date_idx').on(table.mode, table.signalDate),
}))

/** One row per run of the market-data update, so a failure is visible instead of silent. */
export const marketDataRuns = pgTable('market_data_runs', {
  id: serial('id').primaryKey(),
  ranAt: timestamp('ran_at').defaultNow().notNull(),
  ok: boolean('ok').notNull(),
  latestDate: date('latest_date'),
  summary: jsonb('summary').notNull(),
})

/**
 * A paper model portfolio. `kind` is 'core' (factor index funds) or
 * 'satellite' (stock momentum). One of each per user.
 */
export const modelPortfolios = pgTable('model_portfolios', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  kind: text('kind').notNull(),
  mode: text('mode').notNull(),
  startingCapital: doublePrecision('starting_capital').notNull(),
  cash: doublePrecision('cash').notNull(),
  holdings: jsonb('holdings').notNull(), // { [symbol]: { qty, avgPrice } }
  lastRebalance: date('last_rebalance'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userKindIdx: uniqueIndex('model_portfolios_user_kind_idx').on(table.userId, table.kind),
}))

/** Rebalances and daily value snapshots, for the equity curve and audit trail. */
export const modelPortfolioEvents = pgTable('model_portfolio_events', {
  id: serial('id').primaryKey(),
  portfolioId: integer('portfolio_id').references(() => modelPortfolios.id).notNull(),
  date: date('date').notNull(),
  type: text('type').notNull(), // 'rebalance' | 'snapshot'
  value: doublePrecision('value').notNull(),
  cash: doublePrecision('cash').notNull(),
  holdings: jsonb('holdings').notNull(),
  details: jsonb('details'), // orders/fills/regime/ranking for rebalances
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  portfolioDateIdx: index('model_portfolio_events_portfolio_date_idx').on(table.portfolioId, table.date),
}))
