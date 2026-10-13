const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.join(__dirname, "../algo-pnl.html"), "utf8");
const benchmarks = require("../js/live-benchmarks.js");

function liveChartBlock() {
  const start = page.indexOf('new Chart(document.getElementById("equityChart")');
  const end = page.indexOf("\n        });", start);
  assert.notEqual(start, -1, "live chart construction should remain present");
  assert.notEqual(end, -1, "live chart block should remain parseable");
  return page.slice(start, end);
}

test("live Alpaca chart disables chart animation", () => {
  assert.match(liveChartBlock(), /options:\s*\{[\s\S]*?animation:\s*false/);
});

test("live benchmark series keep a stable hover radius", () => {
  const points = [
    {date: "2026-06-24", index_value: 100},
    {date: "2026-06-25", index_value: 101}
  ];
  const source = {
    schema: "foxchase-live-benchmarks-v1",
    base_index: 100,
    source_start: points[0].date,
    source_end: points.at(-1).date,
    cash: {
      series: "UST_3MO_PAR",
      unit: "annual_percent",
      observations: [{date: "2026-06-23", annual_yield_pct: 4}]
    },
    spy: {
      adjustment: "all",
      feed: "sip",
      session_dates: points.map(point => point.date),
      prices: points.map((point, index) => ({date: point.date, close: 600 + index})),
      partial_session: false
    },
    source_as_of: "2026-06-25T20:00:00-04:00"
  };
  const live = {
    points,
    updated_at: "2026-06-25T20:00:00-04:00",
    canonical_metrics: {
      performance: {
        inception_date: points[0].date,
        as_of_date: points.at(-1).date,
        since_inception_return_pct: 1
      }
    }
  };
  const datasets = benchmarks.compare(live, source).datasets;
  assert.deepEqual(datasets.map(dataset => dataset.pointHoverRadius), [2, 0, 0]);
});
