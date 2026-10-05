"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(__dirname, "../js/live-benchmarks.js");
const api = fs.existsSync(file) ? require(file) : {};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const rates = [{date:"2026-05-01", annual_yield_pct:3.65}, {date:"2026-05-04", annual_yield_pct:7.30}];
const points = [{date:"2026-05-04",index_value:100}, {date:"2026-05-05",index_value:101}, {date:"2026-05-06",index_value:102}];
function fixture() {
  return {schema:"foxchase-live-benchmarks-v1", base_index:100,
    source_start:"2026-05-04",source_end:"2026-05-06",source_as_of:"2026-05-06T20:00:00-04:00",
    cash:{series:"UST_3MO_PAR",unit:"annual_percent",observations:rates},
    spy:{adjustment:"all",feed:"sip",session_dates:points.map(p=>p.date),
      prices:[{date:"2026-05-04",close:500},{date:"2026-05-05",close:505},{date:"2026-05-06",close:510}]}};
}
const live = {points,updated_at:"2026-05-06T20:00:00-04:00",canonical_metrics:{performance:{inception_date:points[0].date,as_of_date:points.at(-1).date,since_inception_return_pct:2,current_index:102}}};

test("cash uses annual percent / 100 / 365 and previous dated yield", () => {
  assert.equal(typeof api.cashSeries,"function");
  const out = api.cashSeries(points.map(p=>p.date), rates);
  assert.equal(out[0],100); close(out[1],100*1.0001); close(out[2],100*1.0001*1.0002);
});
test("cash compounds calendar days over weekends, not just plotted sessions", () => {
  assert.equal(typeof api.cashSeries,"function");
  close(api.cashSeries(["2026-05-01","2026-05-04"],[{date:"2026-04-30",annual_yield_pct:3.65}])[1],100*1.0001**3);
});
test("independent log-product matches cash over changing rates", () => {
  assert.equal(typeof api.cashSeries,"function");
  const r=[{date:"2026-04-30",annual_yield_pct:3.65},{date:"2026-05-02",annual_yield_pct:7.3}];
  close(api.cashSeries(["2026-05-01","2026-05-05"],r)[1],100*Math.exp(2*Math.log1p(.0365/365)+2*Math.log1p(.073/365)));
});
test("missing initial data, stale data, unit errors and malformed dates fail closed", () => {
  assert.equal(typeof api.cashSeries,"function");
  for (const [d,r] of [
    [["2026-05-04","2026-05-05"],[]],
    [["2026-05-04","2026-05-12"],[{date:"2026-05-01",annual_yield_pct:3.65}]],
    [["2026-05-04","2026-05-05"],[{date:"2026-05-01",annual_yield_pct:365}]],
    [["2026-02-30","2026-03-01"],rates],
    [["2026-05-05","2026-05-04"],rates],
    [["2026-05-04","2026-05-05"],[{date:"2026-05-01",annual_yield_pct:null}]],
  ]) assert.throws(()=>api.cashSeries(d,r));
});
test("three normalized series and excess-return subtraction preserve live payload", () => {
  assert.equal(typeof api.compare,"function");
  const before=JSON.stringify(live), out=api.compare(live,fixture());
  assert.equal(out.cash.available,true); assert.equal(out.spy.available,true);
  assert.equal(out.strategy_return_pct,2);close(out.cash.return_pct,100*(1.0001*1.0002-1));
  close(out.excess_return_pp,2-out.cash.return_pct);close(out.spy.return_pct,2);
  assert.deepEqual(out.datasets.map(d=>d.label),["Foxchase Algo","Risk-Free / Cash","SPY Buy & Hold"]);
  assert.ok(out.datasets.every(d=>d.data[0]===100&&d.data.length===points.length));
  assert.equal(JSON.stringify(live),before);
});
test("a benchmark endpoint mismatch cannot shorten or rebase the algo", () => {
  assert.equal(typeof api.compare,"function");
  const f=fixture(); f.source_end="2026-05-05";
  const out=api.compare(live,f);
  assert.equal(out.cash.available,false);assert.equal(out.spy.available,false);
  assert.deepEqual(out.datasets[0].data,points.map(p=>p.index_value));assert.equal(out.excess_return_pp,null);
});
test("SPY missing session price is not silently carried or backfilled", () => {
  assert.equal(typeof api.compare,"function");
  const f=fixture();f.spy.prices.splice(1,1);
  const out=api.compare(live,f);assert.equal(out.cash.available,true);assert.equal(out.spy.available,false);
});
test("SPY carries only across explicit nontrading dates", () => {
  assert.equal(typeof api.spySeries,"function");
  assert.deepEqual(api.spySeries(["2026-05-01","2026-05-02","2026-05-04"],{
    adjustment:"all",feed:"sip",session_dates:["2026-05-01","2026-05-04"],
    prices:[{date:"2026-05-01",close:500},{date:"2026-05-04",close:510}]
  }),[100,100,102]);
});
test("a partial SPY observation must match the live snapshot timestamp", () => {
  assert.equal(typeof api.compare,"function");
  const f=fixture();f.source_as_of="2026-05-06T18:00:00-04:00";f.spy.partial_session=true;
  assert.equal(api.compare(live,f).spy.available,false);
});
test("closed-session SPY cannot use a future or malformed snapshot", () => {
  for (const stamp of ["2026-05-06T20:01:00-04:00","invalid",undefined]) {
    const f=fixture();f.source_as_of=stamp;f.spy.partial_session=false;
    const out=api.compare(live,f);
    assert.equal(out.spy.available,false);assert.equal(out.cash.available,true);
    assert.deepEqual(out.datasets[0].data,points.map(p=>p.index_value));
  }
  const f=fixture();f.source_as_of="2026-05-06T19:00:00-04:00";f.spy.partial_session=false;
  assert.equal(api.compare(live,f).spy.available,true);
});
test("cash unavailable never becomes zero return and does not suppress SPY", () => {
  assert.equal(typeof api.compare,"function");
  const f=fixture();f.cash.observations=[];
  const out=api.compare(live,f);assert.equal(out.cash.available,false);assert.equal(out.cash.return_pct,null);
  assert.equal(out.excess_return_pp,null);assert.equal(out.spy.available,true);
});
