"""
Factor research on NSE data (Kite daily bars, NIFTY 500 current constituents).

Rules that keep it honest:
  - Signals use closes up to day t-1; trades execute at day t OPEN.
  - Portfolios hold from one rebalance open to the next rebalance open.
  - Costs: 0.225% per side (STT/exchange/stamp/GST ~0.125% + 0.1% slippage)
    charged on actual turnover.
  - Liquidity screen: 60-day median traded value >= Rs 10 Cr at signal time.
  - Cash earns 6.5%/yr when a strategy is out of the market.
Known bias: universe = TODAY's NIFTY 500 (survivorship). This flatters
momentum/52w-high most. Cross-checked on NIFTY 100 (less churn) and by sub-period.
"""
import json, glob, os, sys
import numpy as np
import pandas as pd
from scipy.stats import norm

R = os.path.dirname(os.path.abspath(__file__))
COST_PER_SIDE = 0.00225
CASH_YIELD = 0.065
TOP_N = 20
MIN_TRADED_VALUE_CR = 10.0

# ── load ────────────────────────────────────────────────────────────────────
def load(universe_csv):
    syms = pd.read_csv(f"{R}/{universe_csv}")["Symbol"].tolist()
    frames = {}
    for s in syms + ["NIFTY_50", "INDIA_VIX"]:
        f = f"{R}/bars/{s}.json"
        if not os.path.exists(f):
            continue
        rows = json.load(open(f))
        if len(rows) < 260:
            continue
        df = pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"])
        df["date"] = pd.to_datetime(df["date"])
        frames[s] = df.set_index("date")
    idx = frames["NIFTY_50"].index
    panel = {k: pd.DataFrame({s: frames[s][k] for s in frames if s not in ("NIFTY_50", "INDIA_VIX")}).reindex(idx)
             for k in ["open", "high", "low", "close", "volume"]}
    return panel, frames["NIFTY_50"], frames.get("INDIA_VIX"), len(syms)

# ── helpers ─────────────────────────────────────────────────────────────────
def month_starts(idx):
    s = pd.Series(idx, index=idx)
    return [pd.Timestamp(x) for x in s.groupby([idx.year, idx.month]).first().values]

def week_starts(idx):
    s = pd.Series(idx, index=idx)
    iso = idx.isocalendar()
    return [pd.Timestamp(x) for x in s.groupby([iso.year.values, iso.week.values]).first().values]

def stats(equity, label, turnover=None):
    r = equity.pct_change().dropna()
    years = (equity.index[-1] - equity.index[0]).days / 365.25
    cagr = (equity.iloc[-1] / equity.iloc[0]) ** (1 / years) - 1
    vol = r.std() * np.sqrt(252)
    sharpe = (r.mean() * 252 - CASH_YIELD) / vol if vol > 0 else np.nan
    dd = (equity / equity.cummax() - 1).min()
    monthly = equity.resample("M").last().pct_change().dropna()
    yearly = equity.resample("Y").last().pct_change()
    yearly.iloc[0] = equity.resample("Y").last().iloc[0] / equity.iloc[0] - 1
    return {
        "strategy": label, "CAGR": cagr, "vol": vol, "sharpe": sharpe, "maxDD": dd,
        "calmar": cagr / abs(dd) if dd < 0 else np.nan,
        "pct_pos_months": (monthly > 0).mean(), "worst_month": monthly.min(),
        "turnover_yr": turnover, "yearly": {str(k.year): round(v * 100, 1) for k, v in yearly.items()},
    }

