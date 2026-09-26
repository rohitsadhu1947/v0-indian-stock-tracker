-- Portfolio engine: daily bars and paper model portfolios (see lib/portfolio).
CREATE TABLE IF NOT EXISTS daily_bars (
  symbol text NOT NULL,
  date date NOT NULL,
  open double precision NOT NULL,
  high double precision NOT NULL,
  low double precision NOT NULL,
  close double precision NOT NULL,
  volume double precision NOT NULL,
  provisional boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_bars_symbol_date_idx ON daily_bars (symbol, date);
CREATE INDEX IF NOT EXISTS daily_bars_date_idx ON daily_bars (date);

CREATE TABLE IF NOT EXISTS model_portfolios (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  mode text NOT NULL,
  starting_capital double precision NOT NULL,
  cash double precision NOT NULL,
  holdings jsonb NOT NULL,
  last_rebalance date,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS model_portfolios_user_kind_idx ON model_portfolios (user_id, kind);

CREATE TABLE IF NOT EXISTS model_portfolio_events (
  id serial PRIMARY KEY,
  portfolio_id integer NOT NULL REFERENCES model_portfolios(id),
  date date NOT NULL,
  type text NOT NULL,
  value double precision NOT NULL,
  cash double precision NOT NULL,
  holdings jsonb NOT NULL,
  details jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_portfolio_events_portfolio_date_idx ON model_portfolio_events (portfolio_id, date);
