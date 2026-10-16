"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),crypto=require("node:crypto");
const {text,read}=require("./research-fixture");
const research=require("../js/core-period-research.js");

function chartMock() {
  const charts=[];
  class Chart {constructor(canvas,config){Object.assign(this,config);this.canvas=canvas;this.updates=0;charts.push(this);}update(){this.updates++;}}
  return {Chart,charts};
}
function element(value="") {
  return {textContent:"",value,events:{},children:[],attributes:{},addEventListener(name,fn){this.events[name]=fn;},
    replaceChildren(...rows){this.children=rows;},append(...children){this.children.push(...children);},setAttribute(name,value){this.attributes[name]=value;}};
}
async function runPage({missing="",badHash=false,mutate=()=>{}}={}) {
  const payload=structuredClone(read("data/core_slippage_periods_20261015.json"));
  mutate(payload);
  const original=read("data/core_slippage_periods_20261015.json");
  const body=JSON.stringify(payload)===JSON.stringify(original)?text("data/core_slippage_periods_20261015.json"):JSON.stringify(payload);
  const digest=crypto.createHash("sha256").update(body).digest("hex");
  const ids=["coreBenchmarkStrategyReturn","coreBenchmarkCashReturn","coreBenchmarkExcessReturn","coreBenchmarkSPYReturn",
    "coreBenchmarkStatus","coreBenchmarkDescription","coreBenchmarkScale","coreBenchmarkScaleStatus","coreBenchmarkChart",
    "corePortfolioScale","corePortfolioScaleStatus","corePortfolioChart","corePortfolioStatus","corePortfolioDescription",
    "corePeriodSelector","coreSetupScenario","coreStudyPeriod","coreScenarioCTrades","coreScenarioCNetPnl",
    "coreScenarioCExpectancyCI","coreScenarioCEligibleSessions","coreScenarioCEndingEquity","coreScenarioCReturn",
    "coreSetupTableBody","coreYearlyTableBody","coreQuoteQualityBody","corePeriodLimitations","coreSlippageDataStatus"];
  const nodes=Object.fromEntries(ids.map(id=>[id,element(id==="corePeriodSelector"?"2024_2026":id==="coreSetupScenario"?"C":"linear")]));
  const {Chart,charts}=chartMock();
  const window={crypto:crypto.webcrypto,matchMedia:()=>({matches:false}),CorePeriodResearch:research,loadChartLibrary:async()=>Chart};
  const fetch=async url=>{
    const route=url.split("?")[0];
    const failed=route===missing;
    const bodyValue=route==="/data/core_slippage_periods_20261015.json"?body:
      route==="/data/core_slippage_periods_20261015.sha256"?(badHash?"0".repeat(64):digest):"";
    return {ok:!failed,text:async()=>bodyValue};
  };
  const document={getElementById:id=>nodes[id]||null,createElement:()=>element()};
  const context=vm.createContext({window,document,fetch,TextEncoder,Uint8Array,Intl,Date,Map,Set,Number,Math,Error,Promise});
  vm.runInContext(text("js/core-period-page.js"),context);
  await window.CorePeriodPage.initialize();
  return {nodes,charts,payload};
}

