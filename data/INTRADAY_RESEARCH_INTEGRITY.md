# Intraday research integrity data

`intraday_research_integrity_20260922.json` supplies the historical statistics, coverage, and methodology text displayed on `/algo-pnl.html`. It does not drive the live account index or the historical portfolio comparison chart.

The numerical result, date range, excluded dates, and six included setup families come from the frozen full-range replay result and report under `research/backtest_closeout_20260922/full_range_research_20260922/` in the Trading research workspace. `source_result_sha256` and `source_ledger_sha256` identify that result and its trade ledger. `daily_sharpe_annualized` comes from the published full-range research summary. These values must be reconciled to the source before replacing this dated file.

`sessions_considered` includes all trading sessions in the study calendar. `fully_evaluable_sessions` excludes the dates in `unresolved_sessions`; the percentage displayed on the page is calculated from the two counts. Unresolved dates are not no-trade outcomes. `setup_families` counts included credit-spread setup families, not all strategy variants ever tested.

`scope` states the relationship of the standalone historical study to the broader live configuration. `execution_basis` describes the modeled option quotes. `cost_basis` and `cost_note` describe costs omitted from gross results; they do not specify an estimated net return. No rules-freeze date, strategy version number, formal holdout, variant-search count, or separate slippage rate is asserted by this file.
