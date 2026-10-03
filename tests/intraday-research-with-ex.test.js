"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const renderer = require("../js/algo-pnl-research-integrity.js");
const root = path.resolve(__dirname, "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const study = read("data/intraday_research_with_ex_20261003.json");
const chart = read("data/historical_comparison_20261003.json");
const oldChart = read("data/historical_comparison_20260923.json");
const curve = read("data/intraday_research_curve_20261003.json");
const page = fs.readFileSync(path.join(root, "algo-pnl.html"), "utf8");
const csv = fs.readFileSync(path.join(root, "data/intraday_research_ledger_20261003.csv"), "utf8");
const ledger = csv.trim().split(/\r?\n/).slice(1).map(line => {
  const [id, date, sequence, component, status, quantity, pnl] = line.split(",");
  return {id, date, sequence: +sequence, component, status, quantity: +quantity, pnl: +pnl};
});
const documentFixture = () => {
  const elements = new Map();
  return {getElementById(id) {
    if (!elements.has(id)) elements.set(id, {textContent: "—", hidden: false});
    return elements.get(id);
  }};
};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("combined historical display matches the approved ledger and distinct coverage", () => {
  const document = documentFixture();
  renderer.renderStudy(document, study);
  const expected = {researchTrades: "526", researchGrossPnl: "+$206,578", researchWinRate: "57.60%",
    researchProfitFactor: "1.888", researchSharpe: "2.317", researchDrawdown: "-$12,146 / -34.77%",
    researchCoverage: "Spreads 929 / 932", researchCoreTrades: "259", researchEXTrades: "267",
    researchUnresolved: "Spreads 3 · EX 229", researchRuleset: "6 spread setups + 4 EX sleeves"};
  for (const [id, value] of Object.entries(expected)) assert.equal(document.getElementById(id).textContent, value);
  assert.match(document.getElementById("researchCoveragePct").textContent, /EX 607 \/ 836 sessions.*May 5, 2026/);
  assert.match(document.getElementById("researchPeriod").textContent, /January 4, 2023.*September 22, 2026/);
  assert.match(document.getElementById("researchTradeSummary").textContent, /303 wins · 222 losses · 1 flat/);
  assert.match(document.getElementById("researchLimitations").textContent, /606 \/ 932/);
  assert.match(document.getElementById("researchInputPolicy").textContent, /325 dates are unknown/);
});

test("public ledger independently reproduces counts, gross economics and closed-trade drawdown", () => {
  assert.ok(!csv.includes("\r"), "generated public ledger must use LF line endings");
  const s = study.statistics;
  assert.equal(ledger.length, 526);
  assert.equal(new Set(ledger.map(row => row.id)).size, ledger.length);
  assert.equal(ledger.filter(row => row.pnl > 0).length, 303);
  assert.equal(ledger.filter(row => row.pnl < 0).length, 222);
  assert.equal(ledger.filter(row => row.pnl === 0).length, 1);
  const gains = ledger.reduce((n, row) => n + Math.max(0, row.pnl), 0);
  const losses = -ledger.reduce((n, row) => n + Math.min(0, row.pnl), 0);
  assert.equal(gains - losses, 206578);
  close(gains / losses, s.profit_factor);
  close(303 / 526 * 100, s.win_rate_pct);
  let equity = 10000, peak = equity, dd = 0, percentDD = 0;
  for (const row of ledger) {
    equity += row.pnl; peak = Math.max(peak, equity);
    dd = Math.min(dd, equity - peak); percentDD = Math.min(percentDD, 100 * (equity - peak) / peak);
  }
  assert.equal(equity, 216578); assert.equal(dd, -12146); close(percentDD, s.max_drawdown_pct);
  assert.equal(crypto.createHash("sha256").update(csv).digest("hex"), study.source_ledger_sha256);
});

test("all daily chart points reconcile, using canonical calendar Daily Sharpe", () => {
  const byDay = new Map();
  for (const row of ledger) byDay.set(row.date, (byDay.get(row.date) || 0) + row.pnl);
  let equity = 10000; const returns = [];
  const intraday = chart.series.find(series => series.label === "Foxchase Intraday");
  assert.equal(chart.dates.length, 932);
  assert.equal(chart.dates[0], "2023-01-04"); assert.equal(chart.dates.at(-1), "2026-09-22");
  for (const [i, day] of chart.dates.entries()) {
    const pnl = byDay.get(day) || 0;
    returns.push(pnl / equity); equity += pnl;
    assert.equal(intraday.values[i], equity);
    assert.deepEqual(curve.points[i], {date: day, equity});
  }
  const mean = returns.reduce((n, r) => n + r, 0) / returns.length;
  const variance = returns.reduce((n, r) => n + (r - mean) ** 2, 0) / (returns.length - 1);
  close(mean / Math.sqrt(variance) * Math.sqrt(252), study.statistics.daily_sharpe_annualized);
  assert.equal(curve.points.at(-1).equity, 216578);
  assert.equal(curve.source_ledger_sha256, study.source_ledger_sha256);
});

test("other benchmark and archived portfolio series are byte-equivalent objects", () => {
  for (const series of chart.series.filter(row => row.label !== "Foxchase Intraday")) {
    assert.deepEqual(series, oldChart.series.find(row => row.label === series.label));
  }
  assert.deepEqual(chart.dates, oldChart.dates);
  for (const label of ["Foxchase Multi-Day", "Foxchase Combined"]) {
    const series = chart.series.find(row => row.label === label);
    assert.ok(series.values.every((v, i) => chart.dates[i] <= "2026-08-25" || v === null));
  }
});

test("annual totals, components and status reconcile without promoting pilots", () => {
  assert.equal(study.yearly.reduce((n, row) => n + row.total_trades, 0), 526);
  assert.equal(study.yearly.reduce((n, row) => n + row.combined_pnl, 0), 206578);
  const document = documentFixture(); renderer.renderStudy(document, study);
  for (const row of study.yearly) {
    const trades = ledger.filter(trade => trade.date.startsWith(String(row.year)));
    assert.equal(trades.length, row.total_trades);
    assert.equal(trades.reduce((n, trade) => n + trade.pnl, 0), row.combined_pnl);
    assert.equal(document.getElementById(`researchYear${row.year}Trades`).textContent, String(row.total_trades));
    assert.match(page, new RegExp(`id="researchYear${row.year}Pnl"`));
  }
  for (const [name, metric] of Object.entries(study.components)) {
    const trades = ledger.filter(trade => trade.component === name);
    assert.equal(trades.length, metric.trades); assert.equal(trades.reduce((n, row) => n + row.pnl, 0), metric.gross_pnl);
    if (name.endsWith(" C") || name.endsWith(" D")) assert.ok(trades.every(trade => trade.status === "Live Pilot"));
  }
});

test("invalid combined coverage, ledger totals or parity claims fail closed", () => {
  for (const mutation of [{core_trades: 263}, {ex_evaluable_sessions: 608}, {live_execution_parity: true},
    {unknown_component_outcomes_are_zero: true}, {jointly_evaluable_sessions: 608},
    {yearly: []}, {ex_study_end: "2026-10-03"}, {ex_sleeves: 0}, {spread_setup_families: undefined}]) {
    assert.throws(() => renderer.renderStudy(documentFixture(), {...study, ...mutation}), /metadata invalid/);
  }
});

test("active page loads new historical artifacts and preserves live canonical path", () => {
  assert.match(page, /historical_comparison_20261003\.json/);
  assert.match(fs.readFileSync(path.join(root, "js/algo-pnl-research-integrity.js"), "utf8"), /intraday_research_with_ex_20261003\.json/);
  assert.match(page, /fetch\("\/data\/algo-pnl\.json", \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(study.scope, /does not include separate divergence|10 credit-spread/i);
  for (const text of [study.scope, study.execution_basis, study.input_policy, study.sizing_basis]) assert.ok(text.length > 30);
  assert.match(study.execution_basis, /does not reproduce sub-minute/);
  assert.match(study.provenance, /263 trades and \+\$22,332/);
  assert.doesNotMatch(JSON.stringify(study) + csv + page, /R[1256][ _-](BULL|BEAR|EX)|r[1256]_(bull|bear)|SPY-EX-/i);
});

test("live rendering leaves every historical value untouched", () => {
  const live = read("data/algo-pnl.json"); const document = documentFixture();
  renderer.renderStudy(document, study);
  renderer.renderLive(document, live.canonical_metrics, true);
  assert.equal(document.getElementById("researchTrades").textContent, "526");
  assert.equal(document.getElementById("compareLiveTrades").textContent, String(live.canonical_metrics.trades.closed_trade_count));
  renderer.renderLive(document, live.canonical_metrics, false);
  assert.equal(document.getElementById("compareLiveTrades").textContent, "—");
  assert.equal(document.getElementById("compareHistoricalTrades").textContent, "526");
});