test("default 2024–2026 presentation is primary and metrics come from its fresh replay",async()=>{
  const {nodes,charts}=await runPage();
  assert.equal(charts.length,2);
  assert.match(nodes.coreStudyPeriod.textContent,/January 2024.*September 21, 2026/);
  assert.match(nodes.coreStudyPeriod.textContent,/681 eligible of 683 candidate sessions/);
  assert.equal(nodes.coreScenarioCTrades.textContent,"128");
  assert.equal(nodes.coreScenarioCNetPnl.textContent,"+$8,495.40");
  assert.equal(nodes.coreScenarioCEndingEquity.textContent,"$18,495.40");
  assert.equal(nodes.coreScenarioCReturn.textContent,"+84.9540%");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+84.9540%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+12.9320%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+72.0220 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+68.0681%");
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart);
  const portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  assert.equal(benchmark.data.labels[0],"2024-01-02");
  assert.equal(benchmark.data.labels.at(-1),"2026-09-21");
  assert.deepEqual(Array.from(benchmark.data.datasets,row=>row.label),["CORE Scenario C","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  assert.deepEqual(Array.from(portfolio.data.datasets,row=>row.label),["CORE Scenario C","CORE Scenario A","CORE Scenario B","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  const gap=benchmark.data.labels.indexOf("2026-08-26");
  assert.ok(gap>=0);
  assert.equal(portfolio.data.datasets[0].data[gap],null);
  assert.equal(portfolio.data.datasets[3].data[gap]>0,true);
  assert.match(nodes.corePortfolioDescription.textContent,/fresh \$10,000 seed before the first session/);
  assert.equal(nodes.coreSetupTableBody.children.length,6);
  assert.equal(nodes.coreYearlyTableBody.children.length,3);
  assert.equal(nodes.coreQuoteQualityBody.children.length,3);
  const primaryLimits=nodes.corePeriodLimitations.children.map(row=>row.textContent).join(" ");
  assert.match(primaryLimits,/681 eligible sessions of 683 candidate sessions/);
  assert.match(primaryLimits,/does not include zero/);
});

test("period switching replaces every period-specific display and preserves first-session P&L",async()=>{
  const {nodes,charts,payload}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart),portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  const primaryLimits=nodes.corePeriodLimitations.children.map(row=>row.textContent).join(" ");
  nodes.corePeriodSelector.value="2025_2026";nodes.corePeriodSelector.events.change();
  assert.match(nodes.coreStudyPeriod.textContent,/January 2025/);
  assert.equal(nodes.coreScenarioCTrades.textContent,"92");
  assert.equal(nodes.coreScenarioCNetPnl.textContent,"+$7,180.60");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+71.8060%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+7.1808%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+64.6252 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+34.5779%");
  assert.equal(benchmark.data.labels[0],"2025-01-02");
  assert.equal(portfolio.data.datasets[0].data[0],10164.4);
  assert.match(nodes.coreBenchmarkDescription.textContent,/December 31, 2024/);
  assert.equal(nodes.coreYearlyTableBody.children.length,2);
  assert.equal(nodes.coreQuoteQualityBody.children.length,2);
  const recentLimits=nodes.corePeriodLimitations.children.map(row=>row.textContent).join(" ");
  assert.match(recentLimits,/429 eligible sessions of 431 candidate sessions/);
  assert.match(recentLimits,/includes zero/);
  assert.notEqual(recentLimits,primaryLimits);
  nodes.coreSetupScenario.value="A";nodes.coreSetupScenario.events.change();
  assert.equal(nodes.coreSetupTableBody.children.length,6);
  const expectedSetup=research.periodView(payload,"2025_2026","A").setups[0];
  assert.equal(nodes.coreSetupTableBody.children[0].children[1].textContent,String(expectedSetup.trades));
  assert.equal(nodes.coreSetupTableBody.children[0].children[4].textContent,
    (expectedSetup.net_pnl>0?"+":"")+"$"+Math.abs(expectedSetup.net_pnl).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
  nodes.corePeriodSelector.value="2023_2026";nodes.corePeriodSelector.events.change();
  assert.match(nodes.coreStudyPeriod.textContent,/January 2023/);
  assert.equal(nodes.coreScenarioCTrades.textContent,"159");
  assert.equal(nodes.coreScenarioCNetPnl.textContent,"+$4,568.40");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+45.6840%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"—");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"—");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"—");
  assert.match(nodes.coreBenchmarkDescription.textContent,/no pre-session close.*unavailable/);
  assert.equal(benchmark.data.labels[0],"2023-01-04");
  assert.deepEqual(Array.from(benchmark.data.datasets,row=>row.label),["CORE Scenario C"]);
  assert.deepEqual(Array.from(portfolio.data.datasets,row=>row.label),["CORE Scenario C","CORE Scenario A","CORE Scenario B"]);
  assert.match(nodes.coreBenchmarkChart.attributes["aria-label"],/CORE Scenario C cumulative closed-trade return/);
  assert.doesNotMatch(nodes.coreBenchmarkChart.attributes["aria-label"],/compared with cash and adjusted SPY/i);
  assert.match(nodes.coreBenchmarkChart.attributes["aria-label"],/benchmarks are unavailable/i);
  assert.equal(portfolio.data.datasets[0].data.at(-1),14568.4);
  assert.equal(nodes.coreYearlyTableBody.children.length,4);
  assert.equal(nodes.coreQuoteQualityBody.children.length,4);
  for(const gapDate of ["2023-06-05","2023-10-19","2026-08-26"]) {
    const index=benchmark.data.labels.indexOf(gapDate);assert.ok(index>=0);assert.equal(portfolio.data.datasets[0].data[index],null);
  }
});

