"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const api=require("../js/core-period-research.js");
const {read,text}=require("./research-fixture");

const payload=read("data/core_slippage_periods_20261015.json");
const periods=Object.fromEntries(payload.periods.map(row=>[row.id,row]));

test("published multi-period payload is hash-pinned and passes research-integrity validation",()=>{
  const bytes=text("data/core_slippage_periods_20261015.json");
  const expected=text("data/core_slippage_periods_20261015.sha256").trim().split(/\s+/)[0];
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),expected);
  assert.equal(api.validatePayload(payload),payload);
  assert.deepEqual(payload.periods.map(row=>row.id),["2024_2026","2025_2026","2023_2026"]);
  assert.equal(payload.default_period,"2024_2026");
  assert.equal(payload.independent_verification,"PASS");
});

test("each period is a fresh replay with its own verified Scenario C results and common endpoint",()=>{
  const expected={
    "2024_2026":{start:"2024-01-02",candidate:683,eligible:681,trades:128,net:8495.4,pf:1.6121,dd:-2547.6,end:18495.4,ret:84.954,ci:[3.22,127.85]},
    "2025_2026":{start:"2025-01-02",candidate:431,eligible:429,trades:92,net:7180.6,pf:1.6826,dd:-2352.4,end:17180.6,ret:71.806,ci:[-2.27,152.14]},
    "2023_2026":{start:"2023-01-04",candidate:932,eligible:928,trades:159,net:4568.4,pf:1.3301,dd:-2356.4,end:14568.4,ret:45.684,ci:[-11.87,68.12]}
  };
  for(const [id,want] of Object.entries(expected)){
    const period=periods[id],row=period.scenarios.find(value=>value.id==="C");
    assert.equal(period.start,want.start);assert.equal(period.candidate_sessions,want.candidate);
    assert.equal(period.eligible_sessions,want.eligible);assert.equal(period.comparison_end,"2026-09-21");
    assert.equal(period.starting_equity,10000);assert.equal(period.pre_period_pnl_included,false);
    for(const [key,value] of Object.entries({trades:want.trades,net_pnl:want.net,net_profit_factor:want.pf,
      maximum_drawdown_dollars:want.dd,ending_equity:want.end,cumulative_return_pct:want.ret}))assert.equal(row[key],value,`${id}.${key}`);
    assert.deepEqual(row.expectancy_ci_95,want.ci);
    assert.equal(period.equity_curves.scenario_c.at(-1),want.end);
    if(period.benchmarks.available){
      assert.ok(period.benchmarks.base_date<period.start);
      assert.ok(period.equity_curves.risk_free_cash[0]>10000);
      assert.ok(Number.isFinite(period.equity_curves.adjusted_spy_buy_hold[0]));
    }else{
      assert.equal(period.benchmarks.base_date,null);
      assert.ok(period.equity_curves.risk_free_cash.every(value=>value===null));
      assert.ok(period.equity_curves.adjusted_spy_buy_hold.every(value=>value===null));
    }
  }
});

test("period data preserves the first-session realized close and all non-evaluable gaps",()=>{
  assert.equal(periods["2025_2026"].equity_curves.scenario_c[0],10164.4,
    "Jan 2 first plotted close contains its own session P&L, not a fabricated $10,000 close");
  assert.deepEqual(periods["2023_2026"].gap_dates,["2023-06-05","2023-10-19","2026-08-26"]);
  for(const period of payload.periods){
    for(const date of period.gap_dates){
      const index=period.equity_curves.dates.indexOf(date);assert.ok(index>=0);
      for(const scenario of ["scenario_a","scenario_b","scenario_c"])assert.equal(period.equity_curves[scenario][index],null);
    }
  }
});

test("all five signal-producing setups plus inactive R5 rejection reconcile per period",()=>{
  const labels=["R1 EM Bear","R1 SPX Narrow","R4 Failed PML Reclaim","R4 PML Break","R5 Late Lower EM","R5 EM Lower Rejection"];
  for(const period of payload.periods){
    assert.deepEqual(period.setups.map(row=>row.label),labels);
    assert.equal(period.setups[5].scenarios.C.trades,0);
    for(const id of ["A","B","C"]){
      const scenario=period.scenarios.find(row=>row.id===id);
      assert.equal(period.setups.reduce((sum,row)=>sum+row.scenarios[id].trades,0),scenario.trades);
      assert.ok(Math.abs(period.setups.reduce((sum,row)=>sum+row.scenarios[id].net_pnl,0)-scenario.net_pnl)<0.011);
    }
    assert.ok(period.limitations.some(line=>/R5VWAPB.*excluded only from this hypothetical.*enabled in production/i.test(line)));
  }
});

test("period view changes benchmark, portfolio, setup, annual, gaps, and quote data",()=>{
  const primary=api.periodView(payload,"2024_2026","C"),recent=api.periodView(payload,"2025_2026","A"),full=api.periodView(payload,"2023_2026","B");
  assert.notDeepEqual(primary.labels,recent.labels);assert.notDeepEqual(recent.labels,full.labels);
  assert.equal(primary.scenarioMap.C.ending_equity,18495.4);
  assert.equal(recent.scenarioMap.C.ending_equity,17180.6);
  assert.equal(full.benchmarkReturns.scenario_c_return_pct,45.684);
  assert.equal(primary.setups.length,6);assert.equal(recent.yearly.length,2);assert.equal(full.yearly.length,4);
  assert.ok(primary.quoteQuality["2024"]);assert.ok(recent.quoteQuality["2025"]);assert.ok(full.quoteQuality["2023"]);
  assert.equal(primary.portfolioDatasets[0].data.at(-1),18495.4);
  assert.equal(full.portfolioDatasets[0].data.at(-1),14568.4);
});

test("period payload source hashes are present and quote depth is not implied",()=>{
  for(const period of payload.periods){
    assert.ok(Object.values(period.source_sha256).every(value=>/^[a-f0-9]{64}$/.test(value)));
    assert.ok(Object.values(period.quote_quality_by_year).every(row=>row.quote_size_depth_or_volume_available===false));
  }
  assert.match(payload.benchmark_methodology,/Treasury BC_3MONTH/);
  assert.ok(payload.periods.every(period=>period.limitations.some(line=>/R5VWAPB.*excluded only from this hypothetical.*enabled in production/i.test(line))));
  assert.match(text("algo-pnl.html"),/does not establish verified live performance/i);
});