def run_portfolio(panel, rebal_dates, select_fn, label, weight_fn=None):
    """select_fn(t_idx) -> list of symbols (or [] for cash), using data < t."""
    op, close = panel["open"], panel["close"]
    idx = close.index
    equity = pd.Series(1.0, index=idx)
    weights = pd.Series(dtype=float)
    value = 1.0
    turnover_total = 0.0
    pos = {d: i for i, d in enumerate(idx)}
    rebal = [d for d in rebal_dates if pos[d] >= 260]
    start = pos[rebal[0]]
    holdings, trades = {}, []   # per-position entry/exit for "per trade" stats
    equity.iloc[:start + 1] = 1.0

    for k, d in enumerate(rebal):
        t = pos[d]
        picks = select_fn(t)
        today_open = op.iloc[t]
        for sym in list(holdings):
            if sym not in picks and not np.isnan(today_open.get(sym, np.nan)):
                e_px, e_t = holdings.pop(sym)
                trades.append({"ret": today_open[sym] / e_px - 1 - 2 * COST_PER_SIDE, "days": (idx[t] - idx[e_t]).days})
        for sym in picks:
            if sym not in holdings and not np.isnan(today_open.get(sym, np.nan)):
                holdings[sym] = (today_open[sym], t)
        target = pd.Series(1.0 / len(picks), index=picks) if picks else pd.Series(dtype=float)
        if weight_fn and picks:
            target = weight_fn(t, picks)
        # turnover vs drifted weights
        all_syms = target.index.union(weights.index)
        tv = (target.reindex(all_syms, fill_value=0) - weights.reindex(all_syms, fill_value=0)).abs().sum()
        turnover_total += tv
        value *= (1 - tv * COST_PER_SIDE)

        t_next = pos[rebal[k + 1]] if k + 1 < len(rebal) else len(idx) - 1
        # daily mark-to-market from today's open
        entry = op.iloc[t][target.index] if len(target) else None
        for j in range(t, t_next + 1):
            if len(target) == 0:
                days = (idx[j] - idx[t]).days
                equity.iloc[j] = value * (1 + CASH_YIELD) ** (days / 365.25)
                continue
            px = (op.iloc[t_next] if j == t_next else close.iloc[j])[target.index]
            rel = (px / entry).fillna(1.0)
            equity.iloc[j] = value * float((target * rel).sum())
        # carry
        if len(target):
            end_px = op.iloc[t_next][target.index]
            rel = (end_px / entry).fillna(1.0)
            grown = target * rel
            value *= float(grown.sum())
            weights = grown / grown.sum()
        else:
            value = equity.iloc[t_next]
            weights = pd.Series(dtype=float)
    last = close.iloc[-1]
    for sym, (e_px, e_t) in holdings.items():
        if not np.isnan(last.get(sym, np.nan)):
            trades.append({"ret": last[sym] / e_px - 1 - 2 * COST_PER_SIDE, "days": (idx[-1] - idx[e_t]).days})
    equity = equity.iloc[start:]
    years = (equity.index[-1] - equity.index[0]).days / 365.25
    st = stats(equity, label, turnover_total / years)
    if trades:
        tr = pd.DataFrame(trades)
        st.update({"n_trades": len(tr), "trade_win": (tr.ret > 0).mean(), "trade_avg": tr.ret.mean(),
                   "trade_median": tr.ret.median(), "trade_ge10": (tr.ret >= 0.10).mean(),
                   "avg_hold_days": tr.days.mean()})
    return st, equity

# ── signals ─────────────────────────────────────────────────────────────────
def build(panel, nifty):
    close, vol = panel["close"], panel["volume"]
    tv_cr = (close * vol / 1e7).rolling(60, min_periods=40).median()
    ret = close.pct_change(fill_method=None)
    mom_12_1 = close.shift(21) / close.shift(252) - 1
    vol_1y = ret.rolling(252, min_periods=200).std() * np.sqrt(252)
    hi52 = close / close.rolling(252, min_periods=200).max()
    ma200 = close.rolling(200, min_periods=180).mean()
    r5 = close / close.shift(5) - 1
    n_close = nifty["close"].reindex(close.index)
    n_ma200 = n_close.rolling(200).mean()
    return dict(tv_cr=tv_cr, mom=mom_12_1, vol=vol_1y, riskadj=mom_12_1 / vol_1y,
                hi52=hi52, ma200=ma200, r5=r5, close=close, n_close=n_close, n_ma200=n_ma200)

def liquid(sig, t):
    tv = sig["tv_cr"].iloc[t - 1]
    return tv[tv >= MIN_TRADED_VALUE_CR].index

def top(series_row, universe, n=TOP_N, ascending=False):
    s = series_row.reindex(universe).dropna()
    return list(s.sort_values(ascending=ascending).index[:n])

def market_up(sig, t):
    return sig["n_close"].iloc[t - 1] > sig["n_ma200"].iloc[t - 1]

