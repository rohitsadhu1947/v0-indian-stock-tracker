-- Frozen month-end picks of each Monthly Plan mode, for the live track record.
CREATE TABLE IF NOT EXISTS monthly_signals (
  id serial PRIMARY KEY,
  mode text NOT NULL,
  signal_date date NOT NULL,
  picks jsonb NOT NULL,
  trend_invested boolean NOT NULL,
  universe_size integer NOT NULL,
  ranked_count integer NOT NULL,
  recorded_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS monthly_signals_mode_date_idx ON monthly_signals (mode, signal_date);
