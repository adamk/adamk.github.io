"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {root,text,read,fixture}=require("./research-fixture");
const renderer=require("../js/algo-pnl-research-integrity.js");

test("only the newly validated Combined curve is restored to data and selector",()=>{
  const chart=read("data/historical_comparison_20261003.json"),page=text("algo-pnl.html");
  assert.deepEqual(chart.series.map(s=>s.label),["Foxchase Intraday","Foxchase Multi-Day","Foxchase Combined","SPY Buy & Hold","JEPI Buy & Hold"]);
  const source=read("data/combined_research_20261003.json");
  assert.equal(source.status,"VALIDATED_SHARED_ACCOUNT_RESEARCH");assert.equal(source.validation.risk_breaches,0);
  assert.match(page,/data-comparison-series="Foxchase Combined"/);
  assert.match(page,/not obtained by summing independently compounded/);
  assert.doesNotMatch(page,/Combined shared-account replay is not shown/);
  assert.doesNotMatch(page,/unchanged earlier research records|neither incorporates this updated Intraday/);
  for(const name of ["historical_comparison_20260923.json","ex_strategy_backtest.json","intraday_research_integrity_20260922.json","intraday_research_curve_20260922.json","INTRADAY_RESEARCH_INTEGRITY.md"])
    assert.ok(!fs.existsSync(path.join(root,"data",name)),"retired public artifacts must not remain reachable");
});

test("the three retained series are unchanged and Multi-Day uses the corrected record",()=>{
  const chart=read("data/historical_comparison_20261003.json");
  const hashes={"Foxchase Intraday":"977ea3ffd79ba8e17aac8a42aec8f907cfa14e91758a74c89bb7a5ff0affa270",
    "SPY Buy & Hold":"8e94e9dc6c73539f0f05ed9c7dd2803bf2314240b885646ae3fe5f2d987ed5ac",
    "JEPI Buy & Hold":"8ad1d0b895a63c2dfed6bea3a2eda4604f58d7a917d106d10c6f5d5c1d92a4af"};
  assert.equal(chart.dates.length,932);assert.equal(chart.dates[0],"2023-01-04");assert.equal(chart.dates.at(-1),"2026-09-22");
  for(const label of Object.keys(hashes)){const series=chart.series.find(s=>s.label===label);assert.ok(series);assert.equal(crypto.createHash("sha256").update(JSON.stringify(series.values)).digest("hex"),hashes[label]);}
  const multiday=chart.series.find(s=>s.label==="Foxchase Multi-Day"),index=chart.dates.indexOf("2026-08-25");
  assert.equal(multiday.validated_through,"2026-08-25");assert.equal(multiday.values[index],27351.1);
  const corrected=read("data/multiday_research_20261003.json");
  assert.equal(corrected.status,"VALIDATED_MULTIDAY_RESEARCH");assert.equal(corrected.daily.length,913);
  for(const point of corrected.daily)assert.equal(multiday.values[chart.dates.indexOf(point.date)],point.equity);
  assert.ok(multiday.values.every((value,i)=>i<=index||value===null));
});

test("public research artifacts contain aggregate evidence without sleeve-level detail",()=>{
  const names=["algo-pnl.html","js/algo-pnl-research-integrity.js",...fs.readdirSync(path.join(root,"data")).filter(n=>n!=="algo-pnl.json").map(n=>"data/"+n)];
  const content=names.map(text).join("\n");
  assert.doesNotMatch(content,/Directional Alpha|Live Pilot|R[1256][ _-](BULL|BEAR|EX)|SPY-EX-/i);
  assert.doesNotMatch(content,/jointly_evaluable_sessions|spread_unresolved_sessions|direct_EX_pnl|matched_spread_sizing_effect|displaced_spread_count|separate_additive_EX_compounding_term/);
  assert.doesNotMatch(content,/low.confidence|pilot samples|one.contract EX total|shared 15% contractual|Commissioned EX sleeves use/);
  for(const name of names.filter(n=>n.endsWith(".json")))assert.doesNotMatch(text(name),/research\/|sqrt\(252\)|sample standard deviation/);
});

test("concise limitations preserve material transparency without internal commentary",()=>{
  const document=fixture();renderer.renderStudy(document,read("data/intraday_research_with_ex_20261003.json"));
  assert.equal(document.getElementById("researchLimitations").textContent,"Historical results are simulated research and are separate from live account performance. The research uses modeled historical execution, retrospective portfolio sizing, and datasets with differing coverage periods. Historical quotes do not fully reproduce live market conditions, broker execution, liquidity, capacity, or market impact. Required missing inputs remain unknown; this update does not estimate or synthesize them. Historical results do not guarantee future performance.");
  assert.match(text("algo-pnl.html"),/not actual account equity/);
});