# ── strategies ──────────────────────────────────────────────────────────────
def strategies(panel, nifty, vix):
    sig = build(panel, nifty)
    idx = panel["close"].index
    months, weeks = month_starts(idx), week_starts(idx)
    out, curves = [], {}

    def add(name, dates, fn, weight_fn=None):
        st, eq = run_portfolio(panel, dates, fn, name, weight_fn)
        out.append(st); curves[name] = eq

    add("EW universe (benchmark)", months, lambda t: list(liquid(sig, t)))
    add("Momentum 12-1", months, lambda t: top(sig["mom"].iloc[t - 1], liquid(sig, t)))
    add("Risk-adj momentum", months, lambda t: top(sig["riskadj"].iloc[t - 1], liquid(sig, t)))
    add("Risk-adj momentum + NIFTY trend filter", months,
        lambda t: top(sig["riskadj"].iloc[t - 1], liquid(sig, t)) if market_up(sig, t) else [])
    add("Low volatility", months, lambda t: top(sig["vol"].iloc[t - 1], liquid(sig, t), ascending=True))
    add("52-week-high proximity", months, lambda t: top(sig["hi52"].iloc[t - 1], liquid(sig, t)))

    def composite(t):
        u = liquid(sig, t)
        m = sig["riskadj"].iloc[t - 1].reindex(u).rank(pct=True)
        v = (-sig["vol"].iloc[t - 1]).reindex(u).rank(pct=True)
        return top((m + v) / 2, u)
    add("Momentum + low-vol composite", months, composite)
    add("Momentum + low-vol composite + trend filter", months,
        lambda t: composite(t) if market_up(sig, t) else [])

    def reversal(t):
        u = liquid(sig, t)
        c, ma = sig["close"].iloc[t - 1], sig["ma200"].iloc[t - 1]
        uptrend = (c > ma).reindex(u)
        u = uptrend[uptrend].index
        return top(sig["r5"].iloc[t - 1], u, n=10, ascending=True)
    add("Short-term reversal in uptrends (weekly)", weeks, reversal)

    # NIFTY buy & hold (price index) and NIFTY with 200DMA timing
    n = nifty["close"].reindex(idx)
    start = idx[260]
    bh = (n / n.loc[start]).loc[start:]
    out.append(stats(bh, "NIFTY 50 buy & hold (price, ex-div)")); curves["NIFTY"] = bh
    # NIFTY timed on its 200DMA (yesterday's close vs MA), cash at 6.5% otherwise
    nr = n.pct_change().loc[start:]
    in_mkt = (n > n.rolling(200).mean()).shift(1).loc[start:]
    daily = np.where(in_mkt, nr, CASH_YIELD / 252)
    switches = in_mkt.astype(int).diff().abs().fillna(0)
    daily = daily - switches.values * COST_PER_SIDE
    timed = pd.Series((1 + pd.Series(daily, index=nr.index).fillna(0)).cumprod().values, index=nr.index)
    out.append(stats(timed, "NIFTY 50 with 200DMA timing"))
    return out, curves

# ── volatility risk premium ─────────────────────────────────────────────────
def bs_call(S, K, T, s):
    d1 = (np.log(S / K) + 0.5 * s * s * T) / (s * np.sqrt(T)); d2 = d1 - s * np.sqrt(T)
    return S * norm.cdf(d1) - K * norm.cdf(d2)

def bs_put(S, K, T, s):
    d1 = (np.log(S / K) + 0.5 * s * s * T) / (s * np.sqrt(T)); d2 = d1 - s * np.sqrt(T)
    return K * norm.cdf(-d2) - S * norm.cdf(-d1)

