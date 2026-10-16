"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const renderer = require("../js/algo-pnl-research-integrity.js");
const { read, text, fixture } = require("./research-fixture");

const scenario = (id, label, trades, net, pf, dd, expectancy, ci, slippage, fees) => ({
  id, label, trades, net_pnl: net, net_profit_factor: pf,
  maximum_drawdown_dollars: dd, net_expectancy_per_trade: expectancy,
  expectancy_ci_95: ci, added_slippage_cost: slippage, assumed_fees: fees
});

const study = {
  schema_version: 1,
  classification: "MODELED_CORE_SLIPPAGE_REPLAY",
  period: {
    start: "2023-01-04", end: "2026-09-22", candidate_sessions: 932,
    admitted_sessions: 928, starting_equity: 10000
  },
  independent_verification: "PASS",
  source_sha256: {
    slippage_methodology: "cd4c9e394a714329a3cfb2c0b62f917c6805b6eb25139f92d44c1a87aa8997a0",
    scenario_results: "cd1feb5b2f81d5df91374075d822dbcbce354a43066cf4d0f5381e576fe0bcf4",
    year_by_year: "ff03b71a43c01316185f52da5d83ed4ae6e2bb3290adfda47344fae2ecc6f399",
    independent_verification: "cc75a18de376b8183879bffc694a3386825dcb749185d966a6d038536334052d"
  },
  scenarios: [
    scenario("C", "Full Live-Sequence Slippage Replay", 159, 4568.4, 1.3301, -2356.4, 28.73, [-11.87, 68.12], 3524, 2290.6),
    scenario("A", "Natural NBBO", 168, 17564.2, 2.1804, -1625, 104.55, [49.32, 160.31], 0, 3296.8),
    scenario("B", "Matched-Trade Slippage", 168, 12492.2, 1.7701, -2462.6, 74.36, [20, 129.38], 5072, 3296.8)
  ],
  setups: [
    { label: "R1 EM Bear", trades: 38, net_pnl: 1850.8, net_profit_factor: 1.4238, maximum_drawdown_dollars: -1419.8, expectancy_ci_95: [-68.44, 155.24] },
    { label: "R1 SPX Narrow", trades: 19, net_pnl: 563.6, net_profit_factor: 1.3767, maximum_drawdown_dollars: -1299.4, expectancy_ci_95: [-74.14, 138.4] },
    { label: "R4 Failed PML Reclaim", trades: 17, net_pnl: 734.4, net_profit_factor: 1.3998, maximum_drawdown_dollars: -803.6, expectancy_ci_95: [-109.36, 183.12] },
    { label: "R4 PML Break", trades: 43, net_pnl: 316.8, net_profit_factor: 1.0683, maximum_drawdown_dollars: -991.8, expectancy_ci_95: [-80.47, 91.78] },
    { label: "R5 Late Lower EM", trades: 42, net_pnl: 1102.8, net_profit_factor: 1.736, maximum_drawdown_dollars: -452.2, expectancy_ci_95: [-7.73, 59.82] },
    { label: "R5 EM Lower Rejection", trades: 0, net_pnl: null, net_profit_factor: null, maximum_drawdown_dollars: null, expectancy_ci_95: null }
  ],
  yearly: [
    { label: "2023", a_net_pnl: -1346.8, b_net_pnl: -1998.8, c_net_pnl: -2127.8 },
    { label: "2024", a_net_pnl: 1352, b_net_pnl: 632, c_net_pnl: 722.8 },
    { label: "2025", a_net_pnl: 6191.4, b_net_pnl: 4567.4, c_net_pnl: 2347.6 },
    { label: "2026 YTD through Sep 22", a_net_pnl: 11367.6, b_net_pnl: 9291.6, c_net_pnl: 3625.8 }
  ],
  data_quality: { excluded_sessions: 4, invalid_or_crossed_quote_events: 19, provider_no_data_events: 122 }
};

test("CORE slippage renderer is available for the separate historical study", () => {
  assert.equal(typeof renderer.renderCoreSlippageStudy, "function");
});

