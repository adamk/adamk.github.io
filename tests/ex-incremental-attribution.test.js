"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const renderer = require("../js/algo-pnl-research-integrity.js");
const root = path.resolve(__dirname, "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const data = read("data/intraday_research_attribution_20261003.json");
const study = read("data/intraday_research_with_ex_20261003.json");
const page = fs.readFileSync(path.join(root, "algo-pnl.html"), "utf8");
const fixture = () => {
  const nodes = new Map();
  return {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {textContent: "—", hidden: false});
    return nodes.get(id);
  }};
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("same-engine comparison renders both records without changing combined or live metrics", () => {
  const doc = fixture(); renderer.renderStudy(doc, study);
  doc.getElementById("headlineClosedTrades").textContent = "34";
  renderer.renderAttribution(doc, data, study);
  for (const [id, value] of Object.entries({modelSpreadTrades:"263", modelCombinedTrades:"526",
    modelSpreadPnl:"+$22,332", modelCombinedPnl:"+$206,578", modelSpreadPF:"2.598", modelCombinedPF:"1.888",
    modelSpreadSharpe:"2.387", modelCombinedSharpe:"2.317", modelSpreadDD:"-$899 / -7.89%", modelCombinedDD:"-$12,146 / -34.77%"})) {
    assert.equal(doc.getElementById(id).textContent, value);
  }
  assert.equal(doc.getElementById("researchTrades").textContent, "526");
  assert.equal(doc.getElementById("headlineClosedTrades").textContent, "34");
  assert.match(doc.getElementById("researchLegacyContext").textContent, /original canonical sizing.*reproduces every quantity/s);
  assert.match(doc.getElementById("researchEXAttribution").textContent, /\+\$184,246.*\+\$80,149.*\+\$104,595.*-\$498/s);
  assert.match(doc.getElementById("researchModelInterpretation").textContent, /lower.*profit factor.*Daily Sharpe.*deeper.*drawdown/);
});

test("exact dollar attribution and arithmetic ratio changes reconcile", () => {
  const a = data.attribution;
  assert.equal(data.combined.gross_pnl - data.spread_only.gross_pnl, 184246);
  assert.equal(a.direct_EX_pnl + a.matched_spread_sizing_effect + a.displaced_spread_effect + a.newly_affordable_spread_effect, 184246);
  assert.equal(a.residual, 0);
  assert.equal(a.EX_compounding_included_in_direct_EX, true);
  assert.equal(a.separate_additive_EX_compounding_term, null);
  close(data.deltas.profit_factor, data.combined.profit_factor - data.spread_only.profit_factor);
  close(data.deltas.daily_sharpe_annualized, data.combined.daily_sharpe_annualized - data.spread_only.daily_sharpe_annualized);
});

test("public counterfactual ledger reproduces metrics and every daily curve point", () => {
  const csv = fs.readFileSync(path.join(root, "data/intraday_spread_only_normalized_20261003.csv"), "utf8");
  assert.ok(!csv.includes("\r"));
  const rows = csv.trim().split("\n").slice(1).map(line => {
    const fields = line.split(","); return {id:fields[0], date:fields[1], pnl:+fields[6]};
  });
  assert.equal(rows.length, 263); assert.equal(new Set(rows.map(r => r.id)).size, 263);
  assert.equal(rows.filter(r => r.pnl > 0).length, 173);
  assert.equal(rows.filter(r => r.pnl < 0).length, 89);
  assert.equal(rows.filter(r => r.pnl === 0).length, 1);
  const gains = rows.reduce((n,r) => n + Math.max(0,r.pnl),0), losses = -rows.reduce((n,r) => n + Math.min(0,r.pnl),0);
  assert.equal(gains-losses,22332); close(gains/losses,data.spread_only.profit_factor);
  let equity=10000, peak=equity, dd=0, ddp=0;
  for (const row of rows) {equity+=row.pnl;peak=Math.max(peak,equity);dd=Math.min(dd,equity-peak);ddp=Math.min(ddp,100*(equity-peak)/peak);}
  assert.equal(dd,-899);close(ddp,data.spread_only.max_drawdown_pct);
  assert.equal(crypto.createHash("sha256").update(csv).digest("hex"),data.spread_only_source_ledger_sha256);
  const curve=read("data/intraday_research_spread_only_curve_20261003.json");
  const daily = new Map();for(const row of rows)daily.set(row.date,(daily.get(row.date)||0)+row.pnl);
  equity=10000;const returns=[];
  for(const point of curve.points){const pnl=daily.get(point.date)||0;returns.push(pnl/equity);equity+=pnl;assert.equal(point.equity,equity);}
  assert.equal(curve.points.length,932);assert.equal(curve.points.at(-1).date,"2026-09-22");assert.equal(equity,32332);
  const mean=returns.reduce((n,v)=>n+v,0)/returns.length;
  const variance=returns.reduce((n,v)=>n+(v-mean)**2,0)/(returns.length-1);
  close(mean/Math.sqrt(variance)*Math.sqrt(252),data.spread_only.daily_sharpe_annualized);
});

