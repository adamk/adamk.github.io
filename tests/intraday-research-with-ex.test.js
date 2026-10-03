"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,ledger,fixture}=require("./research-fixture");
const study=read("data/intraday_research_with_ex_20261003.json"),chart=read("data/historical_comparison_20261003.json"),curve=read("data/intraday_research_curve_20261003.json");
const csv=text("data/intraday_research_ledger_20261003.csv"),rows=ledger("data/intraday_research_ledger_20261003.csv"),page=text("algo-pnl.html");
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test("current Intraday metrics and separate component coverage remain unchanged",()=>{
  const document=fixture();renderer.renderStudy(document,study);
  const expected={researchTrades:"526",researchGrossPnl:"+$206,578",researchWinRate:"57.60%",researchProfitFactor:"1.888",researchSharpe:"2.317",researchDrawdown:"-$12,146 / -34.77%",researchCoverage:"Spreads 929 / 932",researchCoreTrades:"259",researchEXTrades:"267",researchUnresolved:"Spreads 3 · EX 229",researchRuleset:"Intraday + EX sleeves"};
  for(const [id,value]of Object.entries(expected))assert.equal(document.getElementById(id).textContent,value);
  assert.match(document.getElementById("researchCoveragePct").textContent,/EX 607 \/ 836 sessions.*May 5, 2026/);
  assert.match(document.getElementById("researchPeriod").textContent,/January 4, 2023.*September 22, 2026/);
  assert.match(document.getElementById("researchTradeSummary").textContent,/303 wins · 222 losses · 1 flat/);
});

test("anonymous ledger reproduces counts, gross economics and closed-trade drawdown",()=>{
  assert.ok(!csv.includes("\r"));assert.equal(csv.split("\n")[0],"record_id,date,close_sequence,gross_pnl");
  assert.equal(rows.length,526);assert.equal(new Set(rows.map(r=>r.record_id)).size,526);
  assert.equal(rows.filter(r=>r.gross_pnl>0).length,303);assert.equal(rows.filter(r=>r.gross_pnl<0).length,222);assert.equal(rows.filter(r=>r.gross_pnl===0).length,1);
  const gains=rows.reduce((n,r)=>n+Math.max(0,r.gross_pnl),0),losses=-rows.reduce((n,r)=>n+Math.min(0,r.gross_pnl),0);
  assert.equal(gains-losses,206578);close(gains/losses,study.statistics.profit_factor);
  let equity=10000,peak=equity,dd=0,ddp=0;
  for(const r of rows){equity+=r.gross_pnl;peak=Math.max(peak,equity);dd=Math.min(dd,equity-peak);ddp=Math.min(ddp,100*(equity/peak-1));}
  assert.equal(equity,216578);assert.equal(dd,-12146);close(ddp,study.statistics.max_drawdown_pct);
  assert.equal(crypto.createHash("sha256").update(csv).digest("hex"),study.source_ledger_sha256);
});

test("every daily chart point reconciles to the unchanged Intraday ledger",()=>{
  const byDay=new Map();for(const r of rows)byDay.set(r.date,(byDay.get(r.date)||0)+r.gross_pnl);
  let equity=10000;const series=chart.series.find(s=>s.label==="Foxchase Intraday");
  for(const [i,day]of chart.dates.entries()){equity+=byDay.get(day)||0;assert.equal(series.values[i],equity);assert.deepEqual(curve.points[i],{date:day,equity});}
  assert.equal(curve.source_ledger_sha256,study.source_ledger_sha256);assert.equal(series.source_ledger_sha256,study.source_ledger_sha256);assert.equal(curve.points.at(-1).equity,216578);
});

test("annual portfolio totals and aggregate core/EX counts reconcile",()=>{
  assert.equal(study.core_trades+study.ex_trades,526);assert.equal(study.yearly.reduce((n,r)=>n+r.total_trades,0),526);assert.equal(study.yearly.reduce((n,r)=>n+r.combined_pnl,0),206578);
  const document=fixture();renderer.renderStudy(document,study);
  for(const r of study.yearly){const group=rows.filter(t=>t.date.startsWith(String(r.year)));assert.equal(group.length,r.total_trades);assert.equal(group.reduce((n,t)=>n+t.gross_pnl,0),r.combined_pnl);assert.equal(document.getElementById(`researchYear${r.year}Trades`).textContent,String(r.total_trades));}
});

test("invalid coverage, economics or exact-live claims fail before any partial rendering",()=>{
  for(const change of [{core_trades:263},{spread_evaluable_sessions:930},{ex_evaluable_sessions:608},{ex_study_end:"2026-10-03"},{live_execution_parity:true},{unknown_component_outcomes_are_zero:true},{yearly:[]},{starting_equity:10001},{limitations:""},{source_ledger_sha256:"invalid"}]){
    const document=fixture();assert.throws(()=>renderer.renderStudy(document,{...study,...change}),/metadata invalid/);assert.equal(document.getElementById("researchTrades").textContent,"—");}
});

test("public copy preserves broad execution and sizing transparency",()=>{
  assert.match(study.execution_basis,/does not reproduce actual broker fills/);assert.match(study.sizing_basis,/compound with modeled equity/);assert.match(study.input_policy,/not synthesized/);
  assert.match(page,/fetch\("\/data\/algo-pnl\.json", \{ cache: "no-store" \}\)/);assert.doesNotMatch(study.scope,/10 credit-spread|does not include separate divergence/i);
});

test("live rendering cannot replace any historical value",()=>{
  const document=fixture(),live=read("data/algo-pnl.json");renderer.renderStudy(document,study);renderer.renderLive(document,live.canonical_metrics,true);
  assert.equal(document.getElementById("researchTrades").textContent,"526");assert.equal(document.getElementById("compareLiveTrades").textContent,String(live.canonical_metrics.trades.closed_trade_count));
  renderer.renderLive(document,live.canonical_metrics,false);assert.equal(document.getElementById("compareLiveTrades").textContent,"—");assert.equal(document.getElementById("compareHistoricalTrades").textContent,"526");
});
