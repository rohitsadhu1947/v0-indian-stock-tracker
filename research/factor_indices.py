import json, glob, os
import numpy as np, pandas as pd
R = os.path.dirname(os.path.abspath(__file__))
CASH = 0.065; COST = 0.00225
s = {}
for f in glob.glob(f"{R}/idx/*.json"):
    d = pd.DataFrame(json.load(open(f)), columns=["date", "close"])
    d["date"] = pd.to_datetime(d["date"]); d = d.drop_duplicates("date").set_index("date")["close"].sort_index()
    # Kite index history has spike-and-revert bad ticks (e.g. +472% then -83%).
    # Drop any point whose move is >12% and is mostly undone the next day.
    for _ in range(5):
        r = d.pct_change(); nxt = r.shift(-1)
        bad = (r.abs() > 0.12) & (np.sign(r) != np.sign(nxt)) & (nxt.abs() > 0.6 * r.abs() / (1 + r.abs()))
        if not bad.any(): break
        d = d[~bad]
    name = os.path.basename(f)[:-5]
    r = d.pct_change().dropna()
    if r.std() * np.sqrt(252) > 0.40 and name != "INDIA_VIX":
        print(f"(excluded {name}: data still unreliable after cleaning)")
        continue
    s[name] = d
px = pd.DataFrame(s).sort_index()
px = px[px.index.dayofweek < 5].dropna(how="all").ffill()
vix = px.pop("INDIA_VIX")
px = px.loc["2013-06-01":]
vix = vix.reindex(px.index).ffill()  # common start with enough history