test("CORE renderer puts Scenario C first and renders the verified portfolio, setup, and year figures", () => {
  const document = fixture();
  renderer.renderCoreSlippageStudy(document, study);
  assert.equal(document.getElementById("coreStudyPeriod").textContent,
    "January 4, 2023 – September 22, 2026 · 928 admitted of 932 candidate sessions · normalized $10,000.00 start");
  for (const [id, values] of Object.entries({
    C: ["159", "+$4,568.40", "1.3301", "-$2,356.40", "$3,524.00", "$2,290.60", "+$28.73", "-$11.87 to +$68.12 / trade"],
    A: ["168", "+$17,564.20", "2.1804", "-$1,625.00", "$0.00", "$3,296.80", "+$104.55", "+$49.32 to +$160.31 / trade"],
    B: ["168", "+$12,492.20", "1.7701", "-$2,462.60", "$5,072.00", "$3,296.80", "+$74.36", "+$20.00 to +$129.38 / trade"]
  })) {
    const suffixes = ["Trades", "NetPnl", "ProfitFactor", "MaxDrawdown", "Slippage", "Fees", "Expectancy", "ExpectancyCI"];
    suffixes.forEach((suffix, index) => assert.equal(document.getElementById(`coreScenario${id}${suffix}`).textContent, values[index]));
  }
  assert.equal(document.getElementById("coreSetup0Name").textContent, "R1 EM Bear");
  assert.equal(document.getElementById("coreSetup0Trades").textContent, "38");
  assert.equal(document.getElementById("coreSetup0NetPnl").textContent, "+$1,850.80");
  assert.equal(document.getElementById("coreSetup0ProfitFactor").textContent, "1.4238");
  assert.equal(document.getElementById("coreSetup0ExpectancyCI").textContent, "-$68.44 to +$155.24");
  assert.equal(document.getElementById("coreSetup5Trades").textContent, "0");
  assert.equal(document.getElementById("coreSetup5ProfitFactor").textContent, "—");
  assert.equal(document.getElementById("coreYear2023C").textContent, "-$2,127.80");
  assert.equal(document.getElementById("coreYear2026C").textContent, "+$3,625.80");
  assert.equal(document.getElementById("coreYear2026Label").textContent, "2026 YTD through Sep 22");
  assert.equal(document.getElementById("coreStudyCInterval").textContent, "-$11.87 to +$68.12");
  assert.match(document.getElementById("coreStudyDataQuality").textContent, /19.*crossed.*122.*no-data/i);
  assert.match(text("algo-pnl.html"), /R5 VWAP bearish-persistence setup is excluded from this hypothetical portfolio/);
  assert.match(text("algo-pnl.html"), /does not mean this exclusion has been deployed/);
  assert.match(text("algo-pnl.html"), /Scenarios B and C model.*not actual brokerage executions/i);
  assert.match(text("algo-pnl.html"), /Scenario C.*?\$0\.01 adverse slippage per option leg per side/s);
  assert.match(text("algo-pnl.html"), /\$0\.65 per contract per side.*\$2\.60 per completed vertical-spread contract quantity/s);
  assert.match(text("algo-pnl.html"), /modeled edge is not statistically established/i);
});

test("CORE study rejects mismatched totals, failed verification, and nonzero-trade rows without uncertainty", () => {
  for (const change of [
    { period: { ...study.period, admitted_sessions: 927 } },
    { independent_verification: "FAIL" },
    { scenarios: [study.scenarios[0], study.scenarios[1], { ...study.scenarios[2], trades: 167 }] },
    { scenarios: [{ ...study.scenarios[0], expectancy_ci_95: [-11.87, 0] }, ...study.scenarios.slice(1)] },
    { setups: [{ ...study.setups[0], expectancy_ci_95: null }, ...study.setups.slice(1)] }
  ]) {
    assert.throws(() => renderer.renderCoreSlippageStudy(fixture(), { ...study, ...change }), /CORE slippage study metadata invalid/);
  }
});

test("CORE study loader fetches its own JSON and fails closed when unavailable", async () => {
  const document = fixture(); let requested = "";
  assert.equal(await renderer.loadCoreSlippageStudy(document, async url => {
    requested = url; return { ok: true, json: async () => study };
  }), study);
  assert.equal(requested, "/data/core_slippage_replay_20261015.json");
  assert.equal(await renderer.loadCoreSlippageStudy(document, async () => ({ ok: false })), null);
  assert.match(document.getElementById("coreSlippageDataStatus").textContent, /temporarily unavailable/);
});

test("published CORE payload matches the verified source values and keeps the study separate from live and EX reporting", () => {
  const payload = read("data/core_slippage_replay_20261015.json");
  assert.equal(payload.independent_verification, "PASS");
  assert.deepEqual(payload.scenarios, study.scenarios);
  assert.deepEqual(payload.setups, study.setups);
  assert.deepEqual(payload.yearly, study.yearly);
  const page = text("algo-pnl.html");
  assert.match(page, /Live Performance Reporting Paused/);
  assert.match(page, /Corrected commissioned EX sleeve/);
  assert.match(page, /coreSlippageResearch/);
  assert.match(page, /historical modeled/i);
  assert.match(page, /not.*statistically established/i);
  assert.ok(page.indexOf('id="coreScenarioC"') < page.indexOf('id="coreScenarioA"'));
  assert.ok(page.indexOf('id="coreScenarioA"') < page.indexOf('id="coreScenarioB"'));
  for (const year of [2023, 2024, 2025, 2026]) {
    const row = page.match(new RegExp(`<tr><th id="coreYear${year}Label"[\\s\\S]*?<\\/tr>`));
    assert.ok(row, `year ${year} row exists`);
    assert.ok(row[0].indexOf(`id="coreYear${year}A"`) < row[0].indexOf(`id="coreYear${year}B"`));
    assert.ok(row[0].indexOf(`id="coreYear${year}B"`) < row[0].indexOf(`id="coreYear${year}C"`));
  }
  assert.match(page, /loadCoreSlippageStudy/);
  assert.doesNotMatch(JSON.stringify(payload), /R1_EM_|R4_|R5_|PERSISTENCE_CALL_CREDIT/);
});
