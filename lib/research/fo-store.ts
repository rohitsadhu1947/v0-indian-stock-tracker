/**
 * Local store for F&O history: data/fo.db (gitignored). Built by
 * scripts/data/fo-ingest.ts from NSE's daily files. Dates are YYYYMMDD.
 */
import { DatabaseSync } from 'node:sqlite'

export const FO_STORE_PATH = 'data/fo.db'

export function openFoStore(path: string = FO_STORE_PATH): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec(`
    pragma journal_mode = wal;
    pragma synchronous = normal;

    -- One row per futures contract per day. oi is in shares, contracts is volume, value is notional rupees
    create table if not exists fo_futures (
      symbol text not null, date integer not null, expiry integer not null, is_index integer not null,
      open real, high real, low real, close real not null, settle real,
      contracts real not null, value real not null, oi real not null, chg_oi real not null,
      primary key (symbol, date, expiry)
    ) without rowid;
    create index if not exists fo_futures_date on fo_futures (date);

    -- One row per underlying per day, summed from its option contracts
    create table if not exists fo_options (
      symbol text not null, date integer not null, is_index integer not null,
      call_oi real not null, put_oi real not null, call_chg_oi real not null, put_chg_oi real not null,
      call_contracts real not null, put_contracts real not null,
      near_expiry integer not null, near_call_oi real not null, near_put_oi real not null,
      near_call_contracts real not null, near_put_contracts real not null,
      max_pain real, top_call_strike real, top_put_strike real,
      atm_strike real, atm_call real, atm_put real,
      primary key (symbol, date)
    ) without rowid;
    create index if not exists fo_options_date on fo_options (date);

    -- Open interest in contracts by participant type: Client, DII, FII, Pro
    create table if not exists fo_participants (
      date integer not null, client text not null,
      fut_index_long real, fut_index_short real, fut_stock_long real, fut_stock_short real,
      opt_index_call_long real, opt_index_put_long real, opt_index_call_short real, opt_index_put_short real,
      opt_stock_call_long real, opt_stock_put_long real, opt_stock_call_short real, opt_stock_put_short real,
      primary key (date, client)
    ) without rowid;

    -- Stocks barred from new positions on a trade date
    create table if not exists fo_ban (
      date integer not null, symbol text not null,
      primary key (date, symbol)
    ) without rowid;

    -- NIFTY options contract by contract: only those that traded or had open interest, expiring within 100 days.
    -- Prices are rupees a share. Built by scripts/data/fo-nifty-options.ts
    create table if not exists nifty_options (
      date integer not null, expiry integer not null, strike real not null, type text not null,
      open real, high real, low real, close real not null, settle real,
      contracts real not null, oi real not null,
      primary key (date, expiry, strike, type)
    ) without rowid;
    create index if not exists nifty_options_expiry on nifty_options (expiry, strike, type, date);
    create table if not exists nifty_options_days (date integer primary key, rows integer not null);

    -- Days already fetched. contracts = 0 means NSE had no F&O file for the day
    create table if not exists fo_days (
      date integer primary key, contracts integer not null, participants integer not null, ban integer not null
    );
  `)
  return db
}
