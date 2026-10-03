"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {text,read}=require("./research-fixture");

test("Multi-Day endpoint is the corrected canonical standalone record",()=>{
  const c=read("data/historical_comparison_20261003.json"),s=c.series.find(x=>x.label==="Foxchase Multi-Day");
  assert.equal(s.values[c.dates.indexOf("2026-08-25")],27351.1);
  assert.doesNotMatch(s.basis,/archived|not a complete|contribution/);
});

test("validated Combined and the other unchanged numeric curves are preserved",()=>{
  const c=read("data/historical_comparison_20261003.json"),s=c.series.find(x=>x.label==="Foxchase Combined");
  assert.equal(s.curve_sha256,"ef7504ff6a2abefc6b09d47612c71fbb2b9645208687a6e86a84e13bb3294ef4");
  assert.equal(s.values[c.dates.indexOf("2026-08-25")],322107.3);
  const expected={"Foxchase Intraday":"977ea3ffd79ba8e17aac8a42aec8f907cfa14e91758a74c89bb7a5ff0affa270","SPY Buy & Hold":"8e94e9dc6c73539f0f05ed9c7dd2803bf2314240b885646ae3fe5f2d987ed5ac","JEPI Buy & Hold":"8ad1d0b895a63c2dfed6bea3a2eda4604f58d7a917d106d10c6f5d5c1d92a4af"};
  for(const [label,hash] of Object.entries(expected))assert.equal(crypto.createHash("sha256").update(JSON.stringify(c.series.find(x=>x.label===label).values)).digest("hex"),hash);
});

test("chart offers clearly labeled linear and logarithmic options on one axis",()=>{
  const html=text("algo-pnl.html");
  assert.match(html,/id="historicalScale"/);assert.match(html,/value="linear"/);assert.match(html,/value="logarithmic"/);
  assert.match(html,/id="historicalScaleStatus"/);assert.match(html,/equal percentage changes/);
  assert.doesNotMatch(html,/yAxisID|position:\s*["']right["']/);
  assert.match(html,/gains and losses affect the size of subsequent trades/i);
});
