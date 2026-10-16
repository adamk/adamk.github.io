"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const api=require("../js/core-period-research.js");
const {read,text}=require("./research-fixture");
const payload=read("data/core_alpaca_fee_periods_20261016.json");
const periods=Object.fromEntries(payload.periods.map(row=>[row.id,row]));
const NATURAL="natural_nbbo",SLIPPAGE="natural_nbbo_plus_slippage";

test("published fee-aware payload is hash-pinned and contains only the two public comparisons",()=>{
  const bytes=text("data/core_alpaca_fee_periods_20261016.json");
  const expected=text("data/core_alpaca_fee_periods_20261016.sha256").trim().split(/\s+/)[0];
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),expected);
  assert.equal(api.validatePayload(payload),payload);
  assert.equal(payload.schema_version,3);
  assert.equal(payload.default_period,"2024_2026");
  assert.equal(payload.independent_verification,"PASS");
  assert.match(payload.fee_model.commission,/\$0/);
  assert.match(payload.fee_model.aggregation,/account-day/);
  assert.match(payload.fee_model.historical_classification,/retrospective approximation/);
  assert.deepEqual(payload.execution_comparisons.map(row=>row.label),["Natural NBBO","Natural NBBO + $0.01 Slippage"]);
  assert.doesNotMatch(bytes,/Scenario [ABC]|scenario_[abc]|full[_ -]live[_ -]sequence/i);
});

test("fresh-start period results reconcile to exact fee-aware comparison aggregates",()=>{
  const expected={
    "2024_2026":{candidate:683,eligible:679,natural:[133,29198.86,2.9505,-1982.68],slippage:[133,23451.07,2.4389,-2074.68]},
    "2025_2026":{candidate:431,eligible:427,natural:[96,21765.57,3.1489,-1637.87],slippage:[96,17824.69,2.6185,-1713.86]},
    "2023_2026":{candidate:932,eligible:926,natural:[168,25686.88,2.5689,-1810.26],slippage:[168,19762.17,2.103,-1894.26]}
  };
  for(const [id,want] of Object.entries(expected)) {
    const period=periods[id];
    assert.equal(period.candidate_sessions,want.candidate);assert.equal(period.eligible_sessions,want.eligible);
    assert.equal(period.starting_equity,10000);assert.equal(period.comparison_end,"2026-09-21");
    for(const [key,comparison] of [["natural",NATURAL],["slippage",SLIPPAGE]]) {
      const row=period.comparisons.find(item=>item.id===comparison),[trades,net,pf,dd]=want[key];
      assert.equal(row.trades,trades,`${id}.${key}.trades`);
      assert.equal(row.net_pnl,net,`${id}.${key}.net`);
      assert.equal(row.net_profit_factor,pf,`${id}.${key}.profit-factor`);
      assert.equal(row.maximum_drawdown_dollars,dd,`${id}.${key}.drawdown`);
      assert.equal(row.ending_equity,Math.round((10000+net)*100)/100,`${id}.${key}.ending-equity`);
      assert.equal(period.equity_curves[comparison].at(-1),row.ending_equity);
      assert.ok(row.assumed_fees>0);
    }
  }
});

test("setup and annual results reconcile for both comparisons without R5VWAPB",()=>{
  const labels=["R1 EM Bear","R1 SPX Narrow","R4 Failed PML Reclaim","R4 PML Break","R5 Late Lower EM","R5 EM Lower Rejection"];
  for(const period of payload.periods) {
    assert.deepEqual(period.setups.map(row=>row.label),labels);
    assert.equal(period.setups[5].comparisons[SLIPPAGE].trades,0);
    for(const id of [NATURAL,SLIPPAGE]) {
      const metrics=period.comparisons.find(row=>row.id===id);
      assert.equal(period.setups.reduce((sum,row)=>sum+row.comparisons[id].trades,0),metrics.trades);
      assert.ok(Math.abs(period.setups.reduce((sum,row)=>sum+row.comparisons[id].net_pnl,0)-metrics.net_pnl)<0.011);
      assert.ok(Math.abs(period.yearly_net_pnl.reduce((sum,row)=>sum+row[id],0)-metrics.net_pnl)<0.011);
    }
    assert.ok(period.limitations.some(line=>/R5VWAPB.*excluded only from this hypothetical.*enabled in production/i.test(line)));
    assert.ok(period.limitations.some(line=>/same historical trades and contract quantities.*does not simulate how lower equity/i.test(line)));
  }
});

test("comparison selector defaults to slippage and preserves gaps and unavailable full-period benchmarks",()=>{
  const primary=api.periodView(payload,"2024_2026"),natural=api.periodView(payload,"2024_2026",NATURAL,NATURAL),full=api.periodView(payload,"2023_2026");
  assert.equal(primary.benchmarkDatasets[0].label,"CORE — Natural NBBO + $0.01 Slippage");
  assert.equal(primary.selectedBenchmark.return_pct,234.5107);
  assert.equal(primary.selectedBenchmark.excess_return_over_cash_pp,221.57869647);
  assert.equal(natural.benchmarkDatasets[0].label,"CORE — Natural NBBO");
  assert.equal(natural.selectedBenchmark.return_pct,291.9886);
  assert.equal(full.selectedBenchmark.return_pct,197.6217);
  assert.equal(full.benchmarkDatasets.length,1);
  assert.deepEqual(periods["2023_2026"].gap_dates,["2023-06-05","2023-10-19","2025-04-04","2025-09-02","2026-08-26"]);
  for(const period of payload.periods) {
    for(const date of ["2025-04-04","2025-09-02"]) {
      assert.ok(period.gap_dates.includes(date));
      const index=period.equity_curves.dates.indexOf(date);assert.ok(index>=0);
      assert.equal(period.equity_curves[NATURAL][index],null);
      assert.equal(period.equity_curves[SLIPPAGE][index],null);
    }
  }
});
