"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/intraday_research_with_ex_20261013.json"),chart=read("data/historical_comparison_20261013.json"),page=text("algo-pnl.html");

test("latest corrected Intraday replay is the primary rendered study",()=>{
  const document=fixture();renderer.renderStudy(document,study);
  const expected={researchTrades:"530",researchGrossPnl:"+$92,414",researchWinRate:"55.47%",researchProfitFactor:"1.438",researchSharpe:"1.730",researchDrawdown:"-$14,302 / -41.15%",researchCoverage:"Spreads 929 / 932",researchCoreTrades:"258",researchEXTrades:"272",researchUnresolved:"Spreads 3 · EX 21",researchRuleset:"Intraday + corrected commissioned EX"};
  for(const [id,value] of Object.entries(expected)) assert.equal(document.getElementById(id).textContent,value);
  assert.match(document.getElementById("researchPeriod").textContent,/January 4, 2023.*September 22, 2026.*Corrected commissioned EX integration/);
  assert.equal(document.getElementById("researchTradeSummary").textContent,"294 wins · 235 losses · 1 flat.");
});

test("Intraday curve is aligned and complete through the corrected study endpoint",()=>{
  assert.match(chart.provenance,/corrected commissioned EX-only integration/i);
  assert.deepEqual(chart.series.map(s=>s.label),["Foxchase Intraday","Foxchase Multi-Day","Foxchase Combined","SPY Buy & Hold"]);
  assert.equal(chart.dates.length,932);assert.equal(chart.dates[0],"2023-01-04");assert.equal(chart.dates.at(-1),"2026-09-22");
  const intraday=chart.series.find(s=>s.label==="Foxchase Intraday");
  assert.equal(intraday.validated_through,"2026-09-22");assert.equal(intraday.values[0],10000);assert.equal(intraday.values.at(-1),102414);
  assert.ok(intraday.values.every(value=>Number.isFinite(value)&&value>0));
});

test("yearly totals reconcile to the corrected Intraday study",()=>{
  assert.equal(study.yearly.reduce((n,r)=>n+r.total_trades,0),530);
  assert.equal(study.yearly.reduce((n,r)=>n+r.combined_pnl,0),92414);
  const document=fixture();renderer.renderStudy(document,study);
  for(const r of study.yearly){assert.equal(document.getElementById(`researchYear${r.year}Trades`).textContent,String(r.total_trades));}
});

test("invalid corrected study metadata fails closed",()=>{
  for(const change of [{schema_version:2},{classification:"BAD"},{sessions_considered:931},{spread_evaluable_sessions:928},{statistics:{...study.statistics,trades:529}},{yearly:[]}]){
    const document=fixture();assert.throws(()=>renderer.renderStudy(document,{...study,...change}),/metadata invalid/);assert.equal(document.getElementById("researchTrades").textContent,"—");
  }
});

test("corrected study keeps historical execution and uncertainty disclosures",()=>{
  assert.match(study.execution_basis,/modeled/i);assert.match(study.execution_basis,/sub-minute quote polling/);
  assert.match(study.sizing_basis,/retrospective risk-normalized sizing/);assert.match(study.input_policy,/unknown and are not synthesized/);
  assert.match(page,/corrected commissioned EX/i);assert.match(page,/historical_comparison_20261013/);
  assert.doesNotMatch(page,/selected_ex_historical_comparison_20261013|Selected EX/);
  assert.match(page,/data-comparison-series="Foxchase Combined"/);
  assert.doesNotMatch(page,/fetch\("\/data\/(?:algo-pnl|live-benchmarks)\.json"/);
});
