"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/selected_ex_research_20261013.json"),chart=read("data/selected_ex_historical_comparison_20261013.json"),page=text("algo-pnl.html");

test("latest corrected R1 Bull replay is the only rendered EX study",()=>{
  const document=fixture();renderer.renderStudy(document,study);
  const expected={researchTrades:"281",researchGrossPnl:"+$908",researchWinRate:"45.55%",researchProfitFactor:"1.196",researchSharpe:"0.106",researchDrawdown:"-$496",researchCoverage:"911 / 932 sessions",researchEXTrades:"281",researchUnresolved:"21 unassessable",researchRuleset:"Selected EX sleeve · SL20 / TP30"};
  for(const [id,value] of Object.entries(expected)) assert.equal(document.getElementById(id).textContent,value);
  assert.match(document.getElementById("researchPeriod").textContent,/January 4, 2023.*September 21, 2026.*Selected EX one-contract research/);
  assert.match(document.getElementById("researchTradeSummary").textContent,/128 wins · 153 losses · 2 time exits/);
  assert.equal(study.statistics.tp_exits,128);assert.equal(study.statistics.sl_exits,151);assert.equal(study.statistics.time_exits,2);
});

test("selected curve is aligned, positive, and explicitly incomplete at its endpoint",()=>{
  assert.match(chart.source_study_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(chart.series.map(s=>s.label),["Selected EX","Foxchase Multi-Day","SPY Buy & Hold"]);
  assert.equal(chart.dates.length,932);assert.equal(chart.dates[0],"2023-01-04");assert.equal(chart.dates.at(-1),"2026-09-22");
  const selected=chart.series.find(s=>s.label==="Selected EX"),end=chart.dates.indexOf("2026-09-21");
  assert.equal(selected.validated_through,"2026-09-21");assert.equal(selected.values[0],10000);assert.ok(selected.values[end]>10000);assert.equal(selected.values.at(-1),null);
  assert.ok(selected.values.slice(0,end+1).every(value=>Number.isFinite(value)&&value>0));
});

test("yearly totals reconcile to the selected one-contract study",()=>{
  assert.equal(study.yearly.reduce((n,r)=>n+r.trades,0),281);
  assert.equal(study.yearly.reduce((n,r)=>n+r.gross_pnl,0),908);
  const document=fixture();renderer.renderStudy(document,study);
  for(const r of study.yearly){assert.equal(document.getElementById(`researchYear${r.year}Trades`).textContent,String(r.trades));}
});

test("invalid selected study metadata fails closed",()=>{
  for(const change of [{sessions_assessable:910},{statistics:{...study.statistics,trades:280}},{yearly:[]},{complete_history:true},{unknown_outcomes_are_zero:true}]){
    const document=fixture();assert.throws(()=>renderer.renderStudy(document,{...study,...change}),/metadata invalid/);assert.equal(document.getElementById("researchTrades").textContent,"—");
  }
});

test("selected study keeps historical execution and uncertainty disclosures",()=>{
  assert.match(study.execution_basis,/event-time ATM exact contract/i);assert.match(study.execution_basis,/90-second entry-age bound/);
  assert.match(study.sizing_basis,/One contract per admitted trade/);assert.match(study.input_policy,/unknown, not zero/);
  assert.match(page,/selected EX historical comparison|selected EX one-contract/i);assert.match(page,/no new shared-capital core-plus-EX result is inferred/);
  assert.match(page,/fetch\("\/data\/algo-pnl\.json", \{ cache: "no-store" \}\)/);
});
