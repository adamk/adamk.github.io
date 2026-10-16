"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const api=require("../js/core-period-research.js");
const {read,text}=require("./research-fixture");

const payload=read("data/core_alpaca_fee_periods_20261016.json");
const periods=Object.fromEntries(payload.periods.map(row=>[row.id,row]));

test("published Alpaca-fee payload is hash-pinned and passes research-integrity validation",()=>{
  const bytes=text("data/core_alpaca_fee_periods_20261016.json");
  const expected=text("data/core_alpaca_fee_periods_20261016.sha256").trim().split(/\s+/)[0];
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),expected);
  assert.equal(api.validatePayload(payload),payload);
  assert.equal(payload.schema_version,2);
  assert.equal(payload.default_period,"2024_2026");
  assert.equal(payload.independent_verification,"PASS");
  assert.match(payload.fee_model.commission,/\$0/);
  assert.match(payload.fee_model.aggregation,/account-day/);
  assert.match(payload.fee_model.historical_classification,/retrospective approximation/);
  assert.match(payload.fee_model.prior_sensitivity,/\$0\.65/);
});

test("independent fresh-start period results reconcile to exact Alpaca-fee aggregates",()=>{
  const expected={
    "2024_2026":{candidate:683,eligible:679,A:[133,29198.86,2.9505,-1982.68],B:[133,23451.07,2.4389,-2074.68],C:[128,12539.79,1.8459,-2966.37]},
    "2025_2026":{candidate:431,eligible:427,A:[96,21765.57,3.1489,-1637.87],B:[96,17824.69,2.6185,-1713.86],C:[92,10069.28,1.9249,-2585.54]},
    "2023_2026":{candidate:932,eligible:926,A:[168,25686.88,2.5689,-1810.26],B:[168,19762.17,2.103,-1894.26],C:[159,7667.44,1.5202,-2294.93]}
  };
  for(const [id,want] of Object.entries(expected)) {
    const period=periods[id];
    assert.equal(period.candidate_sessions,want.candidate);assert.equal(period.eligible_sessions,want.eligible);
    assert.equal(period.starting_equity,10000);assert.equal(period.comparison_end,"2026-09-21");
    for(const scenario of ["A","B","C"]) {
      const row=period.scenarios.find(item=>item.id===scenario),[trades,net,pf,dd]=want[scenario];
      assert.equal(row.trades,trades,`${id}.${scenario}.trades`);
      assert.equal(row.net_pnl,net,`${id}.${scenario}.net`);
      assert.equal(row.net_profit_factor,pf,`${id}.${scenario}.profit-factor`);
      assert.equal(row.maximum_drawdown_dollars,dd,`${id}.${scenario}.drawdown`);
      assert.equal(row.ending_equity,Math.round((10000+net)*100)/100,`${id}.${scenario}.ending-equity`);
      assert.equal(period.equity_curves[`scenario_${scenario.toLowerCase()}`].at(-1),row.ending_equity);
      assert.ok(row.assumed_fees>0);
    }
  }
});

test("all setups and annual summaries reconcile without R5VWAPB",()=>{
  const labels=["R1 EM Bear","R1 SPX Narrow","R4 Failed PML Reclaim","R4 PML Break","R5 Late Lower EM","R5 EM Lower Rejection"];
  for(const period of payload.periods) {
    assert.deepEqual(period.setups.map(row=>row.label),labels);
    assert.equal(period.setups[5].scenarios.C.trades,0);
    for(const scenario of ["A","B","C"]) {
      const metrics=period.scenarios.find(row=>row.id===scenario);
      assert.equal(period.setups.reduce((sum,row)=>sum+row.scenarios[scenario].trades,0),metrics.trades);
      assert.ok(Math.abs(period.setups.reduce((sum,row)=>sum+row.scenarios[scenario].net_pnl,0)-metrics.net_pnl)<0.011);
      assert.ok(Math.abs(period.yearly_net_pnl.reduce((sum,row)=>sum+row[scenario],0)-metrics.net_pnl)<0.011);
    }
    assert.ok(period.limitations.some(line=>/R5VWAPB.*excluded only from this hypothetical.*enabled in production/i.test(line)));
    assert.ok(period.limitations.some(line=>/November 13, 2025.*invalid\/crossed quotes.*price-based exit check could not update/i.test(line)));
  }
});

test("period view defaults to Scenario B and switches benchmark label with selection",()=>{
  const primary=api.periodView(payload,"2024_2026"),a=api.periodView(payload,"2024_2026","B","A"),full=api.periodView(payload,"2023_2026","B","B");
  assert.equal(primary.benchmarkDatasets[0].label,"CORE Scenario B");
  assert.equal(primary.selectedBenchmark.return_pct,234.5107);
  assert.equal(primary.selectedBenchmark.excess_return_over_cash_pp,221.57869647);
  assert.equal(a.benchmarkDatasets[0].label,"CORE Scenario A");
  assert.equal(a.selectedBenchmark.return_pct,291.9886);
  assert.equal(full.selectedBenchmark.return_pct,197.6217);
  assert.equal(full.benchmarkDatasets.length,1);
  assert.deepEqual(periods["2023_2026"].gap_dates,["2023-06-05","2023-10-19","2025-04-04","2025-09-02","2026-08-26"]);
  for(const id of ["2024_2026","2025_2026","2023_2026"]) {
    const period=periods[id];
    for(const date of ["2025-04-04","2025-09-02"]) {
      assert.ok(period.gap_dates.includes(date),`${id}.${date} remains a visible non-evaluable gap`);
      const index=period.equity_curves.dates.indexOf(date);
      assert.ok(index>=0,`${id}.${date} is represented on the period timeline`);
      for(const scenario of ["a","b","c"]) assert.equal(period.equity_curves[`scenario_${scenario}`][index],null);
    }
  }
});
