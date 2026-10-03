"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/intraday_research_with_ex_20261003.json"),live=read("data/algo-pnl.json"),page=text("algo-pnl.html");

test("historical display uses current metadata and separate coverage",()=>{
  const document=fixture();assert.equal(renderer.renderStudy(document,study).toFixed(2),"99.68");
  assert.equal(document.getElementById("researchCoverage").textContent,"Spreads 929 / 932");assert.equal(document.getElementById("researchCostBasis").textContent,"Gross before fees");assert.equal(document.getElementById("researchTrades").textContent,"526");
});

test("live comparison uses canonical source without replacing historical values",()=>{
  const document=fixture();renderer.renderStudy(document,study);renderer.renderLive(document,live.canonical_metrics,true);
  const {trades,performance}=live.canonical_metrics;
  assert.equal(document.getElementById("compareLiveTrades").textContent,String(trades.closed_trade_count));assert.equal(document.getElementById("compareLiveWinRate").textContent,trades.win_rate_pct.toFixed(2)+"%");assert.equal(document.getElementById("compareLiveProfitFactor").textContent,trades.profit_factor.toFixed(2));assert.equal(document.getElementById("compareLiveDrawdown").textContent,performance.max_drawdown_pct.toFixed(2)+"%");
  renderer.renderLive(document,live.canonical_metrics,false);assert.equal(document.getElementById("compareLiveTrades").textContent,"—");assert.equal(document.getElementById("compareHistoricalTrades").textContent,"526");
});

test("optional broad methodology text may be absent without showing empty lines",()=>{
  const document=fixture();renderer.renderStudy(document,{...study,scope:undefined,execution_basis:undefined,cost_note:undefined});
  for(const id of["researchScope","researchExecutionBasis","researchCostNote"])assert.equal(document.getElementById(id).hidden,true);
  assert.equal(document.getElementById("researchCoverage").textContent,"Spreads 929 / 932");
});

test("inconsistent coverage cannot render a partial study",()=>{
  const document=fixture();assert.throws(()=>renderer.renderStudy(document,{...study,spread_evaluable_sessions:930}),/Historical research metadata invalid/);assert.equal(document.getElementById("researchCoverage").textContent,"—");
});

test("missing research reports unavailability while leaving live values intact",async()=>{
  const document=fixture();renderer.renderLive(document,live.canonical_metrics,true);
  assert.equal(await renderer.loadStudy(document,async()=>({ok:false})),null);assert.match(document.getElementById("researchDataStatus").textContent,/temporarily unavailable/);
  assert.equal(document.getElementById("compareHistoricalTrades").textContent,"—");assert.equal(document.getElementById("compareLiveTrades").textContent,String(live.canonical_metrics.trades.closed_trade_count));
});

test("distinct live and historical source paths remain intact",()=>{
  for(const id of["researchCoverage","researchUnresolved","compareHistoricalTrades","compareLiveTrades","researchTradeSummary","researchLimitations"])assert.match(page,new RegExp(`id="${id}"`));
  assert.match(page,/fetch\("\/data\/algo-pnl\.json"/);assert.match(page,/fetch\("\/data\/historical_comparison_20261003\.json/);
  assert.match(page,/FoxchaseResearchIntegrity\.renderLive\(document, canonicalMetrics, liveAvailable\)/);assert.match(page,/Historical Research<\/th><th scope="col">Live/);
  assert.doesNotMatch(page,/out.of.sample|institutional grade|proven backtest/i);
});
