import { describe, it, expect } from 'vitest'
import {
  PaperPositionSchema,
  WatchlistItemSchema,
  BacktestConfigSchema,
} from '../validation'

// ---------------------------------------------------------------------------
// PaperPositionSchema
// ---------------------------------------------------------------------------
describe('PaperPositionSchema', () => {
  const validInput = {
    symbol: 'RELIANCE',
    entryPrice: 2500,
    quantity: 10,
  }

  it('accepts valid input with defaults', () => {
    const result = PaperPositionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exchange).toBe('NSE')
      expect(result.data.positionType).toBe('BUY')
    }
  })

  it('uppercases symbol', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, symbol: 'reliance' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.symbol).toBe('RELIANCE')
    }
  })

  it('rejects negative entryPrice', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, entryPrice: -100 })
    expect(result.success).toBe(false)
  })

  it('rejects zero entryPrice', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, entryPrice: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects quantity of 0', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, quantity: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, quantity: -5 })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer quantity', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, quantity: 2.5 })
    expect(result.success).toBe(false)
  })

  it('rejects empty symbol', () => {
    const result = PaperPositionSchema.safeParse({ ...validInput, symbol: '' })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = PaperPositionSchema.safeParse({
      ...validInput,
      stopLoss: 2400,
      target1: 2600,
      target2: 2700,
      strategy: 'momentum',
      notes: 'test note',
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// WatchlistItemSchema
// ---------------------------------------------------------------------------
describe('WatchlistItemSchema', () => {
  it('accepts valid input', () => {
    const result = WatchlistItemSchema.safeParse({ symbol: 'TCS' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.symbol).toBe('TCS')
      expect(result.data.exchange).toBe('NSE')
    }
  })

  it('uppercases symbol', () => {
    const result = WatchlistItemSchema.safeParse({ symbol: 'infy' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.symbol).toBe('INFY')
    }
  })

  it('rejects empty symbol', () => {
    const result = WatchlistItemSchema.safeParse({ symbol: '' })
    expect(result.success).toBe(false)
  })

  it('accepts BSE exchange', () => {
    const result = WatchlistItemSchema.safeParse({ symbol: 'TCS', exchange: 'BSE' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.exchange).toBe('BSE')
    }
  })

  it('rejects invalid exchange', () => {
    const result = WatchlistItemSchema.safeParse({ symbol: 'TCS', exchange: 'NYSE' })
    expect(result.success).toBe(false)
  })

  it('accepts optional instrumentToken', () => {
    const result = WatchlistItemSchema.safeParse({ symbol: 'TCS', instrumentToken: 12345 })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BacktestConfigSchema
// ---------------------------------------------------------------------------
describe('BacktestConfigSchema', () => {
  const validConfig = {
    startDate: '2024-01-01',
    endDate: '2024-06-30',
    initialCapital: 300000,
    riskPercent: 1.5,
  }

  it('accepts valid input', () => {
    const result = BacktestConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  it('rejects invalid start date', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, startDate: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid end date', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, endDate: 'garbage' })
    expect(result.success).toBe(false)
  })

  it('rejects negative initial capital', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, initialCapital: -1000 })
    expect(result.success).toBe(false)
  })

  it('rejects zero initial capital', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, initialCapital: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects excessively large capital (> 100M)', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, initialCapital: 200_000_000 })
    expect(result.success).toBe(false)
  })

  it('rejects riskPercent below 0.1', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, riskPercent: 0.05 })
    expect(result.success).toBe(false)
  })

  it('rejects riskPercent above 100', () => {
    const result = BacktestConfigSchema.safeParse({ ...validConfig, riskPercent: 101 })
    expect(result.success).toBe(false)
  })

  it('accepts optional symbols array', () => {
    const result = BacktestConfigSchema.safeParse({
      ...validConfig,
      symbols: ['RELIANCE', 'TCS'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty symbols array', () => {
    const result = BacktestConfigSchema.safeParse({
      ...validConfig,
      symbols: [],
    })
    expect(result.success).toBe(false)
  })
})
