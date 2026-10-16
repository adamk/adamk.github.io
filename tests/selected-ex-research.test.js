"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const renderer=require("../js/selected-ex-research.js");
const {read,fixture}=require("./research-fixture");

test("standalone selected EX summary renders only its certified one-contract research",()=>{
  const study=read("data/selected_ex_research_20261013.json"),document=fixture();
  renderer.render(document,study);
  assert.equal(document.getElementById("selectedExTrades").textContent,"281");
  assert.equal(document.getElementById("selectedExGrossPnl").textContent,"+$908");
  assert.equal(document.getElementById("selectedExWinRate").textContent,"45.55%");
  assert.equal(document.getElementById("selectedExProfitFactor").textContent,"1.196");
  assert.equal(document.getElementById("selectedExDrawdown").textContent,"-$496");
  assert.equal(document.getElementById("selectedExUnknown").textContent,"21 / 932 sessions");
  assert.match(document.getElementById("selectedExPeriod").textContent,/January 4, 2023.*September 21, 2026/);
});

test("standalone EX summary rejects altered or incomplete research metadata",()=>{
  const study=read("data/selected_ex_research_20261013.json");
  for(const mutate of [
    row=>{row.classification="COMBINED_MODELED_INTRADAY_RESEARCH";},
    row=>{row.statistics.trades=280;},
    row=>{row.unknown_outcomes_are_zero=true;},
    row=>{row.complete_history=true;},
    row=>{row.sessions_unassessable=0;}
  ]) {
    const copy=structuredClone(study);mutate(copy);assert.throws(()=>renderer.validateStudy(copy));
  }
});

test("standalone EX loader requests only the selected EX research source",async()=>{
  const document=fixture(),study=read("data/selected_ex_research_20261013.json");let requested="";
  await renderer.load(document,async url=>{requested=url;return {ok:true,json:async()=>study};});
  assert.equal(requested,"/data/selected_ex_research_20261013.json");
  assert.equal(document.getElementById("selectedExTrades").textContent,"281");
});
