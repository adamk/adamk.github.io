# Algo P&L Alpaca Fee Presentation — Implementation Plan

## Goal

Present the independently verified fee-aware CORE research on `algo-pnl.html` as two public execution comparisons: Natural NBBO and Natural NBBO + $0.01 Slippage. The slippage-adjusted comparison is highlighted by default. Keep the existing three fresh-start periods, separate EX research, live-performance pause, styling, and navigation.

## Scope and constraints

- Website and historical research presentation only; no trading-system, broker, production strategy, or account changes.
- Continue in the site repository's isolated PR #5 worktree, based on latest `origin/main`.
- Use the independently verified fee-aware payload as the sole numerical source. Do not include actual brokerage trades.
- Each selected period retains its independently replayed `$10,000` start and September 21, 2026 validated endpoint.
- Public slippage results use the same historical trades and contract quantities as Natural NBBO. Disclose that execution repricing does not simulate later sizing or order-eligibility changes.
- Preserve the hypothetical R5VWAPB exclusion disclosure and state that the setup remains enabled in production.
- Remove public archived combined CORE+EX/Multi-Day presentation and its runtime. Retain the source datasets and their regression coverage; do not load them in the public page.
- Keep the independent live-sequence research in the research artifacts; do not publish it as a third headline comparison.

## Implementation sequence

1. Retain integrity tests for the two public comparisons, period switching, source hash, benchmark alignment, visible date gaps, separate EX research, and the live-performance pause.
2. Publish a reduced, hash-pinned JSON projection with only Natural NBBO and Natural NBBO + $0.01 Slippage. Preserve the verified fee model and per-period figures without recalculation.
3. Render both comparison cards, both closed-trade equity curves, the selected benchmark comparison, setup results, annual results, quote-quality data, and period-specific limitations from the payload.
4. Remove old archived public markup, fetch handlers, and archive-only styles. Keep archived source data and accounting tests in the repository but unreachable from the page runtime.
5. Disclose $0 qualifying retail commissions plus estimated pass-through fees, retrospective fee approximations, non-guaranteed NBBO fills, fixed-trade slippage, modeled research limits, and statistical uncertainty.

## Validation

- Validate the reduced payload and SHA-256 receipt against the independently verified fee-aware aggregates.
- Test the default period, both comparison choices, all period changes, date gaps, benchmark selection, chart labels, and zero stale metrics.
- Verify that no third comparison or archived CORE+EX presentation/data loader is present in the public page.
- Preserve archived research datasets and useful cash/SPY benchmark tests.
- Run the full website test suite and `git diff --check`.
- Render desktop and mobile views and save review screenshots in the PR.

## Review focus

- The reduced fee-aware payload is the only numerical source for public CORE comparisons.
- Both comparisons use fee-aware independent replays, and the fixed-trade limitation is explicit.
- Period changes update cards, benchmark returns, curves, setup/year tables, and disclosures together.
- Archived research is absent from the public page but its source evidence remains in the repository.
- No production or live-account result is represented as modeled CORE performance.