test("chart scale changes preserve selected observations",async()=>{
  const {nodes,charts}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart),portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  const before=JSON.stringify(portfolio.data.datasets);
  nodes.coreBenchmarkScale.value="logarithmic";nodes.coreBenchmarkScale.events.change();
  nodes.corePortfolioScale.value="logarithmic";nodes.corePortfolioScale.events.change();
  assert.equal(benchmark.options.scales.y.type,"logarithmic");
  assert.equal(portfolio.options.scales.y.type,"logarithmic");
  assert.equal(JSON.stringify(portfolio.data.datasets),before);
});

test("hash failures and internally inconsistent period data fail closed",async()=>{
  const wrongHash=await runPage({badHash:true});
  assert.equal(wrongHash.charts.length,0);
  assert.match(wrongHash.nodes.coreBenchmarkStatus.textContent,/temporarily unavailable/i);
  const badPeriod=await runPage({mutate:data=>{data.periods[0].scenarios[0].net_pnl+=1;}});
  assert.equal(badPeriod.charts.length,0);
  assert.match(badPeriod.nodes.corePortfolioStatus.textContent,/temporarily unavailable/i);
});

test("old combined CORE+EX figures remain only in the collapsed archive",()=>{
  const page=text("algo-pnl.html"),archive=page.match(/<details[^>]*id="archivedCombinedResearch"[^>]*>([\s\S]*?)<\/details>/);
  assert.ok(archive);
  assert.doesNotMatch(archive[0],/<details[^>]*id="archivedCombinedResearch"[^>]*open/i);
  assert.match(archive[1],/\+924\.14%/);
  assert.doesNotMatch(page.slice(0,archive.index),/\+924\.14%|Backtest Strategy Return|Foxchase Combined/);
  assert.match(page,/core-period-page\.js/);
  assert.doesNotMatch(page,/loadCoreSlippageStudy/);
});

test("archived EX and combined research still loads only when opened",()=>{
  const page=text("algo-pnl.html"),begin=page.indexOf("    const archivedCombinedResearch = document.getElementById("),
    end=page.indexOf("    CorePeriodPage.initialize();",begin);
  assert.ok(begin>=0&&end>begin);
  let toggle,archiveLoads=0,comparisonLoads=0;
  const archive={open:false,addEventListener(name,callback){assert.equal(name,"toggle");toggle=callback;}};
  const context=vm.createContext({document:{getElementById:id=>id==="archivedCombinedResearch"?archive:null},
    FoxchaseResearchIntegrity:{loadStudy(){archiveLoads++;}},fetch:()=>{},loadHistoricalComparison(){comparisonLoads++;},CorePeriodPage:{initialize(){}}});
  vm.runInContext(page.slice(begin,end),context);
  assert.equal(archiveLoads,0);assert.equal(comparisonLoads,0);
  archive.open=true;toggle();assert.equal(archiveLoads,1);assert.equal(comparisonLoads,1);
  toggle();assert.equal(archiveLoads,1);assert.equal(comparisonLoads,1);
});
