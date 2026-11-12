-- What each traded symbol is, so funds and rights entitlements stay out of
-- stock rankings (see lib/market-data/classify.ts).
CREATE TABLE IF NOT EXISTS securities (
  symbol text PRIMARY KEY,
  name text,
  kind text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
