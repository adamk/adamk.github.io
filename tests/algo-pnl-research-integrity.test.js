"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/selected_ex_research_20261013.json"),live=read("data/algo-pnl.json"),page=text("algo-pnl.html");

test("selected EX study renders its certified coverage and economics",()=>{
  const document=fixture();assert.equal(renderer.renderStudy(document,study).toFixed(2),"97.75");
  const expected={researchPeriod:/January 4, 2023.*September 21, 2026.*Selected EX one-contract research/,researchCoverage:"911 / 932 sessions",researchCoveragePct:"21 unassessable · signal counts unknown, not zero",researchUnresolved:"21 unassessable",researchRuleset:"Selected EX sleeve · SL20 / TP30",researchCostBasis:"Gross before fees",researchTrades:"281",researchGrossPnl:"+$908",researchWinRate:"45.55%",researchProfitFactor:"1.196",researchSharpe:"0.106",researchDrawdown:"-$496",researchEXTrades:"281",compareHistoricalTrades:"281",compareHistoricalWinRate:"45.55%",compareHistoricalProfitFactor:"1.196",compareHistoricalDrawdown:"-$496",researchTradeSummary:"128 wins · 153 losses · 2 time exits. Gross one-contract P&L is +$908."};
  for(const [id,value] of Object.entries(expected)) value instanceof RegExp ? assert.match(document.getElementById(id).textContent,value) : assert.equal(document.getElementById(id).textContent,value);
  for(const [year,trades,pnl] of [[2023,"68","+$430"],[2024,"75","+$488"],[2025,"77","-$304"],[2026,"61","+$294"]]) {
    assert.equal(document.getElementById(`researchYear${year}Trades`).textContent,trades);
    assert.equal(document.getElementById(`researchYear${year}Pnl`).textContent,pnl);
  }
});

test("live comparison uses canonical source without replacing selected historical values",()=>{
  const document=fixture();renderer.renderStudy(document,study);renderer.renderLive(document,live.canonical_metrics,true);
  const {trades,performance}=live.canonical_metrics;
  assert.equal(document.getElementById("compareLiveTrades").textContent,String(trades.closed_trade_count));
  assert.equal(document.getElementById("compareLiveWinRate").textContent,trades.win_rate_pct.toFixed(2)+"%");
  assert.equal(document.getElementById("compareLiveProfitFactor").textContent,trades.profit_factor.toFixed(2));
  assert.equal(document.getElementById("compareLiveDrawdown").textContent,performance.max_drawdown_pct.toFixed(2)+"%");
  renderer.renderLive(document,live.canonical_metrics,false);
  assert.equal(document.getElementById("compareLiveTrades").textContent,"—");
  assert.equal(document.getElementById("compareHistoricalTrades").textContent,"281");
});

test("optional methodology fields may be absent without affecting core metrics",()=>{
  const document=fixture();renderer.renderStudy(document,{...study,scope:undefined,execution_basis:undefined,sizing_basis:undefined,provenance:undefined});
  for(const id of ["researchScope","researchExecutionBasis","researchSizingBasis","researchProvenance"]) assert.equal(document.getElementById(id).hidden,true);
  assert.equal(document.getElementById("researchCoverage").textContent,"911 / 932 sessions");
});

test("invalid selected study metadata fails before rendering",()=>{
  for(const change of [{sessions_assessable:910},{analysis_set:"ALL"},{stop_pct:.25},{statistics:{...study.statistics,trades:280}},{yearly:[]}]) {
    const document=fixture();assert.throws(()=>renderer.renderStudy(document,{...study,...change}),/Selected EX research metadata invalid/);
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

test("the page loads the selected EX study and separate live source",async()=>{
  const document=fixture();let requested="";
  await renderer.loadStudy(document,async url=>{requested=url;return {ok:true,json:async()=>study};});
  assert.equal(requested,"/data/selected_ex_research_20261013.json");
  assert.match(page,/fetch\("\/data\/algo-pnl\.json"/);
  assert.match(page,/selected_ex_historical_comparison_20261013/);
  assert.match(page,/FoxchaseResearchIntegrity\.renderLive\(document, canonicalMetrics, liveAvailable\)/);
  assert.match(page,/Historical Research<\/th><th scope="col">Live/);
  assert.doesNotMatch(page,/out.of.sample|institutional grade|proven backtest/i);
});
