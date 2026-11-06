"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const payload = JSON.parse(fs.readFileSync(path.join(root, "data/algo-pnl.json"), "utf8"));
const rows = payload.stats.trades;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

const ENTRY_ORDER_ID = "ab5f4310-4db8-4469-80a3-b81d912bf56a";
const EXIT_ORDER_IDS = [
  "bae7c68a-9a53-4081-96ed-c8eb41aa9a85",
  "d035fb86-6bb2-46e3-9a31-49277ca3170f",
];

test("October 15 manual close appears once with exact gross execution record", () => {
  const matches = rows.filter(row => row.entry_order_id === ENTRY_ORDER_ID);
  assert.equal(matches.length, 1);

  const trade = matches[0];
  assert.deepEqual(trade.symbols, ["SPY261015C00767000", "SPY261015C00770000"]);
  assert.equal(trade.opened_at, "2026-10-15T13:55:20.415Z");
  assert.equal(trade.closed_at, "2026-10-15T19:46:03.476Z");
  assert.equal(trade.qty, 4);
  assert.equal(trade.open_avg, -0.59);
  assert.equal(trade.close_avg, 2.9275);
  assert.equal(trade.pnl, -935);
  assert.equal(trade.setup, "SPY 0DTE call credit spread");
  assert.equal(trade.strategy, "SPY 0DTE call credit spread");
  assert.equal(trade.result, "loss");
  assert.deepEqual(trade.external_close_order_ids, EXIT_ORDER_IDS);
  assert.equal(trade.source, "manual_external_reconciled");
  assert.equal(trade.exit_reason, "Manual External Close");
  assert.equal(trade.exit_reason_id, "MANUAL_EXIT");
  assert.equal(trade.pnl_basis, "trusted_manual_external_fills_gross_before_fees");
  assert.equal(Object.hasOwn(trade, "exit_order_id"), false);
  assert.equal(Object.hasOwn(trade, "net_pnl"), false);
  assert.equal(Object.hasOwn(trade, "fees"), false);
  assert.equal(Object.hasOwn(trade, "commission"), false);
});

test("gross-before-fees aggregates reconcile without changing the index", () => {
  assert.equal(rows.length, 37);
  assert.equal(payload.trade_stats.trades.length, 37);
  assert.deepEqual(payload.trade_stats.trades, rows);

  for (const metrics of [payload.stats, payload.trade_stats, payload.canonical_metrics.trades]) {
    assert.equal(metrics.closed_trade_count, 37);
    assert.equal(metrics.wins, 25);
    assert.equal(metrics.losses, 12);
    assert.equal(metrics.breakeven_trades, 0);
    assert.ok(Math.abs(metrics.win_rate_pct - (25 / 37 * 100)) < 1e-12);
    assert.equal(metrics.gross_profit, 2831.0002);
    assert.equal(metrics.gross_loss, 2848);
    assert.ok(Math.abs(metrics.profit_factor - (2831.0002 / 2848)) < 1e-12);
    assert.ok(Math.abs(metrics.realized_algo_pnl - (-16.9998)) < 1e-9);
    assert.equal(metrics.worst_trade, -935);
    assert.equal(metrics.trade_history_completeness, "reconstructed_partial");
    assert.equal(metrics.pnl_fee_basis, "gross_before_fees");
  }

  assert.equal(payload.performance.current_index, 100.5838);
  assert.equal(payload.performance.flow_adjusted, true);
  assert.equal(payload.points.at(-1).date, "2026-10-15");
  assert.equal(payload.points.at(-1).index_value, 100.5838);
});

test("prior 36 trade records remain unchanged and identity is deduplicated", () => {
  const priorRows = rows.filter(row => row.entry_order_id !== ENTRY_ORDER_ID);
  assert.equal(priorRows.length, 36);
  assert.equal(sha256(priorRows), "ded4933c42b89fa7d424f66790fd823cc2b100e4ea853a5b8d7cc46afb42a85b");
  assert.equal(new Set(rows.map(row => row.entry_order_id).filter(Boolean)).size, 37);
  for (const orderId of EXIT_ORDER_IDS) {
    assert.equal(rows.filter(row => row.external_close_order_ids?.includes(orderId)).length, 1);
  }
});
