import { z } from 'zod'

export const PaperPositionSchema = z.object({
  symbol: z.string().min(1).max(20).transform(s => s.toUpperCase()),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  positionType: z.enum(['BUY', 'SELL']).default('BUY'),
  entryPrice: z.number().positive('Entry price must be positive'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  stopLoss: z.number().positive('Stop loss must be positive').optional(),
  target1: z.number().positive().optional(),
  target2: z.number().positive().optional(),
  strategy: z.string().optional(),
  notes: z.string().max(500).optional(),
})

export const WatchlistItemSchema = z.object({
  symbol: z.string().min(1).max(20).transform(s => s.toUpperCase()),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  instrumentToken: z.number().optional(),
})

export const BacktestConfigSchema = z.object({
  startDate: z.string().refine(d => !isNaN(Date.parse(d)), 'Invalid start date'),
  endDate: z.string().refine(d => !isNaN(Date.parse(d)), 'Invalid end date'),
  initialCapital: z.number().positive().max(100_000_000, 'Capital too large'),
  riskPercent: z.number().min(0.1).max(100),
  symbols: z.array(z.string()).min(1).optional(),
})
