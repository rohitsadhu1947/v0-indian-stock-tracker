/**
 * Database Schema for Indian Stock Tracker
 * Using Drizzle ORM with Neon PostgreSQL
 */

import { pgTable, text, serial, integer, real, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
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
  positionId: integer('position_id').references(() => positions.id),
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
// RELATIONS (Optional, for Drizzle Queries)
// ============================================

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  watchlists: many(watchlists),
  positions: many(positions),
  paperPositions: many(paperPositions),
  screenerResults: many(screenerResults),
  tradeHistory: many(tradeHistory),
  alerts: many(alerts),
  preferences: one(userPreferences),
  permissions: one(userPermissions), // NEW
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