def st(eq, name):
    r = eq.pct_change().dropna(); yrs = (eq.index[-1] - eq.index[0]).days / 365.25
    cagr = (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1; vol = r.std() * np.sqrt(252)
    dd = (eq / eq.cummax() - 1).min()
    return dict(strategy=name, CAGR=cagr * 100, vol=vol * 100, sharpe=(r.mean() * 252 - CASH) / vol, maxDD=dd * 100,
                calmar=cagr / abs(dd))

rows = [st(px[c].dropna(), c) for c in px.columns]
t = pd.DataFrame(rows).sort_values("sharpe", ascending=False).round(2)
print("Factor indices, Jun 2013 -> Sep 2026 (price return, dividends excluded)\n")
print(t.to_string(index=False))

yr = px.resample("Y").last().pct_change().mul(100).round(1)
cols = ["NIFTY_50", "NIFTY_200", "NIFTY200MOMENTM30", "NIFTY500MOMENTM50", "NIFTY_ALPHA_50",
        "NIFTY200_QUALTY30", "NIFTY500_LOWVOL50", "NIFTY500_VALUE_50", "NIFTY_MIDCAP_150"]
print("\nCalendar-year returns (%):")
print(yr[[c for c in cols if c in yr.columns]].iloc[1:].T.rename(columns=lambda d: d.year).to_string())

# ── Overlays on the momentum index ─────────────────────────────────────────
def timed(series, signal, name):
    r = series.pct_change()
    inn = signal.shift(1).fillna(False)
    daily = np.where(inn, r, CASH / 252)
    sw = inn.astype(int).diff().abs().fillna(0)
    eq = pd.Series((1 + pd.Series(daily, index=r.index).fillna(0) - sw * COST).cumprod().values, index=r.index)
    out = st(eq, name); out["pct_invested"] = inn.mean() * 100; return out, eq

m = px["NIFTY200MOMENTM30"]; n200 = px["NIFTY_200"]
ov = []
ov.append(st(m, "Momentum30 buy & hold"))
ov.append(timed(m, m > m.rolling(200).mean(), "Momentum30, own 200DMA filter")[0])
ov.append(timed(m, n200 > n200.rolling(200).mean(), "Momentum30, NIFTY200 200DMA filter")[0])
ov.append(timed(m, (m > m.rolling(200).mean()) & (vix < 25), "Momentum30, 200DMA + VIX<25")[0])

# Dual momentum rotation: monthly, hold the factor index with best 6m return
# among a small menu if that return beats cash, else cash.
menu = [c for c in ["NIFTY200MOMENTM30", "NIFTY200_QUALTY30", "NIFTY500_LOWVOL50", "NIFTY500_VALUE_50", "NIFTY_ALPHA_50", "NIFTY_50"] if c in px.columns]
mp = px[menu].dropna()
me = mp.resample("M").last()
look = me.pct_change(6)
hold = look.shift(0).idxmax(axis=1).where(look.max(axis=1) > CASH / 2, "CASH")
daily_r = mp.pct_change()
eq, prev, val = [], None, 1.0
held = hold.reindex(mp.index, method="ffill").shift(1)
for d, h in held.items():
    if pd.isna(h): eq.append(val); continue
    if h != prev and prev is not None: val *= (1 - 2 * COST)
    prev = h
    val *= (1 + (CASH / 252 if h == "CASH" else (daily_r.at[d, h] if not np.isnan(daily_r.at[d, h]) else 0)))
    eq.append(val)
rot = pd.Series(eq, index=mp.index)
ov.append(st(rot, "Factor rotation (6m dual momentum, monthly)"))
print("\nOverlays (switch cost 0.225%/side, cash 6.5%):")
print(pd.DataFrame(ov).round(2).to_string(index=False))
print("\nRotation holdings share:", (hold.value_counts(normalize=True) * 100).round(0).to_dict())

# ── Blends (monthly rebalanced), optionally with the NIFTY200 200DMA filter ──
def blend(weights, name, filt=None):
    cols = list(weights); p = px[cols].dropna(); r = p.pct_change().fillna(0)
    w = pd.Series(weights); me = set(p.resample("M").last().index)
    val, cur, eq = 1.0, w.copy(), []
    sig = None if filt is None else filt.reindex(p.index).shift(1).fillna(False)
    for d in p.index:
        if sig is not None and not sig[d]:
            val *= 1 + CASH / 252; eq.append(val); continue
        g = cur * (1 + r.loc[d]); val *= g.sum(); cur = g / g.sum()
        if d in me:
            val *= 1 - (cur - w).abs().sum() / 2 * COST * 2; cur = w.copy()
        eq.append(val)
    return st(pd.Series(eq, index=p.index), name)

f = n200 > n200.rolling(200).mean()
bl = [
    st(px["NIFTY_50"].dropna(), "NIFTY 50 (benchmark)"),
    blend({"NIFTY200MOMENTM30": 0.5, "NIFTY500_LOWVOL50": 0.5}, "50% Momentum30 + 50% LowVol50"),
    blend({"NIFTY500MOMENTM50": 0.5, "NIFTY500_LOWVOL50": 0.5}, "50% Momentum50 + 50% LowVol50"),
    blend({"NIFTY_ALPHA_50": 0.5, "NIFTY500_LOWVOL50": 0.5}, "50% Alpha50 + 50% LowVol50"),
    blend({"NIFTY500MOMENTM50": 0.4, "NIFTY500_LOWVOL50": 0.4, "NIFTY500_VALUE_50": 0.2}, "40 Mom50 / 40 LowVol50 / 20 Value50"),
    blend({"NIFTY500MOMENTM50": 0.5, "NIFTY500_LOWVOL50": 0.5}, "50/50 Mom50+LowVol50 + trend filter", f),
]
print("\nFactor blends (monthly rebalance, costs on rebalance):")
print(pd.DataFrame(bl).round(2).to_string(index=False))
print("\nCorrelation of monthly returns:")
mr = px[["NIFTY500MOMENTM50", "NIFTY500_LOWVOL50", "NIFTY500_VALUE_50", "NIFTY_50"]].resample("M").last().pct_change()
print(mr.corr().round(2).to_string())
