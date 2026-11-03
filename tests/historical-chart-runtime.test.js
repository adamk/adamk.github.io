"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),crypto=require("node:crypto");
const {text,read}=require("./research-fixture");
const research=require("../js/core-period-research.js");
const NATURAL="natural_nbbo",SLIPPAGE="natural_nbbo_plus_slippage";

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
  const ids=["coreBenchmarkStrategyReturn","coreBenchmarkComparisonName","coreBenchmarkCashReturn","coreBenchmarkExcessReturn",
    "coreBenchmarkSPYReturn","coreBenchmarkStatus","coreBenchmarkDescription","coreBenchmarkScale","coreBenchmarkScaleStatus",
    "coreBenchmarkSelection","corePerformanceDisplay","coreDrawdownChart","coreDrawdownStatus","corePortfolioScale","corePortfolioScaleStatus","corePortfolioChart",
    "corePortfolioStatus","corePortfolioDescription","corePeriodSelector","coreSetupComparison","coreStudyPeriod",
    "coreComparisonNaturalTrades","coreComparisonNaturalNetPnl","coreComparisonNaturalExpectancyCI",
    "coreComparisonNaturalEligibleSessions","coreComparisonNaturalEndingEquity","coreComparisonNaturalReturn",
    "coreComparisonSlippageTrades","coreComparisonSlippageNetPnl","coreComparisonSlippageExpectancyCI",
    "coreComparisonSlippageEligibleSessions","coreComparisonSlippageEndingEquity","coreComparisonSlippageReturn",
    "coreStudySlippageInterval","coreSetupTableBody","coreYearlyTableBody","coreQuoteQualityBody",
    "corePeriodLimitations","coreSlippageDataStatus"];
  const nodes=Object.fromEntries(ids.map(id=>[id,element(id==="corePeriodSelector"?"2024_2026":
    id==="coreSetupComparison"||id==="coreBenchmarkSelection"?SLIPPAGE:id==="corePerformanceDisplay"?"index":"linear")]));
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

test("default 2024–2026 display highlights fixed-trade slippage with exactly two CORE curves",async()=>{
  const {nodes,charts}=await runPage();
  assert.equal(charts.length,2);
  assert.match(nodes.coreStudyPeriod.textContent,/January 2024.*September 21, 2026/);
  assert.match(nodes.coreStudyPeriod.textContent,/679 eligible of 683 candidate sessions/);
  assert.equal(nodes.coreComparisonNaturalTrades.textContent,"133");
  assert.equal(nodes.coreComparisonNaturalNetPnl.textContent,"+$29,198.86");
  assert.equal(nodes.coreComparisonSlippageTrades.textContent,"133");
  assert.equal(nodes.coreComparisonSlippageNetPnl.textContent,"+$23,451.07");
  assert.equal(nodes.coreComparisonSlippageEndingEquity.textContent,"$33,451.07");
  assert.equal(nodes.coreComparisonSlippageReturn.textContent,"+234.5107%");
  assert.equal(nodes.coreBenchmarkComparisonName.textContent,"CORE — Natural NBBO + $0.01 Slippage");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+234.5107%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+12.9320%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+221.5787 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+68.0681%");
  const benchmark=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  const portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  assert.equal(benchmark.data.labels[0],"2024-01-02");
  assert.equal(benchmark.data.labels.at(-1),"2026-09-21");
  assert.deepEqual(Array.from(benchmark.data.datasets,row=>row.label),["CORE — Natural NBBO","CORE — Natural NBBO + $0.01 Slippage","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  assert.deepEqual(Array.from(portfolio.data.datasets,row=>row.label),["CORE — Natural NBBO","CORE — Natural NBBO + $0.01 Slippage","Risk-Free / Cash","SPY Buy & Hold (adjusted)"]);
  const gap=benchmark.data.labels.indexOf("2026-08-26");
  assert.ok(gap>=0);
  assert.equal(portfolio.data.datasets[0].data[gap],null);
  assert.equal(portfolio.data.datasets[1].data[gap],null);
  assert.match(nodes.corePortfolioDescription.textContent,/fresh \$10,000 seed before the first session/);
  assert.equal(nodes.coreSetupTableBody.children.length,6);
  assert.equal(nodes.coreYearlyTableBody.children.length,3);
  assert.equal(nodes.coreQuoteQualityBody.children.length,3);
});

test("period switching updates both comparisons, benchmark, tables and curves",async()=>{
  const {nodes,charts,payload}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.corePortfolioChart),portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  nodes.corePeriodSelector.value="2025_2026";nodes.corePeriodSelector.events.change();
  assert.match(nodes.coreStudyPeriod.textContent,/January 2025/);
  assert.equal(nodes.coreComparisonNaturalTrades.textContent,"96");
  assert.equal(nodes.coreComparisonSlippageNetPnl.textContent,"+$17,824.69");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+178.2469%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"+7.1808%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+171.0661 pp");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"+34.5779%");
  assert.equal(benchmark.data.labels[0],"2025-01-02");
  assert.equal(portfolio.data.datasets[1].data[0],101.7874);
  assert.equal(nodes.coreYearlyTableBody.children.length,2);
  assert.equal(nodes.coreQuoteQualityBody.children.length,2);
  nodes.coreSetupComparison.value=NATURAL;nodes.coreSetupComparison.events.change();
  const expectedSetup=research.periodView(payload,"2025_2026",NATURAL,SLIPPAGE).setups[0];
  assert.equal(nodes.coreSetupTableBody.children[0].children[1].textContent,String(expectedSetup.trades));
  nodes.corePeriodSelector.value="2023_2026";nodes.corePeriodSelector.events.change();
  assert.match(nodes.coreStudyPeriod.textContent,/January 2023/);
  assert.equal(nodes.coreComparisonSlippageTrades.textContent,"168");
  assert.equal(nodes.coreComparisonSlippageNetPnl.textContent,"+$19,762.17");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+197.6217%");
  assert.equal(nodes.coreBenchmarkCashReturn.textContent,"—");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"—");
  assert.equal(nodes.coreBenchmarkSPYReturn.textContent,"—");
  assert.equal(benchmark.data.labels[0],"2023-01-04");
  assert.deepEqual(Array.from(benchmark.data.datasets,row=>row.label),["CORE — Natural NBBO","CORE — Natural NBBO + $0.01 Slippage"]);
  assert.deepEqual(Array.from(portfolio.data.datasets,row=>row.label),["CORE — Natural NBBO","CORE — Natural NBBO + $0.01 Slippage"]);
  assert.match(nodes.corePortfolioChart.attributes["aria-label"],/Natural NBBO plus \$0\.01 Slippage/);
  assert.match(nodes.corePortfolioChart.attributes["aria-label"],/benchmarks are unavailable/i);
  assert.equal(portfolio.data.datasets[1].data.at(-1),297.6217);
  assert.equal(nodes.coreYearlyTableBody.children.length,4);
  assert.equal(nodes.coreQuoteQualityBody.children.length,4);
  for(const date of ["2023-06-05","2023-10-19","2026-08-26"]) {
    const index=benchmark.data.labels.indexOf(date);assert.ok(index>=0);assert.equal(portfolio.data.datasets[1].data[index],null);
  }
});

