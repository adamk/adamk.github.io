# Live performance benchmarks

This separate market-data publisher writes only benchmark artifacts.
It does not calculate live P&L, fetch orders, place orders, or change account records.

Run after the existing canonical live index and trade-stat updates and before
their publication. Integrate these guarded calls into the existing
`/home/ubuntu/TradingDashboard/run_algo_dashboard_update.sh` job:

```sh
if ! python3 "$REPO/scripts/refresh_live_benchmarks.py" \
    --live "$REPO/data/algo-pnl.json" \
    --env-file /opt/foxchase-bot-dashboard/.env; then
    echo "WARNING: live benchmark refresh failed; existing benchmark asset retained"
fi
if ! python3 "$REPO/scripts/refresh_live_benchmarks.py" \
    --historical "$REPO/data/historical_comparison_20261003.json" \
    --if-needed; then
    echo "WARNING: historical cash refresh failed; existing benchmark asset retained"
fi
```

Include both `data/live-benchmarks.json` and `data/historical-cash-benchmark.json`
in the existing dashboard publication's explicit file list alongside
`data/algo-pnl.json`. Commit these assets in the same publication revision, after
all generators finish. Keep the existing cadence. Do not run
`scripts/export_alpaca_pnl.py` to refresh these benchmarks: it is a separate legacy
exporter and is not the canonical accounting publisher.

The existing job runs weekdays at 13:30/13:45 UTC, every 15 minutes from
14:00 through 20:45 UTC, and 21:00/21:15/21:30 UTC. No separate scheduler or
trading-service restart is needed. This window covers EDT and EST.

Treasury retrieval, parsing or full-period coverage validation failures return
nonzero **without replacing the prior file**. The guarded hook logs the failure
and continues canonical P&L publication. Each successful benchmark write uses
a flushed temporary file and atomic replacement. A retained cache is never
treated as a constant-rate fallback: the browser rechecks period alignment,
rate coverage and SPY snapshot timing. Unsupported cash/excess comparisons are
unavailable; canonical account performance remains independent.

## Sources and units

- Cash: U.S. Treasury Daily Treasury Par Yield Curve Rates XML, `BC_3MONTH`.
  Annualized percent on an investment/par-yield basis, not bank-discount `DTB3`.
  Data is fetched for the necessary years, including the preceding two weeks.
- SPY: existing Alpaca SIP Market Data v2, `adjustment=all`. Fractional-share
  adjusted-price comparison, with no separate double credit for dividends.
- Explicit Alpaca trading-calendar dates identify nontrading dates. There is no
  inference that an absent weekday price means the market was closed.

## Cash accrual

For each calendar interval `[d, d+1)`, choose the latest observation strictly
dated before `d`. Set `r_d = annual_yield_pct / 100 / 365`, then multiply the
previous index by `1 + r_d`. Start at exactly 100 on the first live date and plot
only on the existing live date axis. This is a date-resolution ACT/365 modeled
cash proxy: no intraday prorating, Treasury mark-to-market, fees or taxes.
The quoted yield is treated as a simple annual accrual rate, not an effective
annual return. Do not apply a square-root or trading-day/252 conversion.

Weekends/holidays and short publication gaps carry only earlier observed rates,
at most seven calendar days. No next-day backfill, interpolation, assumed zero
rate or constant-rate substitution is permitted. Longer gaps fail closed.

## Alignment and freshness

All series use the canonical live record's first/latest dates and base 100.
SPY's first price is the first date's adjusted daily close. Historical sessions
require their own adjusted prices. Nontrading dates carry the last session's
close, bounded at four calendar days.

For an active session, discard any unfinished daily bar and use only the latest
minute bar whose end is no later than `updated_at`. Its completed-bar age cannot
exceed two minutes. A partial-session benchmark is valid only for the exact
matching live snapshot timestamp. A later live refresh with an older benchmark
cache makes SPY unavailable until this publisher runs; it never reuses an old
price as current. Cash and SPY can fail independently of each other and of live
account performance. Benchmark data requests use `cache: no-store`.

Excess return is `strategy cumulative return - cash cumulative return`, displayed
in percentage points. It is not a ratio or risk-adjusted alpha.

## Reproduction without credentials or network

```sh
python3 scripts/refresh_live_benchmarks.py \
  --treasury-input /path/to/treasury_yields_2026.xml \
  --spy-input /path/to/alpaca_spy_source.json
node --test tests/live-benchmarks.test.js
python3 -m unittest discover -s tests -p 'test_refresh_live_benchmarks.py'
```

The offline SPY input contains `sessions` (date/close), adjusted daily `prices`
(date/close), and provider `minute_bars` (t/c). Public output contains no credentials,
account balances, order identifiers, or internal strategy rules. Writes are atomic.

Source documentation:
[Treasury feed](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed),
[Alpaca bars](https://docs.alpaca.markets/us/reference/stockbars).

## Independent historical comparison

The backtest uses `data/historical_comparison_20261003.json` for its validated
January 4, 2023–September 22, 2026 period, not the live window. Generate its
separate cash-only source with the same publisher and accrual function:

```sh
python3 scripts/refresh_live_benchmarks.py \
  --historical data/historical_comparison_20261003.json
```

This writes only `data/historical-cash-benchmark.json`. It does not fetch SPY or
recompute trading research. Both live and backtest comparisons normalize to
index 100, with no intermediate rebase. The original historical $10,000 portfolio
curves and SPY price evidence remain byte-identical. The existing historical
benchmark ratios are presented on the index-100 scale separately from the
unchanged dollar-value portfolio comparison.

Historical Treasury observations retained for reproduction cover December 21,
2022–September 22, 2026, including carry-in. All 1,357 calendar-day accrual
intervals are supported within the seven-day carry limit. Rate failures leave
strategy/SPY available and explicitly mark cash/excess unavailable.

For offline regeneration, repeat `--treasury-input /path/to/year.xml` for each
required source year. The public artifact includes source SHA-256 values.
Historical refresh is only needed when its validated period or source release
changes; it does not require another live cron job. `--if-needed` verifies the
stored artifact's schema, period, units and every accrual interval, then keeps
it byte-identical without a network call if it is still valid. Omit that flag
for an explicitly approved Treasury source-release refresh. Neither mode
regenerates historical strategy trades, P&L, Sharpe, drawdown or original curves.

## Release and rollback

Deploy the page, module, benchmark artifacts, publisher, tests and this document
through the existing GitHub Pages repository. Before replacing the production
refresh job, back up its preimage and the replaced website files, recording
hashes and permissions. Use only the benchmark diff and ordinary fast-forward
publication; never force-push dashboard data. Run one controlled refresh and
verify the served assets against the resulting publication revision.

For rollback, restore the job preimage and revert only the benchmark release
files. Preserve current canonical live data and all historical research inputs.
There are no trading-service, broker-write or strategy-configuration changes.
