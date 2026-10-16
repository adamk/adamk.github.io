"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {read} = require("./research-fixture");
const api = require("../js/core-period-research.js");
const payload = read("data/core_alpaca_fee_periods_20261016.json");
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test("each CORE period aligns both execution comparisons with its cash and adjusted-SPY source",()=>{
  for(const period of payload.periods) {
    assert.equal(period.starting_equity,10000);
    assert.equal(period.equity_curves.dates[0],period.start);
    assert.equal(period.equity_curves.dates.at(-1),"2026-09-21");
    const natural=period.comparisons.find(row=>row.id==="natural_nbbo");
    const slippage=period.comparisons.find(row=>row.id==="natural_nbbo_plus_slippage");
    close(period.benchmarks.comparison_returns_pct.natural_nbbo,natural.cumulative_return_pct);
    close(period.benchmarks.comparison_returns_pct.natural_nbbo_plus_slippage,slippage.cumulative_return_pct);
    if(period.benchmarks.available) {
      for(const id of ["natural_nbbo","natural_nbbo_plus_slippage"]) close(period.benchmarks.excess_return_over_cash_pp_by_comparison[id],
        period.benchmarks.comparison_returns_pct[id]-period.benchmarks.risk_free_cash_return_pct);
      close(period.benchmarks.adjusted_spy_buy_hold_return_pct,
        100*(period.equity_curves.adjusted_spy_buy_hold.at(-1)/10000-1));
      close(period.benchmarks.risk_free_cash_return_pct,
        100*(period.equity_curves.risk_free_cash.at(-1)/10000-1));
    } else {
      assert.equal(period.benchmarks.risk_free_cash_return_pct,null);
      assert.equal(period.benchmarks.adjusted_spy_buy_hold_return_pct,null);
      assert.ok(period.equity_curves.risk_free_cash.every(value=>value===null));
      assert.ok(period.equity_curves.adjusted_spy_buy_hold.every(value=>value===null));
    }
  }
});

test("benchmark selection identifies the selected CORE comparison and never substitutes unavailable cash",()=>{
  const natural=api.periodView(payload,"2024_2026","natural_nbbo","natural_nbbo");
  const slipped=api.periodView(payload,"2024_2026","natural_nbbo_plus_slippage","natural_nbbo_plus_slippage");
  assert.equal(natural.selectedBenchmark.return_pct,291.9886);
  assert.equal(slipped.selectedBenchmark.return_pct,234.5107);
  assert.equal(slipped.selectedBenchmark.excess_return_over_cash_pp,221.57869647);
  const full=api.periodView(payload,"2023_2026","natural_nbbo_plus_slippage","natural_nbbo_plus_slippage");
  assert.equal(full.selectedBenchmark.cash_return_pct,null);
  assert.equal(full.selectedBenchmark.excess_return_over_cash_pp,null);
  assert.equal(full.benchmarkDatasets.length,1);
});

test("non-evaluable strategy sessions stay explicit gaps while benchmark paths remain intact",()=>{
  const period=payload.periods.find(row=>row.id==="2024_2026");
  for(const date of period.gap_dates) {
    const index=period.equity_curves.dates.indexOf(date);assert.ok(index>=0);
    for(const key of ["natural_nbbo","natural_nbbo_plus_slippage"]) assert.equal(period.equity_curves[key][index],null);
    assert.ok(Number.isFinite(period.equity_curves.risk_free_cash[index]));
    assert.ok(Number.isFinite(period.equity_curves.adjusted_spy_buy_hold[index]));
  }
});