test("benchmark metric selector updates metrics while keeping both performance curves",async()=>{
  const {nodes,charts}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  nodes.coreBenchmarkSelection.value=NATURAL;nodes.coreBenchmarkSelection.events.change();
  assert.equal(nodes.coreBenchmarkComparisonName.textContent,"CORE — Natural NBBO");
  assert.equal(nodes.coreBenchmarkStrategyReturn.textContent,"+291.9886%");
  assert.equal(nodes.coreBenchmarkExcessReturn.textContent,"+279.0566 pp");
  assert.equal(benchmark.data.datasets[0].label,"CORE — Natural NBBO");
});

test("chart scale changes preserve selected observations",async()=>{
  const {nodes,charts}=await runPage();
  const benchmark=charts.find(chart=>chart.canvas===nodes.corePortfolioChart),portfolio=charts.find(chart=>chart.canvas===nodes.corePortfolioChart);
  const before=JSON.stringify(portfolio.data.datasets);

  nodes.corePortfolioScale.value="logarithmic";nodes.corePortfolioScale.events.change();
  assert.equal(benchmark.options.scales.y.type,"logarithmic");
  assert.equal(portfolio.options.scales.y.type,"logarithmic");
  assert.equal(JSON.stringify(portfolio.data.datasets),before);
});

test("hash failures and internally inconsistent fee data fail closed",async()=>{
  const wrongHash=await runPage({badHash:true});
  assert.equal(wrongHash.charts.length,0);
  assert.match(wrongHash.nodes.coreBenchmarkStatus.textContent,/temporarily unavailable/i);
  const badPeriod=await runPage({mutate:data=>{data.periods[0].comparisons[0].net_pnl+=1;}});
  assert.equal(badPeriod.charts.length,0);
  assert.match(badPeriod.nodes.corePortfolioStatus.textContent,/temporarily unavailable/i);
});

