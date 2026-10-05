"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {read,text}=require("./research-fixture");

test("Combined is backed by independently validated zero-breach research",()=>{
  const source=read("data/combined_research_20261003.json");
  assert.equal(source.status,"VALIDATED_SHARED_ACCOUNT_RESEARCH");
  assert.equal(source.validation.risk_breaches,0);
  for(const name of["accounting_reconciles","complete_state_checks","no_missing_valuations","independent_review_passed","source_controls_unchanged"])
    assert.equal(source.validation[name],true);
  assert.equal(source.initial_value,10000);assert.equal(source.start,"2023-01-04");assert.equal(source.end,"2026-08-25");
  assert.equal(source.daily.length,913);assert.equal(source.daily[0].equity,10000);assert.equal(source.daily.at(-1).equity,322107.3);
  assert.equal(source.metrics.net_account_pnl,312107.3);assert.equal(source.metrics.ending_equity,322107.3);
  assert.match(source.research_release_sha256,/^[a-f0-9]{64}$/);
});

test("every Combined point reconciles to the canonical exported daily accounting",()=>{
  const source=read("data/combined_research_20261003.json"),chart=read("data/historical_comparison_20261003.json");
  const series=chart.series.find(s=>s.label==="Foxchase Combined");
  assert.ok(series);assert.equal(series.validated_through,source.end);
  const byDate=new Map(source.daily.map(r=>[r.date,r.equity]));let prior=10000;
  for(const r of source.daily){assert.ok(Number.isFinite(r.equity)&&r.equity>0);assert.equal(Math.round((r.equity-prior)*100),Math.round(r.net_pnl*100));prior=r.equity;}
  for(const[ i,date]of chart.dates.entries())assert.equal(series.values[i],date<=source.end?byDate.get(date):null);
  const canonical=source.daily.map(r=>`${r.date},${r.equity.toFixed(2)}\n`).join("");
  assert.equal(crypto.createHash("sha256").update(canonical).digest("hex"),source.curve_sha256);
  assert.equal(series.curve_sha256,source.curve_sha256);
});

test("Combined daily Sharpe and drawdowns independently reconcile",()=>{
  const source=read("data/combined_research_20261003.json"),v=[10000,...source.daily.map(r=>r.equity)];
  const returns=v.slice(1).map((x,i)=>x/v[i]-1),mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const sd=Math.sqrt(returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(returns.length-1));
  assert.ok(Math.abs(Math.sqrt(252)*mean/sd-source.metrics.daily_sharpe)<1e-12);
  let peak=10000,dd=0,pct=0;
  for(const value of v){peak=Math.max(peak,value);dd=Math.min(dd,value-peak);pct=Math.min(pct,100*(value/peak-1));}
  assert.equal(dd,source.metrics.max_drawdown_dollars);assert.ok(Math.abs(pct-source.metrics.max_drawdown_pct)<1e-12);
});

test("Combined uses shared capital rather than independent-curve addition or a retired endpoint",()=>{
  const chart=read("data/historical_comparison_20261003.json"),get=n=>chart.series.find(s=>s.label===n).values;
  const combined=get("Foxchase Combined"),intraday=get("Foxchase Intraday"),multi=get("Foxchase Multi-Day");
  assert.ok(combined.some((v,i)=>v!==null&&Math.abs(v-(intraday[i]+multi[i]-10000))>.01));
  const end=chart.dates.indexOf("2026-08-25");assert.equal(combined[end],322107.3);
  assert.notEqual(combined[end],73796.9);assert.notEqual(combined[end],283313.9);
  assert.ok(combined.slice(end+1).every(v=>v===null));
});

test("Combined public copy states the shared-account boundary without private rules",()=>{
  const page=text("algo-pnl.html");
  assert.match(page,/data-comparison-series="Foxchase Combined"/);
  assert.match(page,/single-account replay of current Intraday and Multi-Day research under shared capital and risk constraints/);
  assert.match(page,/not a sum of independently compounded curves/);
  assert.match(page,/last jointly validated date/);
  assert.doesNotMatch(page,/Combined shared-account replay is not shown|Combined curve is not currently shown|unchanged earlier research records/);
  assert.doesNotMatch(text("data/combined_research_20261003.json"),/research\/|allocation_pct|candidate_id|risk_per_unit|exposure_ceiling|priority|sleeve|R[1-6]/);
});
