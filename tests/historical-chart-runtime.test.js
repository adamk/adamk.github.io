"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),crypto=require("node:crypto");
const {text,read}=require("./research-fixture");

async function run(mutate=()=>{},missing="") {
  const files={
    "/data/historical_comparison_20261003.json":read("data/historical_comparison_20261003.json"),
    "/data/combined_research_20261003.json":read("data/combined_research_20261003.json"),
    "/data/multiday_research_20261003.json":read("data/multiday_research_20261003.json"),
    "/data/benchmark_research_20261003.json":read("data/benchmark_research_20261003.json"),
    "/data/historical-cash-benchmark.json":read("data/historical-cash-benchmark.json")
  };
  mutate(files);
  const el=()=>({textContent:"",value:"linear",events:{},addEventListener(name,fn){this.events[name]=fn;}});
  const nodes=Object.fromEntries(["historicalComparisonStatus","historicalScale","historicalScaleStatus","historicalComparisonChart",
    "backtestBenchmarkChart","historicalBenchmarkStatus","backtestStrategyReturn","backtestCashReturn","backtestExcessReturn","backtestSPYReturn","backtestScale","backtestScaleStatus"].map(id=>[id,el()]));
  const controls=files["/data/historical_comparison_20261003.json"].series.map(s=>({...el(),dataset:{comparisonSeries:s.label},checked:true}));
  const charts=[];
  class Chart {constructor(canvas,config){Object.assign(this,config);this.canvas=canvas;this.updates=0;charts.push(this);}update(){this.updates++;}}
  const page=text("algo-pnl.html"),begin=page.indexOf("    function loadHistoricalComparison() {"),end=page.indexOf("    loadHistoricalComparison();",begin);
  const context=vm.createContext({Chart,Intl,Date,Map,Set,Number,Math,Error,Promise,
    FoxchaseBenchmarks:require("../js/live-benchmarks.js"),
    setTextIfExists:(id,value)=>{if(nodes[id])nodes[id].textContent=value;},
    formatCanonicalPercent:value=>value===null ? "—" : (value>0 ? "+" : "")+value.toFixed(2)+"%",
    window:{matchMedia:()=>({matches:false})},loadChartLibrary:async()=>Chart,
    document:{querySelectorAll:()=>controls,getElementById:id=>nodes[id]},
    fetch:async url=>({ok:url.split("?")[0]!==missing,json:async()=>files[url.split("?")[0]]})});
  vm.runInContext(page.slice(begin,end),context);await context.loadHistoricalComparison();
  return {files,nodes,controls,charts};
}

test("scale and visibility controls preserve every original dollar observation",async()=>{
  const {charts,nodes,controls}=await run();assert.equal(charts.length,2);
  const chart=charts.find(c=>c.canvas===nodes.historicalComparisonChart),before=JSON.stringify(chart.data.datasets);
  assert.deepEqual(Object.keys(chart.options.scales),["x","y"]);assert.equal(chart.options.scales.y.type,"linear");
  const tick=chart.options.scales.y.ticks.callback;
  assert.equal(tick.call({type:"logarithmic"},10000),"$10,000");
  assert.equal(tick.call({type:"logarithmic"},50000),"$50,000");
  assert.equal(tick.call({type:"logarithmic"},90000),null);
  assert.equal(tick.call({type:"linear"},90000),"$90,000");
  nodes.historicalScale.value="logarithmic";nodes.historicalScale.events.change();
  assert.equal(chart.options.scales.y.type,"logarithmic");assert.equal(JSON.stringify(chart.data.datasets),before);
  assert.ok(nodes.historicalScaleStatus.textContent.includes("equal percentage changes"));
  assert.ok(chart.options.scales.y.title.text.includes("logarithmic"));
  nodes.historicalScale.value="linear";nodes.historicalScale.events.change();
  assert.equal(chart.options.scales.y.type,"linear");assert.equal(JSON.stringify(chart.data.datasets),before);
  controls[0].checked=false;controls[0].events.change();assert.equal(chart.data.datasets.length,3);
  controls[0].checked=true;controls[0].events.change();assert.equal(JSON.stringify(chart.data.datasets),before);
  assert.ok(nodes.historicalComparisonStatus.textContent.includes("$20,873.45"));
  assert.equal(/JEPI/i.test(nodes.historicalComparisonStatus.textContent),false);
});

