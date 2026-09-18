-- trade_history.position_id referenced positions(id), but paper exits insert
-- paper_positions ids, so every insert failed the FK and was swallowed.
-- Drop the FK and record which table the id belongs to.
ALTER TABLE trade_history DROP CONSTRAINT IF EXISTS trade_history_position_id_positions_id_fk;
ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'paper';
CREATE INDEX IF NOT EXISTS trade_history_source_idx ON trade_history (source);
