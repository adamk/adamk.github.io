"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {root,text,read,fixture}=require("./research-fixture");
const renderer=require("../js/algo-pnl-research-integrity.js");

test("corrected Intraday updates only the main backtest while the portfolio chart stays intact",()=>{
  const chart=read("data/historical_comparison_20261013.json"),portfolio=read("data/historical_comparison_20261003.json"),page=text("algo-pnl.html");
  assert.deepEqual(chart.series.map(s=>s.label),["Foxchase Intraday","Foxchase Multi-Day","Foxchase Combined","SPY Buy & Hold"]);
  assert.deepEqual(portfolio.series.map(s=>s.label),["Foxchase Intraday","Foxchase Multi-Day","Foxchase Combined","SPY Buy & Hold"]);
  const source=read("data/intraday_research_with_ex_20261013.json");
  assert.equal(source.classification,"COMBINED_MODELED_INTRADAY_RESEARCH");
  assert.equal(source.statistics.trades,530);assert.equal(source.statistics.gross_pnl,92414);
  assert.match(page,/data-comparison-series="Foxchase Intraday"/);
  assert.match(page,/data-comparison-series="Foxchase Combined"/);
  assert.match(page,/historical_comparison_20261013/);
  assert.doesNotMatch(page,/selected_ex_historical_comparison_20261013|Selected EX/);
  assert.match(page,/Modeled portfolio comparison/);
  assert.match(page,/corrected commissioned EX sleeve only/);
});

test("corrected Intraday and Multi-Day curves retain explicit validation endpoints",()=>{
  const chart=read("data/historical_comparison_20261013.json");
  assert.equal(chart.dates.length,932);assert.equal(chart.dates[0],"2023-01-04");assert.equal(chart.dates.at(-1),"2026-09-22");
  const intraday=chart.series.find(s=>s.label==="Foxchase Intraday");assert.equal(intraday.validated_through,"2026-09-22");assert.equal(intraday.values.at(-1),102414);
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
  const document=fixture();renderer.renderStudy(document,read("data/intraday_research_with_ex_20261013.json"));
  assert.match(document.getElementById("researchLimitations").textContent,/simulated research, separate from live account performance/);
  assert.match(document.getElementById("researchLimitations").textContent,/Missing inputs remain unknown/);
  assert.match(text("algo-pnl.html"),/not actual account equity/);
});

test("backtest references the full Treasury methodology without repeating it",()=>{
  const page=text("algo-pnl.html");
  assert.equal((page.match(/BC_3MONTH/g)||[]).length,1);
  assert.equal((page.match(/yield percentage ÷ 100 ÷ 365/g)||[]).length,1);
  assert.match(page,/id="benchmarkMethodology"/);
  const note=page.match(/<details[^>]*id="historicalBenchmarkMethodology"[^>]*>([\s\S]*?)<\/details>/)[1];
  assert.match(note,/href="#benchmarkMethodology"/);
  assert.match(note,/independently aligned.*validated backtest period.*without rebasing/);
  assert.match(note,/dividend- and split-adjusted historical series/);
  assert.match(note,/Unsupported Treasury intervals.*unavailable/);
  assert.doesNotMatch(note,/BC_3MONTH|÷ 365|primary benchmark|secondary reference/);
  assert.match(page,/latest prior-dated observation.*at most seven calendar days/);
  assert.match(page,/Longer gaps make cash and excess return unavailable; rates are not backfilled or substituted/);
});

test("corrected Intraday copy preserves costs, scope and component dates",()=>{
  const page=text("algo-pnl.html"),document=fixture();
  renderer.renderStudy(document,read("data/intraday_research_with_ex_20261013.json"));
  assert.equal(document.getElementById("researchTradeSummary").textContent,"294 wins · 235 losses · 1 flat.");
  assert.match(page,/Intraday includes modeled EX research/);
  assert.match(page,/Foxchase Combined/);
  assert.match(page,/position sizes compound with modeled equity/);
  assert.match(page,/corrected commissioned EX sleeve only/);
});
