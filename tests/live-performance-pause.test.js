"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {text}=require("./research-fixture");

test("public reporting pause prevents modeled research from being mistaken for live results",()=>{
  const page=text("algo-pnl.html");
  assert.match(page,/Live Performance Reporting Paused/);
  assert.match(page,/Live algorithm performance reporting is temporarily unavailable while execution reliability and trade reconciliation are being reviewed/);
  assert.match(page,/Historical, modeled research is shown separately from live trading and does not establish verified live performance/);
  assert.doesNotMatch(page,/Live Account Performance|Live Account Performance Index|Live vs Historical Behavior/);
  assert.doesNotMatch(page,/fetch\("\/data\/(?:algo-pnl|live-benchmarks)\.json"/);
});

test("site navigation and legacy page keep the pause messaging",()=>{
  const index=text("index.html"),legacy=text("algo-pnl.backup_20260717_213556.html");
  assert.match(index,/historical algorithm research/i);
  assert.match(index,/Historical research remains available\. Live performance reporting is paused/);
  assert.match(legacy,/http-equiv="refresh" content="0; url=\/algo-pnl\.html"/);
  assert.match(legacy,/Live Performance Reporting Paused/);
  assert.doesNotMatch(legacy,/Live Account Performance|fetch\("\/data\/(?:algo-pnl|live-benchmarks)\.json"/);
});
