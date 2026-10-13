"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {root,text,read,fixture}=require("./research-fixture");
const renderer=require("../js/algo-pnl-research-integrity.js");

test("only the selected EX curve is restored to data and selector",()=>{
  const chart=read("data/selected_ex_historical_comparison_20261013.json"),page=text("algo-pnl.html");
  assert.deepEqual(chart.series.map(s=>s.label),["Selected EX","Foxchase Multi-Day","SPY Buy & Hold"]);
  const source=read("data/selected_ex_research_20261013.json");
  assert.equal(source.classification,"SELECTED_EX_ONE_CONTRACT_RESEARCH");
  assert.equal(source.statistics.trades,281);assert.equal(source.statistics.gross_pnl,908.0000000000001);
  assert.match(page,/data-comparison-series="Selected EX"/);
  assert.match(page,/standalone one-contract replay/);
  assert.doesNotMatch(page,/data-comparison-series="Foxchase Combined"|Modeled portfolio comparison/);
  assert.doesNotMatch(page,/unchanged earlier research records|neither incorporates this updated Intraday/);
  for(const name of ["historical_comparison_20260923.json","ex_strategy_backtest.json","intraday_research_integrity_20260922.json","intraday_research_curve_20260922.json","INTRADAY_RESEARCH_INTEGRITY.md"])
    assert.ok(!fs.existsSync(path.join(root,"data",name)),"retired public artifacts must not remain reachable");
});

test("selected EX and Multi-Day curves retain explicit validation endpoints",()=>{
  const chart=read("data/selected_ex_historical_comparison_20261013.json");
  assert.equal(chart.dates.length,932);assert.equal(chart.dates[0],"2023-01-04");assert.equal(chart.dates.at(-1),"2026-09-22");
  const selected=chart.series.find(s=>s.label==="Selected EX");assert.equal(selected.validated_through,"2026-09-21");assert.equal(selected.values.at(-1),null);
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
  const document=fixture();renderer.renderStudy(document,read("data/selected_ex_research_20261013.json"));
  assert.match(document.getElementById("researchLimitations").textContent,/simulated research and separate from live account performance/);
  assert.match(document.getElementById("researchLimitations").textContent,/Twenty-one sessions remain unassessable/);
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

test("selected EX copy preserves costs, one-contract scope and component dates",()=>{
  const page=text("algo-pnl.html"),document=fixture();
  renderer.renderStudy(document,read("data/selected_ex_research_20261013.json"));
  assert.equal(document.getElementById("researchTradeSummary").textContent,"128 wins · 153 losses · 2 time exits. Gross one-contract P&L is +$908.");
  assert.match(page,/selected EX line is a standalone one-contract gross replay normalized to \$10,000/);
  assert.match(page,/selected EX replay is validated through September 21, 2026/);
  assert.match(page,/Multi-Day remains validated through August 25, 2026/);
  assert.doesNotMatch(page,/Intraday includes modeled EX research|Foxchase Combined|position sizes compound with modeled equity/);
  assert.doesNotMatch(page,/id="researchInputPolicy"|id="researchSizingBasis"|id="researchCostNote"/);
});
