"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {text,read} = require("./research-fixture");
const api = require("../js/live-benchmarks.js");
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
function fixture() {
  return {initial_value:10000, comparison_start:"2026-05-04",study_end:"2026-05-06",
    dates:["2026-05-04","2026-05-05","2026-05-06"],series:[
      {label:"Foxchase Intraday",validated_through:"2026-05-06",values:[10000,10100,10200]},
      {label:"Foxchase Multi-Day",validated_through:"2026-05-05",values:[10000,10050,null]},
      {label:"Foxchase Combined",validated_through:"2026-05-05",values:[10000,10200,null]},
      {label:"SPY Buy & Hold",validated_through:"2026-05-06",values:[10000,10100,10300]}]};
}
function source() {
  return {schema:"foxchase-historical-cash-v1",base_index:100,source_start:"2026-05-04",source_end:"2026-05-06",
    cash:{series:"UST_3MO_PAR",unit:"annual_percent",observations:[
      {date:"2026-05-01",annual_yield_pct:3.65},{date:"2026-05-04",annual_yield_pct:7.3}]}};
}

test("historical benchmarks normalize to 100 without changing dollar curves",()=>{
  assert.equal(typeof api.historicalComparison,"function");
  const input=fixture(),before=JSON.stringify(input),out=api.historicalComparison(input,source());
  assert.equal(out.cash.available,true);assert.equal(out.cash.values[0],100);
  close(out.cash.values[1],100.01);close(out.cash.values[2],100.030002);
  assert.deepEqual(out.datasets.map(d=>d.label),["Foxchase Backtest","Risk-Free / Cash","SPY Buy & Hold"]);
  assert.ok(out.datasets.every(d=>d.data[0]===100&&d.data.length===input.dates.length));
  assert.deepEqual(out.datasets[0].data,[100,101,102]);assert.deepEqual(out.datasets[2].data,[100,101,103]);
  assert.equal(JSON.stringify(input),before);
});
test("each historical strategy compares cash and SPY at its own endpoint",()=>{
  assert.equal(typeof api.historicalComparison,"function");
  const out=api.historicalComparison(fixture(),source());
  assert.equal(out.rows.length,3);
  const intraday=out.rows[0],combined=out.rows[2];
  assert.equal(intraday.end,"2026-05-06");close(intraday.strategy_return_pct,2);
  close(intraday.cash_return_pct,.030002);close(intraday.excess_return_pp,2-.030002);close(intraday.spy_return_pct,3);
  assert.equal(combined.end,"2026-05-05");close(combined.cash_return_pct,.01);close(combined.spy_return_pct,1);
  close(combined.excess_return_pp,1.99);
});
test("missing, stale, malformed or misaligned historical rates preserve research and SPY",()=>{
  assert.equal(typeof api.historicalComparison,"function");
  for(const change of [()=>null,s=>{s.source_end="2026-05-05";return s;},s=>{s.cash.observations=[];return s;},
    s=>{s.cash.observations[0].date="2026-04-01";s.cash.observations.splice(1);return s;},
    s=>{s.cash.observations[0].annual_yield_pct=365;return s;}]) {
    const input=fixture(),before=JSON.stringify(input),out=api.historicalComparison(input,change(source()));
    assert.equal(out.cash.available,false);assert.equal(out.cash.values,null);
    assert.ok(out.rows.every(r=>r.cash_return_pct===null&&r.excess_return_pp===null));
    close(out.rows[0].spy_return_pct,3);assert.equal(JSON.stringify(input),before);
  }
});
test("historical comparison refuses a rebased or extended strategy path",()=>{
  assert.equal(typeof api.historicalComparison,"function");
  const rebased=fixture();rebased.series[0].values[0]=9999;
  assert.throws(()=>api.historicalComparison(rebased,source()));
  const extended=fixture();extended.series[2].values[2]=10200;
  assert.throws(()=>api.historicalComparison(extended,source()));
});
test("public historical section makes cash primary and retains SPY secondary",()=>{
  const html=text("algo-pnl.html");
  assert.ok(/id="backtestBenchmarkChart"/.test(html),"normalized backtest chart missing");
  assert.ok(/id="historicalBenchmarkRows"/.test(html),"historical benchmark return rows missing");
  assert.ok(/id="historicalBenchmarkStatus"/.test(html),"historical benchmark status missing");
  assert.ok(/id="historicalBenchmarkMethodology"/.test(html),"historical source disclosure missing");
  assert.ok(/cash.*primary.*SPY.*secondary/i.test(html),"cash must be primary and SPY secondary");
  assert.deepEqual(read("data/historical_comparison_20261003.json").series.map(s=>s.label),
    ["Foxchase Intraday","Foxchase Multi-Day","Foxchase Combined","SPY Buy & Hold"]);
});
