"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/algo-pnl-research-integrity.js");
const {read,text,fixture}=require("./research-fixture");
const study=read("data/selected_ex_research_20261013.json"),page=text("algo-pnl.html");

test("old multi-sleeve attribution is not loaded or rendered",async()=>{
  const document=fixture();renderer.renderStudy(document,study);
  assert.equal(renderer.renderAttribution(document,{},study),null);
  assert.equal(await renderer.loadAttribution(document,async()=>({ok:true,json:async()=>({})})),null);
  assert.equal(document.getElementById("researchTrades").textContent,"281");
});

test("standalone selected EX scope is disclosed instead of a fabricated shared portfolio",()=>{
  assert.match(page,/Portfolio comparison/);
  assert.match(page,/standalone one-contract replay/);
  assert.match(page,/no new shared-capital core-plus-EX result is inferred/);
  assert.doesNotMatch(page,/Spread-only normalized|Spread \+ EX|Modeled portfolio comparison/);
  assert.doesNotMatch(page,/intraday_research_attribution_20261003|combined_research_20261003/);
});
