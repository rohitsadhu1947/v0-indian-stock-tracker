-- Quarterly results for the screener, fetched from the Drishti API (scripts/fundamentals/fetch.ts).
CREATE TABLE IF NOT EXISTS quarterly_results (
  symbol text NOT NULL,
  quarter text NOT NULL,
  period_label text,
  filed_at timestamptz NOT NULL,
  basis text NOT NULL,
  revenue_cr double precision,
  revenue_yoy_pct double precision,
  operating_profit_cr double precision,
  pat_cr double precision,
  pat_yoy_pct double precision,
  eps double precision,
  eps_ttm double precision,
  summary text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, quarter)
);
CREATE INDEX IF NOT EXISTS quarterly_results_filed_idx ON quarterly_results (symbol, filed_at);