test("separate backtest benchmark chart starts at 100 and uses only canonical historical dates",async()=>{
  const {charts,nodes,files}=await run();assert.equal(charts.length,2);
  const chart=charts.find(c=>c.canvas===nodes.backtestBenchmarkChart),historical=files["/data/historical_comparison_20261003.json"];
  assert.deepEqual(chart.data.datasets.map(d=>d.label),["Foxchase Backtest","Risk-Free / Cash","SPY Buy & Hold"]);
  assert.ok(chart.data.datasets.every(d=>d.data[0]===100&&d.data.length===932));
  assert.deepEqual(chart.data.labels,historical.dates);assert.equal(chart.data.labels[0],"2023-01-04");assert.equal(chart.data.labels.at(-1),"2026-09-22");
  for(const [i,label] of [[0,"Foxchase Intraday"],[2,"SPY Buy & Hold"]]) {
    const original=historical.series.find(s=>s.label===label);
    assert.deepEqual(chart.data.datasets[i].data,original.values.map(value=>100*value/10000));
  }
  assert.equal(nodes.backtestStrategyReturn.textContent,"+2065.78%");assert.equal(nodes.backtestSPYReturn.textContent,"+111.29%");
  assert.match(nodes.historicalBenchmarkStatus.textContent,/2023-01-04–2026-09-22/);
  const before=JSON.stringify(chart.data.datasets);
  nodes.backtestScale.value="logarithmic";nodes.backtestScale.events.change();
  assert.equal(chart.options.scales.y.type,"logarithmic");assert.equal(JSON.stringify(chart.data.datasets),before);
  assert.deepEqual(Object.keys(chart.options.scales),["x","y"]);
});

test("unavailable historical cash leaves strategy, SPY and original research charts intact",async()=>{
  const valid=await run(),missing=await run(()=>{},"/data/historical-cash-benchmark.json");
  assert.equal(missing.charts.length,2);
  const oldChart=valid.charts.find(c=>c.canvas===valid.nodes.historicalComparisonChart),kept=missing.charts.find(c=>c.canvas===missing.nodes.historicalComparisonChart);
  assert.equal(JSON.stringify(kept.data.datasets),JSON.stringify(oldChart.data.datasets));
  assert.equal(missing.nodes.backtestCashReturn.textContent,"—");assert.equal(missing.nodes.backtestExcessReturn.textContent,"—");
  assert.equal(missing.nodes.backtestStrategyReturn.textContent,"+2065.78%");assert.equal(missing.nodes.backtestSPYReturn.textContent,"+111.29%");
  assert.match(missing.nodes.historicalBenchmarkStatus.textContent,/no rate is substituted/);
  const normalized=missing.charts.find(c=>c.canvas===missing.nodes.backtestBenchmarkChart);
  assert.ok(normalized.data.datasets[1].data.every(value=>value===null));
});

test("Multi-Day certificate matches all points, daily accounting and curve digest",()=>{
  const d=read("data/multiday_research_20261003.json");let prior=10000;
  for(const point of d.daily){assert.ok(Math.abs(point.equity-prior-point.net_pnl)<1e-8);prior=point.equity;}
  assert.equal(prior,27351.1);
  const hash=crypto.createHash("sha256").update(d.daily.map(p=>`${p.date},${p.equity.toFixed(2)}\n`).join("")).digest("hex");
  assert.equal(hash,d.curve_sha256);assert.equal(d.metrics.ending_equity,27351.1);
  assert.equal(d.daily.at(-1).date,"2026-08-25");
});

test("SPY adjusted benchmark reconciles independently at every date",()=>{
  const b=read("data/benchmark_research_20261003.json"),c=read("data/historical_comparison_20261003.json");
  assert.equal(b.adjustment,"split_and_dividend");assert.equal(b.daily.length,932);
  for(const t of ["SPY"]){const s=c.series.find(s=>s.label===t+" Buy & Hold");
    b.daily.forEach((p,i)=>{assert.equal(p.date,c.dates[i]);assert.equal(s.values[i],Math.round(1000000*p[t]/b.daily[0][t])/100);});
    assert.equal(s.values[0],10000);
  }
});

test("missing certificate, stale curves, nonpositive values and failed gates fail closed",async()=>{
  const cases=[
    f=>{f["/data/historical_comparison_20261003.json"].series[1].values[100]+=1;},
    f=>{f["/data/historical_comparison_20261003.json"].series[3].values[100]+=1;},
    f=>{f["/data/historical_comparison_20261003.json"].series[0].values[100]=0;},
    f=>{f["/data/historical_comparison_20261003.json"].series[0].values[100]=null;},
    f=>{f["/data/historical_comparison_20261003.json"].series[1].values[913]=27351.1;},
    f=>{f["/data/combined_research_20261003.json"].validation.risk_breaches=1;},
    f=>{f["/data/multiday_research_20261003.json"].validation.contract_continuity_verified=false;},
    f=>{f["/data/benchmark_research_20261003.json"].adjustment="none";},
    f=>{f["/data/multiday_research_20261003.json"].daily[1].date=f["/data/multiday_research_20261003.json"].daily[0].date;},
    f=>{f["/data/combined_research_20261003.json"].daily.splice(1,0,{date:"2023-01-05a",equity:10000});}
  ];
  for(const fn of cases){const out=await run(fn);assert.equal(out.charts.length,0);assert.ok(out.nodes.historicalComparisonStatus.textContent.includes("temporarily unavailable"));}
  for(const name of ["multiday","benchmark"]){const out=await run(()=>{},`/data/${name}_research_20261003.json`);assert.equal(out.charts.length,0);}
});
