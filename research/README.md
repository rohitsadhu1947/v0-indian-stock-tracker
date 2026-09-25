# Strategy research (Sep 2026)

Portfolio-level factor research on NSE data from Kite. Data files are not committed;
put Kite daily bars in `research/bars/<SYMBOL>.json` and index closes in
`research/idx/<NAME>.json` (both gitignored), then:

    python3 research/research.py ind_nifty500list.csv   # stock-level factor portfolios
    python3 research/factor_indices.py                   # NSE factor indices (no hindsight bias)

Rules: signals from the previous close, trades at the next open, 0.225% cost per side,
Rs 10 Cr/day liquidity screen, cash at 6.5%.

Caveat: `research.py` uses TODAY's index constituents, so it has survivorship bias
(it overstates results, most for momentum). `factor_indices.py` uses NSE's published
factor indices, which are built from point-in-time constituents, and is the credible reference.