test("public page omits third-comparison/archive and EX presentation",()=>{
  const page=text("algo-pnl.html"),json=text("data/core_alpaca_fee_periods_20261016.json");
  assert.equal((page.match(/id="coreComparison(?:Natural|Slippage)"/g)||[]).length,2);
  assert.doesNotMatch(page,/id="coreComparisonC|coreScenario/);
  assert.doesNotMatch(page,/Archived Research|archivedCombinedResearch|\+924\.14%|loadHistoricalComparison|Scenario [ABC]/);
  assert.doesNotMatch(page,/scenario_[abc]|Scenario [ABC]/i);
  assert.doesNotMatch(json,/scenario_[abc]|Scenario [ABC]|full[_ -]live[_ -]sequence/i);
  assert.match(page,/Natural NBBO \+ \$0\.01 Slippage/);
  assert.doesNotMatch(page,/selectedExResearch|Selected EX research|selected-ex-research\.js|selected-ex-section|selectedEx[A-Z]/);
  assert.match(page,/Live Performance Reporting Paused/);
  assert.match(page,/R5VWAPB is excluded from this hypothetical CORE study but remains enabled in production/);
  assert.match(page,/CorePeriodPage\.initialize\(\)/);
});

test("all periods preserve equity, index parity, metrics and independent causal drawdowns",async()=>{
  const {nodes,charts,payload}=await runPage();
  const performance=charts.find(row=>row.canvas===nodes.corePortfolioChart);
  const drawdown=charts.find(row=>row.canvas===nodes.coreDrawdownChart);
  const retained=JSON.stringify(payload);
  for(const period of payload.periods) {
    nodes.corePeriodSelector.value=period.id;nodes.corePeriodSelector.events.change();
    const view=research.periodView(payload,period.id);
    for(const display of ["equity","index"]) {
      nodes.corePerformanceDisplay.value=display;nodes.corePerformanceDisplay.events.change();
      const expected=research.performanceDatasets(view,display);
      assert.deepEqual(JSON.parse(JSON.stringify(performance.data.datasets.map(({label,data})=>({label,data})))),expected);
      for(let j=0;j<2;j++) {
        let peak=10000;
        const source=period.equity_curves[j?SLIPPAGE:NATURAL];
        source.forEach((value,i)=>{
          const actual=drawdown.data.datasets[j].data[i];
          if(value===null) {assert.equal(actual,null);assert.equal(performance.data.datasets[j].data[i],null);return;}
          peak=Math.max(peak,value);
          assert.ok(Math.abs(actual-100*(value-peak)/peak)<1e-12);
          assert.ok(actual<=0);
          assert.equal(performance.data.datasets[j].data[i],display==="equity"?value:100*value/10000);
        });
      }
      for(const scale of ["logarithmic","linear"]) {
        const before=JSON.stringify(performance.data.datasets);
        nodes.corePortfolioScale.value=scale;nodes.corePortfolioScale.events.change();
        assert.equal(performance.options.scales.y.type,scale);
        assert.equal(drawdown.options.scales.y.type,"linear");
        assert.equal(JSON.stringify(performance.data.datasets),before);
      }
    }
    assert.equal(performance.data.labels.at(-1),"2026-09-21");
    assert.ok(!performance.data.labels.includes("2026-09-22"));
  }
  assert.equal(JSON.stringify(payload),retained);
});

test("drawdown includes initial loss, carries peak through gaps, and ignores future equity",()=>{
  const actual=research.closedTradeDrawdown([9000,null,10000,12500,null,10000,15000],10000);
  const expected=[-10,null,0,0,null,-20,0];
  actual.forEach((value,i)=>expected[i]===null?assert.equal(value,null):assert.ok(Math.abs(value-expected[i])<1e-12));
  const prefix=[9000,null,11000,9900];
  assert.deepEqual(research.closedTradeDrawdown(prefix,10000),research.closedTradeDrawdown([...prefix,100000],10000).slice(0,prefix.length));
  assert.throws(()=>research.closedTradeDrawdown([NaN],10000));
});

test("page has one performance display/scale and separate drawdown without duplicated benchmark canvas",()=>{
  const page=text("algo-pnl.html");
  assert.match(page,/>Historical CORE Performance</);
  assert.match(page,/>Historical CORE Drawdown</);
  assert.doesNotMatch(page,/id="coreBenchmark(?:Chart|Scale)"|Historical CORE equity curves/);
  assert.equal((page.match(/id="corePerformanceDisplay"/g)||[]).length,1);
  assert.equal((page.match(/id="corePortfolioScale"/g)||[]).length,1);
});

test("tooltips distinguish index, modeled equity and negative closed-trade drawdown",async()=>{
  const {nodes,charts}=await runPage();
  const performance=charts.find(row=>row.canvas===nodes.corePortfolioChart);
  const drawdown=charts.find(row=>row.canvas===nodes.coreDrawdownChart);
  const item={dataset:{label:"CORE — Natural NBBO"},parsed:{y:10000}};
  assert.match(performance.options.plugins.tooltip.callbacks.label(item),/10000.0000 index points/);
  nodes.corePerformanceDisplay.value="equity";nodes.corePerformanceDisplay.events.change();
  assert.match(performance.options.plugins.tooltip.callbacks.label(item),/\$10,000.00/);
  item.parsed.y=-5;
  assert.match(drawdown.options.plugins.tooltip.callbacks.label(item),/closed-trade drawdown: -5.00%/);
  item.parsed.y=null;
  assert.match(drawdown.options.plugins.tooltip.callbacks.label(item),/not evaluable/);
  assert.equal(drawdown.data.datasets.every(row=>row.spanGaps===false),true);
});
