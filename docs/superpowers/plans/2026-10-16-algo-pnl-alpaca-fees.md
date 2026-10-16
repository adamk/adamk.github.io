# Algo P&L Alpaca Fee Presentation — Implementation Plan

## Goal

Update `algo-pnl.html` to consume only the independently verified fee-aware CORE research payload. Highlight Scenario B by default while showing Scenarios A, B, and C together; remove the old Archived Research section and archive-only runtime code; preserve the separate EX research, period selector, live-performance pause, styling, and navigation.

## Scope and constraints

- Website and historical research presentation only; no trading-system, broker, production strategy, or account changes.
- Start from site `origin/main` in this isolated worktree.
- Use the fee-aware payload produced by the separate research PR. Do not copy results by hand from narrative summaries or include actual brokerage trades.
- Preserve all three independently replayed periods and their fresh `$10,000` starts.
- Preserve the disclosure that R5VWAPB is excluded only from the hypothetical CORE research portfolio and remains enabled in production.
- Remove the entire collapsed archive and its old combined CORE+EX headlines, charts, event handlers, and styling. Preserve any old data file still used by the live benchmarks workflow or separate EX research.

## Implementation sequence

1. Add integrity tests that fail if the archived combined section or its loading handler is reachable and that prove the separate EX module and live-performance pause remain.
2. Replace the current fee-payload path only after the research payload and SHA-256 sidecar are available; validate schema, period selection, independent-verification marker, scenario ordering, fee-model disclosures, and all headline metrics.
3. Change the featured/highlighted scenario to B. Keep all three scenario cards and all three daily closed-trade equity curves visible by default.
4. Add a benchmark-scenario selector defaulting to B. It updates the benchmark table, benchmark chart series, selected scenario return, chart legend, accessible label, and explanatory text while cash/SPY remain aligned to the selected period.
5. Keep the historical period selector; switching periods updates every displayed scenario metric, benchmark result, curve, setup/year table, interval, and limitation from that period's payload.
6. Remove the full archived CORE+EX/Multi-Day block, archive-only JavaScript and styling, and obsolete archive JSON files only when a repository-wide reference scan proves they are unused. Do not remove data used by the live benchmark workflow or EX research.
7. Add concise public disclosures for qualifying retail commission assumption, pass-through regulatory/clearing fees, historical approximation limits, modeled (not actual) slippage, NBBO fill limitations, Scenario B fixed-trade repricing, Scenario C execution/sizing replay, retrospective research selection, and non-established edge.

## Validation

- Validate the payload JSON and SHA-256 receipt; compare all displayed metrics and disclosures to the independently verified research artifact.
- Browser/runtime tests for default Scenario B, A/B/C cards and curves, benchmark selector, every period switch, chart datasets/labels, gaps, and no stale period values.
- Repository-wide reference scan before deleting any data file.
- Confirm no Archived Research markup, fetch, handler, or archive-only style remains; keep separate EX content and integrity tests.
- Run the complete website test suite and `git diff --check`.
- Render desktop and mobile views, inspect the primary page and period/scenario interactions, and save review screenshots in the PR.

## Review focus

- The fee-aware JSON is the only numerical source for the current CORE presentation.
- Scenario B is the default highlighted benchmark and all scenarios remain visible.
- Period and scenario switches update all linked cards, tables, charts, labels, and accessible text.
- Archived combined research is fully absent while EX research, live-performance pause, and production R5VWAPB status disclosure remain.
- No production or live-account data is blended into modeled CORE performance.
