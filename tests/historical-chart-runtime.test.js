"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {text,read}=require("./research-fixture");

function chartMock() {
  const charts=[];
  class Chart {constructor(canvas,config){Object.assign(this,config);this.canvas=canvas;this.updates=0;charts.push(this);}update(){this.updates++;}}
  return {Chart,charts};
}
function element(value="") {
  return {textContent:"",value,events:{},addEventListener(name,fn){this.events[name]=fn;}};
}
async function runPrimary(mutate=()=>{},missing="") {
  const files={
    "/data/core_slippage_equity_curves_20261015.json":read("data/core_slippage_equity_curves_20261015.json"),
    "/data/core_slippage_replay_20261015.json":read("data/core_slippage_replay_20261015.json"),
    "/data/benchmark_research_20261003.json":read("data/benchmark_research_20261003.json"),
    "/data/historical-cash-benchmark.json":read("data/historical-cash-benchmark.json")
  };
  mutate(files);
  const ids=["coreBenchmarkStrategyReturn","coreBenchmarkCashReturn","coreBenchmarkExcessReturn","coreBenchmarkSPYReturn",
    "coreBenchmarkStatus","coreBenchmarkScale","coreBenchmarkScaleStatus","coreBenchmarkChart",
    "corePortfolioScale","corePortfolioScaleStatus","corePortfolioChart","corePortfolioStatus"];
  const nodes=Object.fromEntries(ids.map(id=>[id,element(id.includes("Scale")?"linear":"")]));
  const {Chart,charts}=chartMock();
  const page=text("algo-pnl.html"),begin=page.indexOf("    function loadCorePrimaryComparison() {"),end=page.indexOf("    function loadHistoricalComparison() {",begin);
  assert.ok(begin>=0&&end>begin,"primary comparison loader is present");
  const context=vm.createContext({Chart,Intl,Date,Map,Set,Number,Math,Error,Promise,
    FoxchaseBenchmarks:require("../js/live-benchmarks.js"),
    setTextIfExists:(id,value)=>{if(nodes[id])nodes[id].textContent=value;},
    formatBenchmarkPercent:value=>(value>0?"+":"")+value.toFixed(4)+"%",
    formatBenchmarkPoints:value=>(value>0?"+":"")+value.toFixed(4)+" pp",
    window:{matchMedia:()=>({matches:false})},loadChartLibrary:async()=>Chart,
    document:{getElementById:id=>nodes[id]},
    fetch:async url=>({ok:url.split("?")[0]!==missing,json:async()=>files[url.split("?")[0]]})});
  vm.runInContext(page.slice(begin,end)+"\nloadCorePrimaryComparison();",context);
  await new Promise(resolve=>setImmediate(resolve));
  return {files,nodes,charts};
}

test("primary CORE benchmark displays common-end returns and both verified daily curves",async()=>{
  const {files,nodes,charts}=await runPrimary();
  assert.equal(charts.length,2);
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+45.6840%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+18.9468%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+26.7372 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+111.3272%");
  assert.match(nodes.coreBenchmarkStatus.textContent,/comparison endpoint: 2026-09-21/i);
  assert.match(nodes.coreBenchmarkStatus.textContent,/September 22.*excluded/i);
  assert.match(nodes.corePortfolioStatus.textContent,/closed-trade.*not interpolated or marked to market/i);
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart);
  const portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  assert.deepEqual(benchmark.data.datasets.map(row=>row.label),["CORE Scenario C","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  assert.deepEqual(portfolio.data.datasets.map(row=>row.label),["CORE Scenario C","CORE Scenario A","CORE Scenario B","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  assert.deepEqual(benchmark.data.labels,files["/data/core_slippage_equity_curves_20261015.json"].dates);
  assert.equal(benchmark.data.labels.length,931);
  assert.equal(benchmark.data.labels[0],"2023-01-04");
  assert.equal(benchmark.data.labels.at(-1),"2026-09-21");
  const source=files["/data/core_slippage_equity_curves_20261015.json"];
  for(const gap of source.gap_dates) {
    const index=benchmark.data.labels.indexOf(gap);
    assert.ok(index>=0);
    assert.equal(portfolio.data.datasets[0].data[index],null);
    assert.equal(benchmark.data.datasets[0].data[index],null);
  }
  assert.equal(portfolio.data.datasets[0].data.at(-1),14568.4);
  assert.equal(portfolio.data.datasets[1].data.at(-1),27564.2);
  assert.equal(portfolio.data.datasets[2].data.at(-1),22492.2);
  assert.ok(portfolio.data.datasets.every(dataset=>dataset.data[0]===10000));
});

test("primary chart scales remain switchable without changing observations",async()=>{
  const {nodes,charts}=await runPrimary();
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart);
  const portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  const benchmarkBefore=JSON.stringify(benchmark.data.datasets),portfolioBefore=JSON.stringify(portfolio.data.datasets);
  nodes.coreBenchmarkScale.value="logarithmic";nodes.coreBenchmarkScale.events.change();
  nodes.corePortfolioScale.value="logarithmic";nodes.corePortfolioScale.events.change();
  assert.equal(benchmark.options.scales.y.type,"logarithmic");
  assert.equal(portfolio.options.scales.y.type,"logarithmic");
  assert.equal(JSON.stringify(benchmark.data.datasets),benchmarkBefore);
  assert.equal(JSON.stringify(portfolio.data.datasets),portfolioBefore);
  assert.match(nodes.corePortfolioScaleStatus.textContent,/percentage changes/i);
});

