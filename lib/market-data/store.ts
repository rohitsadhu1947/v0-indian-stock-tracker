/**
 * Local research store: one SQLite file (data/market.db, gitignored) holding
 * the full NSE history. The cloud database only keeps what the live app
 * needs; backtests read from here.
 *
 * Dates are integers (YYYYMMDD). Prices in raw_bars are exactly as NSE
 * published them, under the symbol traded that day.
 */
import { DatabaseSync } from 'node:sqlite'

export const STORE_PATH = 'data/market.db'

export const toDateInt = (iso: string): number => Number(iso.replaceAll('-', ''))
export const toIsoDate = (d: number): string => {
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export function openStore(path: string = STORE_PATH): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec(`
    pragma journal_mode = wal;
    pragma synchronous = normal;

    create table if not exists raw_bars (
      symbol text not null, date integer not null, series text not null,
      prev_close real, open real not null, high real not null, low real not null, close real not null,
      volume real not null, value real not null, trades integer not null,
      deliv_qty real,
      primary key (symbol, date)
    ) without rowid;
    create index if not exists raw_bars_date on raw_bars (date);

    create table if not exists index_bars (
      name text not null, date integer not null,
      open real, high real, low real, close real not null,
      primary key (name, date)
    ) without rowid;

    -- Corporate actions as published; the same action is listed on many days
    create table if not exists corporate_actions_raw (
      symbol text not null, ex_date integer not null, purpose text not null,
      first_seen integer not null,
      primary key (symbol, ex_date, purpose)
    ) without rowid;

    -- Shares outstanding and face value, recorded only when they change
    create table if not exists share_capital (
      symbol text not null, date integer not null,
      face_value real not null, shares real not null,
      primary key (symbol, date)
    ) without rowid;

    create table if not exists symbol_changes (
      old_symbol text not null, new_symbol text not null, effective_date integer not null,
      primary key (old_symbol, effective_date)
    ) without rowid;

    -- Latest name NSE printed for each traded symbol (used to tell funds from companies)
    create table if not exists security_names (
      symbol text primary key, name text not null, last_seen integer not null
    ) without rowid;

    -- Board meetings called to approve financial results: the results date
    create table if not exists results_dates (
      symbol text not null, date integer not null, first_seen integer not null,
      primary key (symbol, date)
    ) without rowid;

    create table if not exists ingested_days (date integer primary key);
  `)
  return db
}
