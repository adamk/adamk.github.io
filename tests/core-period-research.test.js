"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const api=require("../js/core-period-research.js");
const NATURAL="natural_nbbo", SLIPPAGE="natural_nbbo_plus_slippage";

function metric(trades=1,net=1) {
  return {trades,wins:trades,losses:0,win_rate_pct:trades?100:null,gross_pnl:net+1,net_pnl:net,
    net_profit_factor:trades?1:null,net_expectancy_per_trade:trades?net:null,maximum_drawdown_dollars:0,
    ending_equity:10000+net,cumulative_return_pct:net/100,eligible_sessions:3,
    assumed_slippage_cost:0,assumed_fees:0,average_quantity:trades?1:null,
    stop_loss_frequency_pct:trades?0:null,expectancy_ci_95:trades?[-1,3]:null};
}
function period(id,start,year) {
  const one=metric(),slip=metric(),zero=metric(0,0);
  slip.assumed_slippage_cost=1;
  const comparisons=[
    {id:NATURAL,label:"Natural NBBO",...one},
    {id:SLIPPAGE,label:"Natural NBBO + $0.01 Slippage",...slip}
  ];
  const baseDate={"2024-01-02":"2023-12-29","2025-01-02":"2024-12-31","2023-01-04":"2023-01-03"}[start];
  const setups=Array.from({length:6},(_,index)=>({id:"setup"+index,label:"Setup "+index,
    comparisons:{[NATURAL]:index===0?one:zero,[SLIPPAGE]:index===0?slip:zero}}));
  return {id,label:id,requested_start:start,start,candidate_end:"2026-09-22",comparison_end:"2026-09-21",
    candidate_sessions:3,eligible_sessions:3,starting_equity:10000,excluded_sessions:[],gap_dates:[],comparisons,
    setups,yearly_net_pnl:[{year:2026,[NATURAL]:1,[SLIPPAGE]:1}],
    benchmarks:{starting_equity:10000,base_date:baseDate,available:true,
      comparison_returns_pct:{[NATURAL]:0.01,[SLIPPAGE]:0.01},risk_free_cash_return_pct:1.02,
      excess_return_over_cash_pp_by_comparison:{[NATURAL]:-1.01,[SLIPPAGE]:-1.01},adjusted_spy_buy_hold_return_pct:2.1},
    equity_curves:{dates:[start,"2026-09-21"],[NATURAL]:[10000,10001],[SLIPPAGE]:[10000,10001],
      risk_free_cash:[10002,10102],adjusted_spy_buy_hold:[10010,10210],
      basis:"daily cumulative closed-trade P&L, not intraday mark-to-market"},
    quote_quality_by_year:{[year]:{quote_size_depth_or_volume_available:false}},
    limitations:["R5VWAPB is excluded only from this hypothetical portfolio and remains enabled in production.",
      "The slippage comparison uses the same historical trades and contract quantities as Natural NBBO; it does not simulate how lower equity could change later position sizing or order eligibility."],
    source_sha256:Object.fromEntries(["scenario_results","year_by_year","natural_trade_ledger","matched_trade_ledger",
      "session_admission","independent_verification","adjusted_spy_source","historical_cash_source"]
      .map(key=>[key,"a".repeat(64)]))};
}
function payload() {
  return {schema_version:3,classification:"INDEPENDENT_FRESH_CORE_PERIOD_REPLAYS_WITH_RETROSPECTIVE_ALPACA_FEE_APPROXIMATION",independent_verification:"PASS",
    execution_comparisons:[{id:NATURAL,label:"Natural NBBO"},{id:SLIPPAGE,label:"Natural NBBO + $0.01 Slippage"}],
    comparison_methodology:"The $0.01 comparison uses the same historical trades and contract quantities as Natural NBBO. It does not model how lower equity could change later position sizing or order eligibility, and is not a full live broker execution simulation.",
    fee_model:{commission:"$0 assuming standard retail ETF options",aggregation:"per account-day fee type rounded up to cents",
      historical_classification:"dated SEC/FINRA and nearest Alpaca snapshots are labeled retrospective approximations"},
    default_period:"2024_2026",common_comparison_end:"2026-09-21",candidate_end:"2026-09-22",
    periods:[period("2024_2026","2024-01-02","2024"),period("2025_2026","2025-01-02","2025"),
      period("2023_2026","2023-01-04","2023")]};
}

test("all fresh periods validate and update both public comparisons together",()=>{
  const data=payload();
  assert.equal(api.validatePayload(data),data);
  const primary=api.periodView(data,"2024_2026"),recent=api.periodView(data,"2025_2026");
  assert.notEqual(primary.period.start,recent.period.start);
  assert.notDeepEqual(primary.labels,recent.labels);
  assert.equal(primary.comparisonMap[SLIPPAGE].ending_equity,10001);
  assert.notEqual(primary.benchmarkReturns.base_date,recent.benchmarkReturns.base_date);
  assert.equal(primary.setups.reduce((sum,row)=>sum+row.trades,0),1);
  assert.equal(primary.benchmarkDatasets[0].label,"CORE — Natural NBBO + $0.01 Slippage");
  assert.deepEqual(primary.portfolioDatasets.slice(0,2).map(row=>row.label),
    ["CORE — Natural NBBO","CORE — Natural NBBO + $0.01 Slippage"]);
  assert.equal(api.periodView(data,"2024_2026",NATURAL).setups[0].id,"setup0");
});

test("fee-aware payload requires commission and retrospective fee approximation disclosures",()=>{
  const data=payload();
  for(const mutate of [
    p=>{p.fee_model.commission="unverified";},
    p=>{p.fee_model.aggregation="per trade";},
    p=>{delete p.fee_model.historical_classification;}
  ]) {
    const copy=structuredClone(data);mutate(copy);assert.throws(()=>api.validatePayload(copy));
  }
});

test("browser script publishes the validator for the production page loader",()=>{
  const window={};
  vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../js/core-period-research.js"),"utf8"),{window});
  assert.equal(typeof window.CorePeriodResearch?.validatePayload,"function");
  assert.equal(window.CorePeriodResearch.validatePayload(payload()).default_period,"2024_2026");
});

test("period validator rejects rebased equity, filled gaps, stale endpoints and public third comparisons",()=>{
  for(const mutate of [
    data=>{data.periods[0].equity_curves[NATURAL][0]=9000;},
    data=>{data.periods[0].gap_dates=["2026-09-21"];},
    data=>{data.periods[0].comparisons[0].ending_equity=10002;},
    data=>{data.periods[0].benchmarks.excess_return_over_cash_pp_by_comparison[NATURAL]=7;},
    data=>{data.periods[0].benchmarks.base_date=data.periods[0].start;},
    data=>{data.periods[0].setups[0].comparisons[NATURAL].net_pnl=2;},
    data=>{data.periods[0].comparisons.push({id:"natural_nbbo_candidate"});}
  ]) {
    const data=payload();mutate(data);
    assert.throws(()=>api.validatePayload(data));
  }
});
