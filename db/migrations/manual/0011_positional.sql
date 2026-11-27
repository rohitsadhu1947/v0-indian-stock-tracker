-- Results dates from NSE's board-meeting file, and the positional trades signalled from them (lib/positional).
CREATE TABLE IF NOT EXISTS results_dates (
  symbol text NOT NULL,
  date date NOT NULL,
  PRIMARY KEY (symbol, date)
);
CREATE INDEX IF NOT EXISTS results_dates_date_idx ON results_dates (date);

-- status: new (signalled, to buy next session), open, closed, skipped (no price on the entry session)
CREATE TABLE IF NOT EXISTS positional_trades (
  id serial PRIMARY KEY,
  signal text NOT NULL,
  symbol text NOT NULL,
  signal_date date NOT NULL,
  status text NOT NULL DEFAULT 'new',
  entry_date date,
  entry_price double precision,
  exit_date date,
  exit_price double precision,
  net_pct double precision,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal, symbol, signal_date)
);
CREATE INDEX IF NOT EXISTS positional_trades_status_idx ON positional_trades (status);