def vrp(nifty, vix):
    df = pd.DataFrame({"S": nifty["close"], "vix": vix["close"]}).dropna()
    lr = np.log(df["S"]).diff()
    df["rv_fwd"] = lr[::-1].rolling(21).std()[::-1].shift(-1) * np.sqrt(252) * 100
    d = df.dropna()
    spread = d["vix"] - d["rv_fwd"]
    res = {"days": len(d), "mean_implied": d["vix"].mean(), "mean_realized": d["rv_fwd"].mean(),
           "mean_spread": spread.mean(), "pct_implied_gt_realized": (spread > 0).mean()}

    # Monthly iron condors on NIFTY, as a desk would size them.
    # IV = India VIX, flat across strikes. Real skew makes OTM puts dearer, so the
    # long put wing costs more than modelled: treat results as optimistic.
    # Costs: 4 legs x ~1.5 index points slippage + fees ~= 0.03% of spot per cycle.
    T = 21 / 252
    def condor(short_sd, long_sd, risk_frac, vix_min=0.0, vrp_filter=False):
        rows = []
        lr = np.log(df["S"]).diff()
        trail_rv = lr.rolling(21).std() * np.sqrt(252) * 100
        for i in range(21, len(df) - 21, 21):
            S0, S1, iv = df["S"].iloc[i], df["S"].iloc[i + 21], df["vix"].iloc[i] / 100
            if df["vix"].iloc[i] < vix_min or (vrp_filter and df["vix"].iloc[i] <= trail_rv.iloc[i]):
                rows.append({"date": df.index[i], "r": 0.0}); continue
            sd = S0 * iv * np.sqrt(T)
            kc, kp, lc, lp = S0 + short_sd * sd, S0 - short_sd * sd, S0 + long_sd * sd, S0 - long_sd * sd
            credit = bs_call(S0, kc, T, iv) - bs_call(S0, lc, T, iv) + bs_put(S0, kp, T, iv) - bs_put(S0, lp, T, iv)
            width = (long_sd - short_sd) * sd
            loss = min(max(S1 - kc, 0), width) + min(max(kp - S1, 0), width)
            pnl = credit - loss - 0.0003 * S0
            max_risk = width - credit
            rows.append({"date": df.index[i], "r": risk_frac * pnl / max_risk})
        m = pd.DataFrame(rows).set_index("date")["r"]
        eq = (1 + m).cumprod()
        yrs = (m.index[-1] - m.index[0]).days / 365.25
        traded = m[m != 0]
        return {"cycles_traded": len(traded), "win_rate": (traded > 0).mean(),
                "CAGR": eq.iloc[-1] ** (1 / yrs) - 1, "maxDD": (eq / eq.cummax() - 1).min(),
                "worst_month": m.min()}
    res["condor_1sd_2sd_risk20"] = condor(1.0, 2.0, 0.20)
    res["condor_1sd_2sd_risk20_vrpfilter"] = condor(1.0, 2.0, 0.20, vrp_filter=True)
    res["condor_1.5sd_2.5sd_risk20"] = condor(1.5, 2.5, 0.20)
    res["condor_1.5sd_2.5sd_risk20_vrpfilter"] = condor(1.5, 2.5, 0.20, vrp_filter=True)
    return res

if __name__ == "__main__":
    uni = sys.argv[1] if len(sys.argv) > 1 else "ind_nifty500list.csv"
    panel, nifty, vix, n_listed = load(uni)
    print(f"Universe {uni}: {panel['close'].shape[1]} of {n_listed} symbols loaded, "
          f"{panel['close'].index[0].date()} -> {panel['close'].index[-1].date()}\n")
    res, curves = strategies(panel, nifty, vix)
    cols = ["strategy", "CAGR", "vol", "sharpe", "maxDD", "calmar", "pct_pos_months", "turnover_yr"]
    t = pd.DataFrame(res)
    pd.set_option("display.width", 200)
    fmt = t[cols].copy()
    for c in ["CAGR", "vol", "maxDD", "pct_pos_months"]:
        fmt[c] = (fmt[c] * 100).round(1)
    for c in ["sharpe", "calmar", "turnover_yr"]:
        fmt[c] = fmt[c].astype(float).round(2)
    print(fmt.to_string(index=False))
    print("\nPer-position (entry to exit, after costs):")
    tt = t[["strategy", "n_trades", "trade_win", "trade_avg", "trade_median", "trade_ge10", "avg_hold_days"]].dropna()
    for c in ["trade_win", "trade_avg", "trade_median", "trade_ge10"]:
        tt[c] = (tt[c] * 100).round(1)
    tt["avg_hold_days"] = tt["avg_hold_days"].round(0)
    print(tt.to_string(index=False))
    print("\nCalendar-year returns (%):")
    print(pd.DataFrame({r["strategy"][:44]: r["yearly"] for r in res}).T.to_string())
    if vix is not None:
        print("\nVolatility risk premium (NIFTY, India VIX):")
        for k, v in vrp(nifty, vix).items():
            if isinstance(v, dict):
                print(f"  {k:38s} " + "  ".join(f"{a}={b:.3f}" if isinstance(b, float) else f"{a}={b}" for a, b in v.items()))
            else:
                print(f"  {k:38s} {v:.3f}" if isinstance(v, float) else f"  {k:38s} {v}")
    json.dump(res, open(f"{R}/results_{uni.split('.')[0]}.json", "w"), default=str, indent=1)
