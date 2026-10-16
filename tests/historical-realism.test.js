"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {text,read}=require("./research-fixture");

test("adjusted SPY source remains available to the benchmark research pipeline",()=>{
  const source=read("data/benchmark_research_20261003.json");
  assert.ok(Array.isArray(source.daily)&&source.daily.length>0);
  for(const point of source.daily)assert.deepEqual(Object.keys(point),["date","SPY"]);
  assert.doesNotMatch(JSON.stringify(source),/JEPI/i);
});

test("public CORE page no longer loads the obsolete combined comparison datasets",()=>{
  const page=text("algo-pnl.html");
  for(const name of ["historical_comparison_20261013.json","combined_research_20261003.json","multiday_research_20261003.json"])
    assert.equal(page.includes(name),false,name);
  assert.match(text("js/core-period-page.js"),/core_alpaca_fee_periods_20261016/);
  assert.match(page,/coreBenchmarkScenario/);
  assert.match(page,/corePortfolioChart/);
});
