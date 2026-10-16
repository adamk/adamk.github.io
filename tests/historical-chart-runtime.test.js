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
  const file="data/core_alpaca_fee_periods_20261016.json";
  const payload=structuredClone(read(file));mutate(payload);
  const original=read(file),body=JSON.stringify(payload)===JSON.stringify(original)?text(file):JSON.stringify(payload);
  const digest=crypto.createHash("sha256").update(body).digest("hex");
  const ids=["coreBenchmarkStrategyReturn","coreBenchmarkScenarioName","coreBenchmarkCashReturn","coreBenchmarkExcessReturn",
    "coreBenchmarkSPYReturn","coreBenchmarkStatus","coreBenchmarkDescription","coreBenchmarkScale","coreBenchmarkScaleStatus",
    "coreBenchmarkScenario","coreBenchmarkChart","corePortfolioScale","corePortfolioScaleStatus","corePortfolioChart",
    "corePortfolioStatus","corePortfolioDescription","corePeriodSelector","coreSetupScenario","coreStudyPeriod",
    "coreScenarioBTrades","coreScenarioBNetPnl","coreScenarioBExpectancyCI","coreScenarioBEligibleSessions",
    "coreScenarioBEndingEquity","coreScenarioBReturn","coreScenarioCTrades","coreScenarioCNetPnl",
    "coreScenarioCExpectancyCI","coreScenarioCEligibleSessions","coreScenarioCEndingEquity","coreScenarioCReturn",
    "coreSetupTableBody","coreYearlyTableBody","coreQuoteQualityBody","corePeriodLimitations","coreSlippageDataStatus"];
  const nodes=Object.fromEntries(ids.map(id=>[id,element(id==="corePeriodSelector"?"2024_2026":
    id==="coreSetupScenario"||id==="coreBenchmarkScenario"?"B":"linear")]));
  const {Chart,charts}=chartMock();
  const window={crypto:crypto.webcrypto,matchMedia:()=>({matches:false}),CorePeriodResearch:research,loadChartLibrary:async()=>Chart};
  const fetch=async url=>{
    const route=url.split("?")[0],failed=route===missing;
    const responseBody=route==="/data/core_alpaca_fee_periods_20261016.json"?body:
      route==="/data/core_alpaca_fee_periods_20261016.sha256"?(badHash?"0".repeat(64):digest):"";
    return {ok:!failed,text:async()=>responseBody};
  };
  const document={getElementById:id=>nodes[id]||null,createElement:()=>element()};
  const context=vm.createContext({window,document,fetch,TextEncoder,Uint8Array,Intl,Date,Map,Set,Number,Math,Error,Promise});
  vm.runInContext(text("js/core-period-page.js"),context);
  await window.CorePeriodPage.initialize();
  return {nodes,charts,payload};
}

