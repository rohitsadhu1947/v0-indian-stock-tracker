-- Market data foundation: official NSE bars with turnover and delivery,
-- corporate actions, and a log of update runs (see lib/market-data).
ALTER TABLE daily_bars ADD COLUMN IF NOT EXISTS turnover double precision;
ALTER TABLE daily_bars ADD COLUMN IF NOT EXISTS delivery_qty double precision;

CREATE TABLE IF NOT EXISTS corporate_actions (
  symbol text NOT NULL,
  ex_date date NOT NULL,
  purposes jsonb NOT NULL,
  status text NOT NULL,
  price_factor double precision NOT NULL DEFAULT 1,
  share_factor double precision NOT NULL DEFAULT 1,
  dividend double precision NOT NULL DEFAULT 0,
  note text,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS corporate_actions_symbol_date_idx ON corporate_actions (symbol, ex_date);
CREATE INDEX IF NOT EXISTS corporate_actions_status_idx ON corporate_actions (status);

CREATE TABLE IF NOT EXISTS market_data_runs (
  id serial PRIMARY KEY,
  ran_at timestamp NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  latest_date date,
  summary jsonb NOT NULL
);
