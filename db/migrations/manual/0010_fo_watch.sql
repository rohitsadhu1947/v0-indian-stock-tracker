-- Paper tracking of two F&O day-trade signals (lib/fo-watch). No orders are placed.
CREATE TABLE IF NOT EXISTS fo_stock_days (
  symbol text NOT NULL,
  date date NOT NULL,
  call_contracts double precision NOT NULL,
  put_contracts double precision NOT NULL,
  PRIMARY KEY (symbol, date)
);
CREATE INDEX IF NOT EXISTS fo_stock_days_date_idx ON fo_stock_days (date);

CREATE TABLE IF NOT EXISTS paper_day_trades (
  id serial PRIMARY KEY,
  signal text NOT NULL,
  symbol text NOT NULL,
  signal_date date NOT NULL,
  trade_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  entry_price double precision,
  exit_price double precision,
  stopped boolean,
  gross_pct double precision,
  net_pct double precision,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (signal, symbol, trade_date)
);
CREATE INDEX IF NOT EXISTS paper_day_trades_trade_date_idx ON paper_day_trades (trade_date);
