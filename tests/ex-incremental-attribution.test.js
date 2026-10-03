"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,ledger,fixture}=require("./research-fixture");
const data=read("data/intraday_research_attribution_20261003.json"),study=read("data/intraday_research_with_ex_20261003.json"),page=text("algo-pnl.html");
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test("aggregate same-engine comparison renders accurate metrics without changing live",()=>{
  const document=fixture();renderer.renderStudy(document,study);document.getElementById("headlineClosedTrades").textContent="34";
  renderer.renderAttribution(document,data,study);
  const expected={modelSpreadTrades:"263",modelCombinedTrades:"526",modelSpreadPnl:"+$22,332",modelCombinedPnl:"+$206,578",modelSpreadPF:"2.598",modelCombinedPF:"1.888",modelSpreadSharpe:"2.387",modelCombinedSharpe:"2.317",modelSpreadDD:"-$899 / -7.89%",modelCombinedDD:"-$12,146 / -34.77%"};
  for(const[id,value]of Object.entries(expected))assert.equal(document.getElementById(id).textContent,value);
  assert.equal(document.getElementById("researchTrades").textContent,"526");assert.equal(document.getElementById("headlineClosedTrades").textContent,"34");
  assert.match(document.getElementById("researchLegacyContext").textContent,/original sizing convention/);
  assert.match(document.getElementById("researchLegacyContext").textContent,/not EX trade profit alone/);
  assert.match(document.getElementById("researchModelInterpretation").textContent,/lower.*profit factor.*Daily Sharpe.*deeper.*drawdown/);
});

test("aggregate dollar difference and ratio changes reconcile exactly",()=>{
  assert.equal(data.incremental_portfolio_pnl,184246);
  assert.equal(data.combined.gross_pnl-data.spread_only.gross_pnl,data.incremental_portfolio_pnl);
  for(const[key,value]of Object.entries(data.deltas))close(value,data.combined[key]-data.spread_only[key]);
  assert.equal(data.same_engine,true);assert.equal(data.research_rules_unchanged,true);
});

test("anonymous spread-only ledger reproduces economics and every curve point",()=>{
  const name="data/intraday_spread_only_normalized_20261003.csv",csv=text(name),rows=ledger(name);
  assert.equal(rows.length,263);assert.equal(new Set(rows.map(r=>r.record_id)).size,263);
  assert.equal(rows.filter(r=>r.gross_pnl>0).length,173);assert.equal(rows.filter(r=>r.gross_pnl<0).length,89);assert.equal(rows.filter(r=>r.gross_pnl===0).length,1);
  const gains=rows.reduce((n,r)=>n+Math.max(0,r.gross_pnl),0),losses=-rows.reduce((n,r)=>n+Math.min(0,r.gross_pnl),0);
  assert.equal(gains-losses,22332);close(gains/losses,data.spread_only.profit_factor);
  assert.equal(crypto.createHash("sha256").update(csv).digest("hex"),data.spread_only_source_ledger_sha256);
  const curve=read("data/intraday_research_spread_only_curve_20261003.json"),daily=new Map();for(const r of rows)daily.set(r.date,(daily.get(r.date)||0)+r.gross_pnl);
  let equity=10000;for(const r of curve.points){equity+=daily.get(r.date)||0;assert.equal(r.equity,equity);}
  assert.equal(curve.points.length,932);assert.equal(curve.points.at(-1).date,"2026-09-22");assert.equal(equity,32332);
});

test("annual aggregate comparisons and legacy provenance reconcile",()=>{
  assert.equal(data.yearly.reduce((n,r)=>n+r.spread_only_gross_pnl,0),22332);assert.equal(data.yearly.reduce((n,r)=>n+r.combined_gross_pnl,0),206578);
  assert.equal(data.yearly.reduce((n,r)=>n+r.incremental_portfolio_pnl,0),184246);
  for(const year of data.yearly)assert.equal(year.incremental_portfolio_pnl,year.combined_gross_pnl-year.spread_only_gross_pnl);
  assert.equal(data.legacy.trades,263);assert.equal(data.legacy.gross_pnl,22332);assert.equal(data.legacy.daily_sharpe_annualized.toFixed(3),"2.387");
});

test("malformed comparison fails closed without weakening reconciliation",()=>{
  const bad=[{...data,same_engine:false},{...data,research_rules_unchanged:false},{...data,missing_EX_outcomes_are_unknown:false},{...data,end:"2026-10-03"},{...data,incremental_portfolio_pnl:184247},{...data,deltas:{...data.deltas,gross_pnl:184247}},{...data,combined:{...data.combined,profit_factor:2}},{...data,coverage:{...data.coverage,ex:608}},{...data,legacy_context:null},{...data,yearly:data.yearly.map((r,i)=>i===0?{...r,incremental_portfolio_pnl:r.incremental_portfolio_pnl+1}:r)}];
  for(const value of bad)assert.throws(()=>renderer.renderAttribution(fixture(),value,study),/Attribution metadata invalid/);
});

test("unavailable comparison does not replace Intraday or live metrics",async()=>{
  const document=fixture();renderer.renderStudy(document,study);await renderer.loadAttribution(document,async()=>({ok:false}));
  assert.match(document.getElementById("attributionDataStatus").textContent,/temporarily unavailable/);assert.equal(document.getElementById("researchTrades").textContent,"526");assert.equal(document.getElementById("modelSpreadPnl").textContent,"—");
});

test("public comparison distinguishes portfolio return from EX trade profit",()=>{
  assert.match(page,/Modeled portfolio comparison/);assert.match(page,/Spread-only normalized/);assert.match(page,/Spread \+ EX/);
  assert.match(data.legacy_context,/not EX trade profit alone/);assert.doesNotMatch(page,/researchEXAttribution/);
  assert.match(page,/position sizes compound with modeled equity/);assert.match(page,/not actual account equity/);
});
