"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {read,text}=require("./research-fixture");

test("obsolete combined CORE+EX archive is absent from public page and runtime",()=>{
  const page=text("algo-pnl.html");
  assert.doesNotMatch(page,/Archived Research|archivedCombinedResearch|\+924\.14%|Foxchase Combined|Multi-Day/);
  assert.doesNotMatch(page,/historical_comparison_20261013|combined_research_20261003|multiday_research_20261003/);
  assert.doesNotMatch(page,/loadHistoricalComparison|algo-pnl-research-integrity\.js/);
  assert.match(text("js/core-period-page.js"),/core_alpaca_fee_periods_20261016/);
  assert.match(text("js/core-period-page.js"),/core_alpaca_fee_periods_20261016/);
});

test("CORE-only page keeps concise production-status and modeled-P&L disclosure",()=>{
  const page=text("algo-pnl.html");
  assert.match(page,/R5VWAPB is excluded from this hypothetical CORE study but remains enabled in production/);
  assert.match(page,/Results are modeled, not actual live-account P&amp;L/);
  assert.doesNotMatch(page,/The R5 VWAP bearish-persistence setup is excluded from this hypothetical portfolio/);
  assert.match(page,/Live Performance Reporting Paused/);
  assert.match(page,/Live algorithm performance reporting is temporarily unavailable while execution reliability and trade reconciliation are being reviewed/);
});

test("selected EX research remains standalone and separate from CORE",()=>{
  const page=text("algo-pnl.html"),data=read("data/selected_ex_research_20261013.json");
  assert.match(page,/id="selectedExResearch"/);
  assert.match(page,/Selected EX research/);
  assert.match(page,/selected-ex-research\.js/);
  assert.equal(data.classification,"SELECTED_EX_ONE_CONTRACT_RESEARCH");
  assert.equal(data.statistics.trades,281);
  assert.equal(data.statistics.gross_pnl,908.0000000000001);
  assert.equal(data.sessions_unassessable,21);
  assert.doesNotMatch(page,/CORE[^<]{0,60}EX trades|combined CORE\+EX/i);
});

test("CORE fee payload is the independent fee-model source of display values",()=>{
  const payload=read("data/core_alpaca_fee_periods_20261016.json");
  assert.equal(payload.schema_version,2);
  assert.equal(payload.independent_verification,"PASS");
  assert.equal(payload.default_period,"2024_2026");
  assert.match(payload.classification,/RETROSPECTIVE_ALPACA_FEE_APPROXIMATION/);
  assert.match(payload.fee_model.commission,/\$0/);
  assert.match(payload.fee_model.historical_classification,/retrospective approximation/);
  const primary=payload.periods.find(period=>period.id==="2024_2026");
  assert.deepEqual(primary.scenarios.map(row=>row.id),["C","A","B"]);
  assert.equal(primary.scenarios.find(row=>row.id==="B").net_pnl,23451.07);
  assert.equal(primary.scenarios.find(row=>row.id==="C").net_pnl,12539.79);
  assert.match(primary.limitations.at(-1),/R5VWAPB.*remains enabled in production/);
});
