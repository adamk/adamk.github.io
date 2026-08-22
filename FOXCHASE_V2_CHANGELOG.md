# Foxchase Trading v2

**Status:** Frozen for forward validation  
**Freeze date:** August 22, 2026  
**Strategy version:** `foxchase-v2`

## Validated baseline

- Historical portfolio membership: 398 trades
- Hypothetical P&L: +$105,344
- CAGR: 105.38%
- Sharpe ratio: 5.502
- Maximum drawdown: -8.68%
- Portfolio sizing assumption: existing 15% sequential risk framework with predefined setup-specific multipliers

These are historical research results, not live performance or a forecast. Forward validation must preserve this version's entries, setup priority, sizing, stops, thresholds, and portfolio construction.

## Change from the previous forward ruleset

Only the exit management of `Not recorded` changed:

1. Before the existing 60% profit target is reached, the existing target/stop/EOD management remains authoritative.
2. Reaching 60% profit activates runner mode instead of immediately closing the spread.
3. Runner mode exits on the first confirmed completed five-minute SPY candle that closes below cumulative regular-session VWAP.
4. If no qualifying VWAP failure occurs, the existing end-of-day handling remains authoritative.
5. If valid completed five-minute candle or VWAP data is unavailable, the runner is abandoned for that management pass and the existing R5 target/stop/EOD logic resumes. The fallback is logged.

This is management for an existing setup. It does not create another signal or trade.

## Why the R5 runner was added

The frozen runner study showed that immediately closing every R5 late lower-EM trade at 60% discarded useful post-target persistence. A confirmed five-minute close below session VWAP provided a pre-registered way to manage only the post-target remainder while keeping entries, stops before activation, sizing, and every other setup unchanged.

## Production behavior

- Both Pi nodes must run identical strategy-engine code and equivalent launch flags. Node role, filesystem paths, credentials, and lease ownership are intentionally node-specific.
- Position management is anchored to the broker's actual filled entry price when available.
- The primary and standby remain fenced by the existing failover lease.
- The standby does not become authorized to submit merely because its process is running.

## Execution telemetry contract

The durable JSONL execution log records, where applicable:

- setup and regime
- trigger and candidate timestamps
- expected, initially submitted, finally submitted, and actually filled entry prices
- entry slippage and its sign convention
- short strike, long strike, spread width, and filled credit/width
- candidate rejection or skip reason and minimum-credit requirement
- exit trigger reason and observed quote
- submitted and filled exit prices
- execution and total exit slippage with sign conventions
- R5 runner activation, confirmed VWAP exit, and data-fallback events

Telemetry is best-effort and must never change signal selection or order decisions.

## Backtest and live parity assumptions

- The runner uses cumulative RTH VWAP derived from volume-weighted one-minute bar VWAP observations.
- A candle must be complete before it can trigger the runner exit.
- The historical target timestamp is based on the available minute option path. Live activation occurs when the position-management poll first observes the target, so sub-minute timing can differ.
- Historical option marks cannot perfectly reproduce live order-book depth, queue position, partial fills, or broker latency.
- Most historical setups use natural bid/ask execution. The documented R1 SPX/SPY expected-move sleeve uses synchronized Alpaca one-minute trade-bar estimates because complete historical bid/ask quotes were unavailable.
- Live spreads may gap through intended stops, fail to fill at a displayed quote, or realize a debit beyond the historical mark.

## Known limitations

- The 398 trades are a finite historical sample and are not independent observations.
- Regime and setup performance may decay after the freeze date.
- CAGR and Sharpe are sensitive to the sequential compounding and sizing assumptions.
- The VWAP runner requires timely, complete SPY minute bars. Its documented fallback protects management when that data is unavailable but may produce a different outcome than the historical runner path.
- A safe failover depends on EC2 lease availability, synchronized code/configuration, broker-state reconciliation, and network connectivity.

## Change-control rule

No new strategy, entry filter, threshold optimization, sizing change, or stop change belongs in v2. Any future modification must receive a new version identifier, a separate changelog, and a before/after validation that preserves this frozen baseline.
