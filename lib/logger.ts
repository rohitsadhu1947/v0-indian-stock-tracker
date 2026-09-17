/**
 * Structured logger for server-side code.
 * - In production: emits JSON lines (parseable by log aggregators)
 * - In development: emits colorized human-readable output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  ts: string
  [key: string]: unknown
}

const isProd = process.env.NODE_ENV === 'production'

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? (isProd ? 'info' : 'debug')

const DEV_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // grey
  info:  '\x1b[36m', // cyan
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
}
const RESET = '\x1b[0m'

function emit(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return

  const ts = new Date().toISOString()

  if (isProd) {
    const entry: LogEntry = { level, message, ts, ...context }
    // Use appropriate console method so cloud platforms pick up the right severity
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(JSON.stringify(entry))
  } else {
    const color = DEV_COLORS[level]
    const prefix = `${color}[${level.toUpperCase().padEnd(5)}]${RESET} ${ts.slice(11, 23)}`
    const ctx = Object.keys(context).length ? ` ${JSON.stringify(context)}` : ''
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`${prefix} ${message}${ctx}`)
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info:  (message: string, context?: Record<string, unknown>) => emit('info',  message, context),
  warn:  (message: string, context?: Record<string, unknown>) => emit('warn',  message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
}

export default logger