test("annual attribution and original legacy context reconcile", () => {
  assert.equal(data.yearly.reduce((n,r)=>n+r.spread_only_gross_pnl,0),22332);
  assert.equal(data.yearly.reduce((n,r)=>n+r.combined_gross_pnl,0),206578);
  assert.equal(data.yearly.reduce((n,r)=>n+r.incremental_portfolio_pnl,0),184246);
  for(const year of data.yearly){
    assert.equal(year.incremental_portfolio_pnl,year.combined_gross_pnl-year.spread_only_gross_pnl);
    assert.equal(year.residual,0);
  }
  assert.deepEqual(data.legacy,Object.fromEntries(Object.keys(data.legacy).map(k=>[k,data.spread_only[k]])));
  assert.equal(data.counterfactual_equal_legacy_trade_by_trade,true);
});

test("malformed attribution fails closed, preserving other sections", () => {
  const bad = [ {...data,same_engine:false}, {...data,signals_rules_allocations_changed:true},
    {...data,missing_EX_outcomes_are_unknown:false}, {...data,end:"2026-10-03"},
    {...data,attribution:{...data.attribution,residual:1}},
    {...data,attribution:{...data.attribution,direct_EX_pnl:80150}},
    {...data,deltas:{...data.deltas,gross_pnl:184247}},
    {...data,combined:{...data.combined,profit_factor:2}},
    {...data,coverage:{...data.coverage,ex:608}}, {...data,legacy_context:null},
    {...data,yearly:data.yearly.map((r,i)=>i===0 ? {...r,residual:1} : r)} ];
  for(const value of bad){assert.throws(()=>renderer.renderAttribution(fixture(),value,study),/Attribution metadata invalid/);}
});

test("missing comparison metadata does not replace combined or live data", async () => {
  const doc=fixture();renderer.renderStudy(doc,study);
  await renderer.loadAttribution(doc,async()=>({ok:false}));
  assert.match(doc.getElementById("attributionDataStatus").textContent,/temporarily unavailable/);
  assert.equal(doc.getElementById("researchTrades").textContent,"526");
  assert.equal(doc.getElementById("modelSpreadPnl").textContent,"—");
});

test("page states modeled comparison, compounding and distinct legacy provenance", () => {
  assert.match(page,/Modeled portfolio comparison/);
  assert.match(page,/Spread-only normalized/);
  assert.match(page,/Spread \+ EX/);
  assert.match(page,/position sizes compound with modeled equity/);
  assert.match(page,/not actual account equity/);
  assert.match(page,/loadAttribution/);
  assert.match(study.input_policy,/325 dates are unknown/);
  assert.match(study.provenance,/263 trades and \+\$22,332/);
  assert.doesNotMatch(page+JSON.stringify(data),/EX (?:alone )?(?:earned|added|increased).*\$184,246/i);
  assert.doesNotMatch(page+JSON.stringify(data),/R[1256][ _-](BULL|BEAR|EX)|r[1256]_(bull|bear)|SPY-EX-/i);
});
