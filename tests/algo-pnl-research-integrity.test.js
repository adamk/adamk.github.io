"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const renderer = require("../js/algo-pnl-research-integrity.js");

const root = path.resolve(__dirname, "..");
const study = JSON.parse(fs.readFileSync(path.join(root, "data/intraday_research_integrity_20260922.json"), "utf8"));
const live = JSON.parse(fs.readFileSync(path.join(root, "data/algo-pnl.json"), "utf8"));
const page = fs.readFileSync(path.join(root, "algo-pnl.html"), "utf8");

function documentFixture() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: "—", hidden: false });
      return elements.get(id);
    }
  };
}

test("historical display uses the frozen research source and 929/932 coverage", () => {
  const document = documentFixture();
  assert.equal(renderer.renderStudy(document, study).toFixed(2), "99.68");
  assert.equal(document.getElementById("researchCoverage").textContent, "929 / 932 sessions");
  assert.equal(document.getElementById("researchCoveragePct").textContent, "99.68% coverage");
  assert.equal(document.getElementById("researchUnresolved").textContent, "3");
  assert.equal(document.getElementById("researchTrades").textContent, "263");
  assert.equal(document.getElementById("researchProfitFactor").textContent, "2.598");
  assert.equal(document.getElementById("compareHistoricalDrawdown").textContent, "-7.89%");
  for (const date of ["June 5, 2023", "August 26, 2026", "September 22, 2026"]) {
    assert.ok(document.getElementById("researchLimitations").textContent.includes(date));
  }
  assert.ok(document.getElementById("researchScope").textContent.includes("does not include separate divergence strategies or reproduce the full current live configuration"));
  assert.equal(document.getElementById("researchCostBasis").textContent, "Gross before fees");
});

test("live comparison reads canonical live metrics without replacing research values", () => {
  const document = documentFixture();
  renderer.renderStudy(document, study);
  renderer.renderLive(document, live.canonical_metrics, true);
  const trades = live.canonical_metrics.trades;
  const performance = live.canonical_metrics.performance;
  assert.equal(document.getElementById("compareLiveTrades").textContent, String(trades.closed_trade_count));
  assert.equal(document.getElementById("compareLiveWinRate").textContent, trades.win_rate_pct.toFixed(2) + "%");
  assert.equal(document.getElementById("compareLiveProfitFactor").textContent, trades.profit_factor.toFixed(2));
  assert.equal(document.getElementById("compareLiveDrawdown").textContent, performance.max_drawdown_pct.toFixed(2) + "%");
  assert.equal(document.getElementById("compareHistoricalTrades").textContent, "263");
  assert.equal(document.getElementById("compareHistoricalProfitFactor").textContent, "2.598");
  renderer.renderLive(document, live.canonical_metrics, false);
  assert.equal(document.getElementById("compareLiveTrades").textContent, "—");
  assert.equal(document.getElementById("compareHistoricalTrades").textContent, "263");
});

test("missing optional research metadata hides empty fields", () => {
  const document = documentFixture();
  renderer.renderStudy(document, { ...study, setup_families: undefined, scope: undefined,
    execution_basis: undefined, cost_note: undefined });
  assert.equal(document.getElementById("researchRulesetCard").hidden, true);
  assert.equal(document.getElementById("researchScope").hidden, true);
  assert.equal(document.getElementById("researchExecutionBasis").hidden, true);
  assert.equal(document.getElementById("researchCostNote").hidden, true);
  assert.equal(document.getElementById("researchCoverage").textContent, "929 / 932 sessions");
});

test("inconsistent coverage fails closed without rendering a partial study", () => {
  const document = documentFixture();
  assert.throws(() => renderer.renderStudy(document, { ...study, fully_evaluable_sessions: 930 }),
    /Historical research metadata invalid/);
  assert.equal(document.getElementById("researchCoverage").textContent, "—");
});

test("missing research source reports unavailability without changing live values", async () => {
  const document = documentFixture();
  renderer.renderLive(document, live.canonical_metrics, true);
  assert.equal(await renderer.loadStudy(document, async () => ({ ok: false })), null);
  assert.equal(document.getElementById("researchDataStatus").textContent,
    "Historical research details temporarily unavailable.");
  assert.equal(document.getElementById("compareHistoricalTrades").textContent, "—");
  assert.equal(document.getElementById("compareLiveTrades").textContent,
    String(live.canonical_metrics.trades.closed_trade_count));
});

test("page retains both canonical chart loads and distinct labels", () => {
  for (const id of ["researchCoverage", "researchUnresolved", "compareHistoricalTrades", "compareLiveTrades",
    "researchTradeSummary", "researchLimitations"]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /fetch\("\/data\/algo-pnl\.json"/);
  assert.match(page, /fetch\("\/data\/historical_comparison_20261003\.json/);
  assert.match(page, /FoxchaseResearchIntegrity\.renderLive\(document, canonicalMetrics, liveAvailable\)/);
  assert.match(page, /Live vs Historical Behavior/);
  assert.match(page, /Historical Research<\/th><th scope="col">Live/);
  assert.doesNotMatch(page, /out.of.sample|institutional grade|proven backtest/i);
});