test("missing or inconsistent primary evidence fails closed",async()=>{
  const missing=await runPrimary(()=>{},"/data/historical-cash-benchmark.json");
  assert.equal(missing.charts.length,0);
  assert.match(missing.nodes.coreBenchmarkStatus.textContent,/temporarily unavailable/i);
  for(const mutate of [
    files=>{files["/data/core_slippage_equity_curves_20261015.json"].scenarios[0].daily[20].equity=null;},
    files=>{files["/data/benchmark_research_20261003.json"].daily[100].date="2023-06-05";},
    files=>{files["/data/historical-cash-benchmark.json"].source_end="2026-09-21";},
    files=>{files["/data/core_slippage_replay_20261015.json"].independent_verification="FAIL";}
  ]) {
    const out=await runPrimary(mutate);
    assert.equal(out.charts.length,0);
    assert.match(out.nodes.coreBenchmarkStatus.textContent,/temporarily unavailable/i);
  }
});

test("old combined comparison is only in the closed archived research disclosure",()=>{
  const page=text("algo-pnl.html"),archive=page.match(/<details[^>]*id="archivedCombinedResearch"[^>]*>([\s\S]*?)<\/details>/);
  assert.ok(archive,"archived combined research disclosure exists");
  assert.doesNotMatch(archive[0],/<details[^>]*id="archivedCombinedResearch"[^>]*open/i);
  assert.match(archive[1],/\+924\.14%|Backtest Strategy Return/);
  assert.match(page,/CORE Scenario C/);
  assert.match(page,/loadHistoricalComparison\(\)/);
  assert.match(page,/archivedCombinedResearch.*toggle|addEventListener\("toggle"/s);
  assert.doesNotMatch(page.slice(0,archive.index),/\+924\.14%/);
});

test("archived EX and combined research loads only after its disclosure is opened",()=>{
  const page=text("algo-pnl.html"),begin=page.indexOf("    const archivedCombinedResearch = document.getElementById("),
    end=page.indexOf("    loadCorePrimaryComparison();",begin);
  assert.ok(begin>=0&&end>begin);
  let toggle,archiveLoads=0,comparisonLoads=0;
  const archive={open:false,addEventListener(name,callback){assert.equal(name,"toggle");toggle=callback;}};
  const context=vm.createContext({
    document:{getElementById:id=>id==="archivedCombinedResearch"?archive:null},
    FoxchaseResearchIntegrity:{loadStudy(){archiveLoads++;}},
    fetch:()=>{},
    loadHistoricalComparison(){comparisonLoads++;}
  });
  vm.runInContext(page.slice(begin,end),context);
  assert.equal(archiveLoads,0);
  assert.equal(comparisonLoads,0);
  archive.open=true;toggle();
  assert.equal(archiveLoads,1);
  assert.equal(comparisonLoads,1);
  toggle();
  assert.equal(archiveLoads,1);
  assert.equal(comparisonLoads,1);
});
