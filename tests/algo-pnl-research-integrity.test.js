"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/intraday_research_with_ex_20261013.json"),page=text("algo-pnl.html");

test("corrected Intraday study renders its certified coverage and economics",()=>{
  const document=fixture();assert.equal(renderer.renderStudy(document,study).toFixed(2),"99.68");
  const expected={researchPeriod:/January 4, 2023.*September 22, 2026.*Corrected commissioned EX integration/,researchCoverage:"Spreads 929 / 932",researchCoveragePct:"EX 911 / 932 sessions · through September 21, 2026",researchUnresolved:"Spreads 3 · EX 21",researchRuleset:"Intraday + corrected commissioned EX",researchCostBasis:"Gross before fees",researchTrades:"530",researchGrossPnl:"+$92,414",researchWinRate:"55.47%",researchProfitFactor:"1.438",researchSharpe:"1.730",researchDrawdown:"-$14,302 / -41.15%",researchEXTrades:"272",researchCoreTrades:"258",researchTradeSummary:"294 wins · 235 losses · 1 flat."};
  for(const [id,value] of Object.entries(expected)) value instanceof RegExp ? assert.match(document.getElementById(id).textContent,value) : assert.equal(document.getElementById(id).textContent,value);
  for(const [year,trades,pnl] of [[2023,"131","+$4,313"],[2024,"133","+$24,646"],[2025,"151","+$2,298"],[2026,"115","+$61,157"]]) {
    assert.equal(document.getElementById(`researchYear${year}Trades`).textContent,trades);
    assert.equal(document.getElementById(`researchYear${year}Pnl`).textContent,pnl);
  }
});

test("public reporting routes pause live statistics and keep historical research separate",()=>{
  const index=text("index.html");
  const legacy=text("algo-pnl.backup_20260717_213556.html");
  assert.match(page,/Live Performance Reporting Paused/);
  assert.match(page,/Live algorithm performance reporting is temporarily unavailable while execution reliability and trade reconciliation are being reviewed\. Historical research results remain available separately\./);
  assert.match(page,/Historical results below are simulated research, separate from live trading\. They do not establish verified live performance\./);
  assert.match(page,/Historical Strategy Research/);
  assert.match(page,/id="backtestBenchmarkChart"/);
  assert.match(page,/id="historicalComparisonChart"/);
  assert.doesNotMatch(page,/Live Account Performance|Live Account Performance Index|Live vs Historical Behavior|forward evidence/);
  assert.doesNotMatch(page,/id="(?:currentIndex|sinceInceptionReturn|headlineProfitFactor|headlineWinRate|headlineClosedTrades|equityChart|compareLiveTrades|compareLiveWinRate|compareLiveProfitFactor)"/);
  assert.doesNotMatch(page,/fetch\("\/data\/(?:algo-pnl|live-benchmarks)\.json"/);
  assert.doesNotMatch(page,/FoxchaseResearchIntegrity\.renderLive/);
  assert.match(index,/historical algorithm research/i);
  assert.match(index,/Historical research remains available\. Live performance reporting is paused/);
  assert.doesNotMatch(index,/Real-time performance tracking|Live Algo Performance/);
  assert.match(legacy,/http-equiv="refresh" content="0; url=\/algo-pnl\.html"/);
  assert.match(legacy,/Live Performance Reporting Paused/);
  assert.doesNotMatch(legacy,/Live Account Performance|fetch\("\/data\/(?:algo-pnl|live-benchmarks)\.json"/);
});

test("current CORE benchmark is primary while the former combined results stay archived",()=>{
  const archive=page.indexOf('<details class="archived-research" id="archivedCombinedResearch">');
  assert.ok(archive>0);
  assert.doesNotMatch(page.slice(0,archive),/\+924\.14%|Backtest Strategy Return|Foxchase Combined/);
  assert.match(page.slice(archive),/\+924\.14%/);
  assert.match(page.slice(archive),/corrected commissioned EX sleeve only/);
  assert.match(page,/id="coreScenarioC"/);
  assert.match(page,/id="coreBenchmarkChart"/);
  assert.match(page,/id="corePortfolioChart"/);
  assert.match(page,/September 22 was not evaluable and is excluded/);
  assert.match(page,/September 21, 2026/);
  assert.match(page,/three earlier non-evaluable strategy dates remain visible as gaps/);
  assert.match(page,/R5 VWAP bearish-persistence setup is excluded from this hypothetical portfolio/);
  assert.match(page,/this research assumption does not mean this exclusion has been deployed/);
  assert.match(page,/Live Performance Reporting Paused/);
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

test("missing historical research reports unavailability",async()=>{
  const document=fixture();
  assert.equal(await renderer.loadStudy(document,async()=>({ok:false})),null);
  assert.match(document.getElementById("researchDataStatus").textContent,/temporarily unavailable/);
  assert.equal(document.getElementById("researchTrades").textContent,"—");
});

test("the page loads historical research without requesting live feeds",async()=>{
  const document=fixture();let requested="";
  await renderer.loadStudy(document,async url=>{requested=url;return {ok:true,json:async()=>study};});
  assert.equal(requested,"/data/intraday_research_with_ex_20261013.json");
  assert.doesNotMatch(page,/fetch\("\/data\/algo-pnl\.json"/);
  assert.doesNotMatch(page,/fetch\("\/data\/live-benchmarks\.json"/);
  assert.match(page,/historical_comparison_20261013/);
  assert.match(page,/Live Performance Reporting Paused/);
  assert.doesNotMatch(page,/Historical Research<\/th><th scope="col">Live/);
  assert.doesNotMatch(page,/out.of.sample|institutional grade|proven backtest/i);
});
