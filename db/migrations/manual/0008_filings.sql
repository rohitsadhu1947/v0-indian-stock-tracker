-- Company filings collected from NSE's public feed (scripts/filings/watch.ts).
CREATE TABLE IF NOT EXISTS filings (
  id text PRIMARY KEY,
  published_at timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL,
  company text NOT NULL,
  symbol text,
  rank integer,
  subject text NOT NULL,
  category text NOT NULL,
  text text NOT NULL,
  url text NOT NULL
);
CREATE INDEX IF NOT EXISTS filings_published_idx ON filings (published_at);
CREATE INDEX IF NOT EXISTS filings_symbol_idx ON filings (symbol, published_at);