test("default 2024–2026 presentation highlights Scenario B and reconciles its replay",async()=>{
  const {nodes,charts}=await runPage();
  assert.equal(charts.length,2);
  assert.match(nodes.coreStudyPeriod.textContent,/January 2024.*September 21, 2026/);
  assert.match(nodes.coreStudyPeriod.textContent,/679 eligible of 683 candidate sessions/);
  assert.equal(nodes.coreScenarioBTrades.textContent,"133");
  assert.equal(nodes.coreScenarioBNetPnl.textContent,"+$23,451.07");
  assert.equal(nodes.coreScenarioBEndingEquity.textContent,"$33,451.07");
  assert.equal(nodes.coreScenarioBReturn.textContent,"+234.5107%");
  assert.equal(nodes.coreScenarioCNetPnl.textContent,"+$12,539.79");
  assert.equal(nodes.coreBenchmarkScenarioName.textContent,"Foxchase CORE — Scenario B");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+234.5107%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+12.9320%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+221.5787 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+68.0681%");
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart);
  const portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  assert.equal(benchmark.data.labels[0],"2024-01-02");
  assert.equal(benchmark.data.labels.at(-1),"2026-09-21");
  assert.deepEqual(Array.from(benchmark.data.datasets,row=>row.label),["CORE Scenario B","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  assert.deepEqual(Array.from(portfolio.data.datasets,row=>row.label),["CORE Scenario B","CORE Scenario A","CORE Scenario C","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  const gap=benchmark.data.labels.indexOf("2026-08-26");
  assert.ok(gap>=0);
  assert.equal(portfolio.data.datasets[0].data[gap],null);
  assert.equal(portfolio.data.datasets[2].data[gap],null);
  assert.match(nodes.corePortfolioDescription.textContent,/fresh \$10,000 seed before the first session/);
  assert.equal(nodes.coreSetupTableBody.children.length,6);
  assert.equal(nodes.coreYearlyTableBody.children.length,3);
  assert.equal(nodes.coreQuoteQualityBody.children.length,3);
});

test("period switching updates B metrics, tables and curves without stale values",async()=>{
  const {nodes,charts,payload}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart),portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  nodes.corePeriodSelector.value="2025_2026";nodes.corePeriodSelector.events.change();
  assert.match(nodes.coreStudyPeriod.textContent,/January 2025/);
  assert.equal(nodes.coreScenarioBTrades.textContent,"96");
  assert.equal(nodes.coreScenarioBNetPnl.textContent,"+$17,824.69");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+178.2469%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+7.1808%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+171.0661 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+34.5779%");
  assert.equal(benchmark.data.labels[0],"2025-01-02");
  assert.equal(portfolio.data.datasets[0].data[0],10178.74);
  assert.equal(nodes.coreYearlyTableBody.children.length,2);
  assert.equal(nodes.coreQuoteQualityBody.children.length,2);
  nodes.coreSetupScenario.value="A";nodes.coreSetupScenario.events.change();
  const expectedSetup=research.periodView(payload,"2025_2026","A","B").setups[0];
  assert.equal(nodes.coreSetupTableBody.children[0].children[1].textContent,String(expectedSetup.trades));
  assert.equal(nodes.coreSetupTableBody.children[0].children[4].textContent,
    "+$"+Math.abs(expectedSetup.net_pnl).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
  nodes.corePeriodSelector.value="2023_2026";nodes.corePeriodSelector.events.change();
  assert.match(nodes.coreStudyPeriod.textContent,/January 2023/);
  assert.equal(nodes.coreScenarioBTrades.textContent,"168");
  assert.equal(nodes.coreScenarioBNetPnl.textContent,"+$19,762.17");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+197.6217%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"—");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"—");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"—");
  assert.equal(benchmark.data.labels[0],"2023-01-04");
  assert.deepEqual(Array.from(benchmark.data.datasets,row=>row.label),["CORE Scenario B"]);
  assert.deepEqual(Array.from(portfolio.data.datasets,row=>row.label),["CORE Scenario B","CORE Scenario A","CORE Scenario C"]);
  assert.match(nodes.coreBenchmarkChart.attributes["aria-label"],/CORE Scenario B cumulative closed-trade return/);
  assert.match(nodes.coreBenchmarkChart.attributes["aria-label"],/benchmarks are unavailable/i);
  assert.equal(portfolio.data.datasets[0].data.at(-1),29762.17);
  assert.equal(nodes.coreYearlyTableBody.children.length,4);
  assert.equal(nodes.coreQuoteQualityBody.children.length,4);
  for(const date of ["2023-06-05","2023-10-19","2026-08-26"]) {
    const index=benchmark.data.labels.indexOf(date);assert.ok(index>=0);assert.equal(portfolio.data.datasets[0].data[index],null);
  }
});

test("benchmark selector updates the scenario label, return and selected curve",async()=>{
  const {nodes,charts}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.coreBenchmarkChart);
  nodes.coreBenchmarkScenario.value="A";nodes.coreBenchmarkScenario.events.change();
  assert.equal(nodes.coreBenchmarkScenarioName.textContent,"Foxchase CORE — Scenario A");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+291.9886%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+279.0566 pp");
  assert.equal(benchmark.data.datasets[0].label,"CORE Scenario A");
  nodes.coreBenchmarkScenario.value="C";nodes.coreBenchmarkScenario.events.change();
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+125.3979%");
  assert.equal(benchmark.data.datasets[0].label,"CORE Scenario C");
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

test("hash failures and internally inconsistent fee data fail closed",async()=>{
  const wrongHash=await runPage({badHash:true});
  assert.equal(wrongHash.charts.length,0);
  assert.match(wrongHash.nodes.coreBenchmarkStatus.textContent,/temporarily unavailable/i);
  const badPeriod=await runPage({mutate:data=>{data.periods[0].scenarios[0].net_pnl+=1;}});
  assert.equal(badPeriod.charts.length,0);
  assert.match(badPeriod.nodes.corePortfolioStatus.textContent,/temporarily unavailable/i);
});

test("public page removes the archive loader and retains standalone EX research",()=>{
  const page=text("algo-pnl.html");
  assert.doesNotMatch(page,/Archived Research|archivedCombinedResearch|\+924\.14%|loadHistoricalComparison/);
  assert.match(page,/id="selectedExResearch"/);
  assert.match(page,/selected-ex-research\.js/);
  assert.match(page,/CorePeriodPage\.initialize\(\)/);
});
