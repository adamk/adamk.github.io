"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const api=require("../js/core-period-research.js");

function metric(trades=1,net=1) {
  return {trades,wins:trades,losses:0,win_rate_pct:trades?100:null,gross_pnl:net+1,net_pnl:net,
    net_profit_factor:trades?1:null,net_expectancy_per_trade:trades?net:null,maximum_drawdown_dollars:0,
    ending_equity:10000+net,cumulative_return_pct:net/100,eligible_sessions:3,
    assumed_slippage_cost:0,assumed_fees:0,average_quantity:trades?1:null,
    stop_loss_frequency_pct:trades?0:null,expectancy_ci_95:trades?[-1,3]:null};
}
function period(id,start,year) {
  const one=metric(),zero=metric(0,0),scenarios=["C","A","B"].map(s=>({id:s,label:s,...one}));
  const baseDate={"2024-01-02":"2023-12-29","2025-01-02":"2024-12-31","2023-01-04":"2023-01-03"}[start];
  const setups=Array.from({length:6},(_,index)=>({id:"setup"+index,label:"Setup "+index,
    scenarios:Object.fromEntries(["C","A","B"].map(s=>[s,index===0?one:zero]))}));
  return {id,label:id,requested_start:start,start,start, candidate_end:"2026-09-22",comparison_end:"2026-09-21",
    candidate_sessions:3,eligible_sessions:3,starting_equity:10000,excluded_sessions:[],gap_dates:[],scenarios,
    setups,yearly_net_pnl:[{year:2026,A:1,B:1,C:1}],
    benchmarks:{starting_equity:10000,base_date:baseDate,available:true,scenario_c_return_pct:0.01,risk_free_cash_return_pct:1.02,
      excess_return_over_cash_pp:-1.01,adjusted_spy_buy_hold_return_pct:2.1},
    equity_curves:{dates:[start,"2026-09-21"],scenario_a:[10000,10001],scenario_b:[10000,10001],
      scenario_c:[10000,10001],risk_free_cash:[10002,10102],adjusted_spy_buy_hold:[10010,10210],
      basis:"daily cumulative closed-trade P&L, not intraday mark-to-market"},
    quote_quality_by_year:{[year]:{quote_size_depth_or_volume_available:false}},
    limitations:["R5VWAPB is excluded only from this hypothetical portfolio and remains enabled in production."],
    source_sha256:Object.fromEntries(["scenario_results","year_by_year","natural_trade_ledger","matched_trade_ledger",
      "full_replay_trade_ledger","session_admission","independent_verification","adjusted_spy_source","historical_cash_source"]
      .map(key=>[key,"a".repeat(64)]))};
}
function payload() {
  return {schema_version:1,classification:"INDEPENDENT_FRESH_CORE_PERIOD_REPLAYS",independent_verification:"PASS",
    default_period:"2024_2026",common_comparison_end:"2026-09-21",candidate_end:"2026-09-22",
    periods:[period("2024_2026","2024-01-02","2024"),period("2025_2026","2025-01-02","2025"),
      period("2023_2026","2023-01-04","2023")]};
}

test("all three fresh periods validate and selector data changes together",()=>{
  const data=payload();
  assert.equal(api.validatePayload(data),data);
  const primary=api.periodView(data,"2024_2026","C"),recent=api.periodView(data,"2025_2026","C");
  assert.notEqual(primary.period.start,recent.period.start);
  assert.notDeepEqual(primary.labels,recent.labels);
  assert.equal(primary.scenarioMap.C.ending_equity,10001);
  assert.notEqual(primary.benchmarkReturns.base_date,recent.benchmarkReturns.base_date);
  assert.equal(primary.setups.reduce((sum,row)=>sum+row.trades,0),1);
  assert.equal(api.periodView(data,"2024_2026","A").setups[0].id,"setup0");
});

test("browser script publishes the validator on window for the production page loader",()=>{
  const window={};
  vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../js/core-period-research.js"),"utf8"),{window});
  assert.equal(typeof window.CorePeriodResearch?.validatePayload,"function");
  assert.equal(window.CorePeriodResearch.validatePayload(payload()).default_period,"2024_2026");
});

test("period validator rejects rebased equity, filled gaps, and stale ending values",()=>{
  for(const mutate of [
    data=>{data.periods[0].equity_curves.scenario_c[0]=9000;},
    data=>{data.periods[0].gap_dates=["2026-09-21"];},
    data=>{data.periods[0].scenarios[0].ending_equity=10002;},
    data=>{data.periods[0].benchmarks.excess_return_over_cash_pp=7;},
    data=>{data.periods[0].benchmarks.base_date=data.periods[0].start;},
    data=>{data.periods[0].setups[0].scenarios.C.net_pnl=2;}
  ]) {
    const data=payload();mutate(data);
    assert.throws(()=>api.validatePayload(data));
  }
});
