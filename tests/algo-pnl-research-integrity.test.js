"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/intraday_research_with_ex_20261013.json"),live=read("data/algo-pnl.json"),page=text("algo-pnl.html");

test("corrected Intraday study renders its certified coverage and economics",()=>{
  const document=fixture();assert.equal(renderer.renderStudy(document,study).toFixed(2),"99.68");
  const expected={researchPeriod:/January 4, 2023.*September 22, 2026.*Corrected commissioned EX integration/,researchCoverage:"Spreads 929 / 932",researchCoveragePct:"EX 911 / 932 sessions · through September 21, 2026",researchUnresolved:"Spreads 3 · EX 21",researchRuleset:"Intraday + corrected commissioned EX",researchCostBasis:"Gross before fees",researchTrades:"530",researchGrossPnl:"+$92,414",researchWinRate:"55.47%",researchProfitFactor:"1.438",researchSharpe:"1.730",researchDrawdown:"-$14,302 / -41.15%",researchEXTrades:"272",researchCoreTrades:"258",compareHistoricalTrades:"530",compareHistoricalWinRate:"55.47%",compareHistoricalProfitFactor:"1.438",compareHistoricalDrawdown:"-41.15%",researchTradeSummary:"294 wins · 235 losses · 1 flat."};
  for(const [id,value] of Object.entries(expected)) value instanceof RegExp ? assert.match(document.getElementById(id).textContent,value) : assert.equal(document.getElementById(id).textContent,value);
  for(const [year,trades,pnl] of [[2023,"131","+$4,313"],[2024,"133","+$24,646"],[2025,"151","+$2,298"],[2026,"115","+$61,157"]]) {
    assert.equal(document.getElementById(`researchYear${year}Trades`).textContent,trades);
    assert.equal(document.getElementById(`researchYear${year}Pnl`).textContent,pnl);
  }
});

test("live comparison uses canonical source without replacing corrected historical values",()=>{
  const document=fixture();renderer.renderStudy(document,study);renderer.renderLive(document,live.canonical_metrics,true);
  const {trades,performance}=live.canonical_metrics;
  assert.equal(document.getElementById("compareLiveTrades").textContent,String(trades.closed_trade_count));
  assert.equal(document.getElementById("compareLiveWinRate").textContent,trades.win_rate_pct.toFixed(2)+"%");
  assert.equal(document.getElementById("compareLiveProfitFactor").textContent,trades.profit_factor.toFixed(2));
  assert.equal(document.getElementById("compareLiveDrawdown").textContent,performance.max_drawdown_pct.toFixed(2)+"%");
  renderer.renderLive(document,live.canonical_metrics,false);
  assert.equal(document.getElementById("compareLiveTrades").textContent,"—");
  assert.equal(document.getElementById("compareHistoricalTrades").textContent,"530");
});

test("optional methodology fields may be absent without affecting core metrics",()=>{
  const document=fixture();renderer.renderStudy(document,{...study,scope:undefined,execution_basis:undefined,sizing_basis:undefined,provenance:undefined});
  for(const id of ["researchScope","researchExecutionBasis","researchSizingBasis","researchProvenance"]) assert.equal(document.getElementById(id).hidden,true);
  assert.equal(document.getElementById("researchCoverage").textContent,"Spreads 929 / 932");
});

test("invalid Intraday study metadata fails before rendering",()=>{
  for(const change of [{schema_version:2},{classification:"BAD"},{sessions_considered:931},{spread_evaluable_sessions:928},{statistics:{...study.statistics,trades:529}},{yearly:[]}]) {
    const document=fixture();assert.throws(()=>renderer.renderStudy(document,{...study,...change}),/Historical research metadata invalid/);
    assert.equal(document.getElementById("researchTrades").textContent,"—");
  }
});

test("missing research reports unavailability while leaving live values intact",async()=>{
  const document=fixture();renderer.renderLive(document,live.canonical_metrics,true);
  assert.equal(await renderer.loadStudy(document,async()=>({ok:false})),null);
  assert.match(document.getElementById("researchDataStatus").textContent,/temporarily unavailable/);
  assert.equal(document.getElementById("compareHistoricalTrades").textContent,"—");
  assert.equal(document.getElementById("compareLiveTrades").textContent,String(live.canonical_metrics.trades.closed_trade_count));
});

test("the page loads the corrected Intraday study and separate live source",async()=>{
  const document=fixture();let requested="";
  await renderer.loadStudy(document,async url=>{requested=url;return {ok:true,json:async()=>study};});
  assert.equal(requested,"/data/intraday_research_with_ex_20261013.json");
  assert.match(page,/fetch\("\/data\/algo-pnl\.json"/);
  assert.match(page,/historical_comparison_20261013/);
  assert.match(page,/FoxchaseResearchIntegrity\.renderLive\(document, canonicalMetrics, liveAvailable\)/);
  assert.match(page,/Historical Research<\/th><th scope="col">Live/);
  assert.doesNotMatch(page,/out.of.sample|institutional grade|proven backtest/i);
});
