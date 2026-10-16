"use strict";

const CorePeriodResearch = (() => {
  const PERIOD_IDS = ["2024_2026", "2025_2026", "2023_2026"];
  const SCENARIO_IDS = ["C", "A", "B"];
  const sha256 = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

  function assert(condition, code) {
    if (!condition) throw new Error(code);
  }

  function validatePayload(payload) {
    assert(payload && payload.schema_version === 1 &&
      payload.classification === "INDEPENDENT_FRESH_CORE_PERIOD_REPLAYS" &&
      payload.independent_verification === "PASS", "period_payload_certificate_invalid");
    assert(payload.default_period === "2024_2026" && payload.common_comparison_end === "2026-09-21" &&
      payload.candidate_end === "2026-09-22", "period_payload_endpoint_invalid");
    assert(Array.isArray(payload.periods) && payload.periods.length === PERIOD_IDS.length &&
      PERIOD_IDS.every((id, index) => payload.periods[index]?.id === id), "period_payload_period_set_invalid");

    for (const period of payload.periods) {
      assert(period.start && period.candidate_end === payload.candidate_end &&
        period.comparison_end === payload.common_comparison_end && period.starting_equity === 10000 &&
        Number.isInteger(period.candidate_sessions) && Number.isInteger(period.eligible_sessions) &&
        period.eligible_sessions > 0 && period.candidate_sessions >= period.eligible_sessions,
      "period_metadata_invalid");
      const curves = period.equity_curves;
      assert(curves && Array.isArray(curves.dates) && curves.dates.length > 1 &&
        curves.dates[0] === period.start && curves.dates.at(-1) === period.comparison_end &&
        curves.basis.includes("not intraday mark-to-market"), "period_curve_dates_invalid");
      const labels = curves.dates;
      const times = labels.map(value => Date.parse(value + "T00:00:00Z"));
      assert(times.every((value, index) => Number.isFinite(value) && (!index || value > times[index - 1])),
        "period_curve_dates_not_increasing");
      const gapSet = new Set(period.gap_dates);
      assert(JSON.stringify(curves.dates.filter((_, index) =>
        [curves.scenario_a, curves.scenario_b, curves.scenario_c][0][index] === null)) ===
        JSON.stringify(period.gap_dates), "period_gap_index_invalid");
      for (const key of ["scenario_a", "scenario_b", "scenario_c", "risk_free_cash", "adjusted_spy_buy_hold"]) {
        assert(Array.isArray(curves[key]) && curves[key].length === labels.length, "period_curve_length_invalid");
      }
      const benchmark = period.benchmarks;
      const benchmarksAvailable = benchmark?.available === true;
      for (const key of ["risk_free_cash", "adjusted_spy_buy_hold"]) {
        assert(benchmarksAvailable
          ? curves[key].every(value => Number.isFinite(value) && value > 0)
          : curves[key].every(value => value === null), "period_benchmark_curve_invalid");
      }
      const metrics = new Map(period.scenarios.map(row => [row.id, row]));
      assert(period.scenarios.length === 3 && SCENARIO_IDS.every(id => metrics.has(id)), "period_scenarios_invalid");
      const curveByScenario = {C:curves.scenario_c, A:curves.scenario_a, B:curves.scenario_b};
      for (const id of SCENARIO_IDS) {
        const scenario = metrics.get(id), values = curveByScenario[id];
        assert(Number.isInteger(scenario.trades) && scenario.trades >= 0 &&
          Number.isInteger(scenario.eligible_sessions) && scenario.eligible_sessions === period.eligible_sessions &&
          [scenario.gross_pnl, scenario.net_pnl, scenario.net_expectancy_per_trade,
            scenario.maximum_drawdown_dollars, scenario.ending_equity, scenario.cumulative_return_pct,
            scenario.assumed_slippage_cost, scenario.assumed_fees].every(Number.isFinite) &&
          (scenario.net_profit_factor === null || Number.isFinite(scenario.net_profit_factor)) &&
          (scenario.win_rate_pct === null || Number.isFinite(scenario.win_rate_pct)), "period_scenario_metrics_invalid");
        assert(Math.abs(scenario.ending_equity - (period.starting_equity + scenario.net_pnl)) <= 0.011 &&
          Math.abs(scenario.cumulative_return_pct - 100 * (scenario.ending_equity / period.starting_equity - 1)) < 1e-7,
        "period_scenario_return_invalid");
        assert(Array.isArray(scenario.expectancy_ci_95) && scenario.expectancy_ci_95.length === 2 &&
          scenario.expectancy_ci_95.every(Number.isFinite) && scenario.expectancy_ci_95[0] <= scenario.expectancy_ci_95[1],
        "period_scenario_interval_invalid");
        let prior = period.starting_equity, total = 0;
        const curveYearly = new Map();
        values.forEach((value, index) => {
          const shouldGap = gapSet.has(labels[index]);
          assert(shouldGap ? value === null : Number.isFinite(value) && value > 0,
            "period_scenario_point_invalid");
          if (value === null) return;
          const change = value - prior;
          total += change;
          const year = labels[index].slice(0,4);
          curveYearly.set(year,(curveYearly.get(year)||0)+change);
          prior = value;
        });
        assert(Math.abs(prior - scenario.ending_equity) <= 0.011 && Math.abs(total - scenario.net_pnl) <= 0.011,
          "period_curve_reconciliation_failed");
        for (const annual of period.yearly_net_pnl) {
          assert(Math.abs((curveYearly.get(String(annual.year))||0)-annual[id])<=0.011,
            "period_daily_curve_annual_reconciliation_failed");
        }
      }
      assert(benchmark && benchmark.starting_equity === 10000 &&
        Math.abs(benchmark.scenario_c_return_pct - metrics.get("C").cumulative_return_pct) < 1e-7,
      "period_benchmark_returns_invalid");
      if (benchmarksAvailable) {
        assert(typeof benchmark.base_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(benchmark.base_date) &&
          Number.isFinite(Date.parse(benchmark.base_date + "T00:00:00Z")) &&
          Date.parse(benchmark.base_date + "T00:00:00Z") < Date.parse(period.start + "T00:00:00Z") &&
          [benchmark.risk_free_cash_return_pct,benchmark.adjusted_spy_buy_hold_return_pct,
            benchmark.excess_return_over_cash_pp].every(Number.isFinite) &&
          Math.abs(benchmark.risk_free_cash_return_pct - (100 * (curves.risk_free_cash.at(-1) / 10000 - 1))) < 1e-7 &&
          Math.abs(benchmark.adjusted_spy_buy_hold_return_pct - (100 * (curves.adjusted_spy_buy_hold.at(-1) / 10000 - 1))) < 1e-7 &&
          Math.abs(benchmark.excess_return_over_cash_pp -
            (benchmark.scenario_c_return_pct - benchmark.risk_free_cash_return_pct)) < 1e-7,
        "period_benchmark_returns_invalid");
      } else {
        assert(benchmark.base_date === null && benchmark.risk_free_cash_return_pct === null &&
          benchmark.adjusted_spy_buy_hold_return_pct === null && benchmark.excess_return_over_cash_pp === null &&
          period.limitations.some(row => row.includes("no preceding adjusted close")),
        "period_benchmark_unavailability_not_disclosed");
      }

      assert(Array.isArray(period.yearly_net_pnl) && period.yearly_net_pnl.length > 0, "period_yearly_missing");
      for (const id of ["A", "B", "C"]) {
        const field = id;
        const annual = period.yearly_net_pnl.reduce((sum, row) => sum + row[field], 0);
        assert(Math.abs(annual - metrics.get(id).net_pnl) <= 0.011, "period_yearly_reconciliation_failed");
      }
      assert(Array.isArray(period.setups) && period.setups.length === 6, "period_setup_results_invalid");
      for (const id of SCENARIO_IDS) {
        const setupRows = period.setups.map(row => row.scenarios?.[id]);
        assert(setupRows.every(Boolean) &&
          setupRows.reduce((sum, row) => sum + row.trades, 0) === metrics.get(id).trades &&
          Math.abs(setupRows.reduce((sum, row) => sum + row.net_pnl, 0) - metrics.get(id).net_pnl) <= 0.011,
        "period_setup_reconciliation_failed");
      }
      assert(period.source_sha256 && Object.values(period.source_sha256).every(sha256), "period_source_hash_invalid");
      assert(Array.isArray(period.limitations) && period.limitations.some(row => row.includes("R5VWAPB") && row.includes("enabled in production")),
        "period_live_status_disclosure_missing");
      assert(period.quote_quality_by_year && Object.keys(period.quote_quality_by_year).length > 0 &&
        Object.values(period.quote_quality_by_year).every(row => row.quote_size_depth_or_volume_available === false),
      "period_quote_quality_invalid");
    }
    return payload;
  }

  function periodView(payload, id, setupScenario = "C") {
    validatePayload(payload);
    const period = payload.periods.find(row => row.id === id);
    assert(period, "period_selection_invalid");
    assert(SCENARIO_IDS.includes(setupScenario), "setup_scenario_selection_invalid");
    const scenarioMap = Object.fromEntries(period.scenarios.map(row => [row.id, row]));
    const normalized = values => values.map(value => value === null ? null : 100 * value / 10000);
    return {
      period,
      scenarioMap,
      labels:period.equity_curves.dates,
      benchmarkDatasets:[
        {label:"CORE Scenario C",data:normalized(period.equity_curves.scenario_c)},
        ...(period.benchmarks.available ? [
          {label:"Risk-Free / Cash",data:normalized(period.equity_curves.risk_free_cash)},
          {label:"SPY Buy & Hold (adjusted)",data:normalized(period.equity_curves.adjusted_spy_buy_hold)}
        ] : [])
      ],
      portfolioDatasets:[
        {label:"CORE Scenario C",data:period.equity_curves.scenario_c},
        {label:"CORE Scenario A",data:period.equity_curves.scenario_a},
        {label:"CORE Scenario B",data:period.equity_curves.scenario_b},
        ...(period.benchmarks.available ? [
          {label:"Risk-Free / Cash",data:period.equity_curves.risk_free_cash},
          {label:"SPY Buy & Hold (adjusted)",data:period.equity_curves.adjusted_spy_buy_hold}
        ] : [])
      ],
      setups:period.setups.map(row => ({id:row.id,label:row.label,...row.scenarios[setupScenario]})),
      yearly:period.yearly_net_pnl,
      limitations:period.limitations,
      quoteQuality:period.quote_quality_by_year,
      benchmarkReturns:period.benchmarks
    };
  }

  return {validatePayload,periodView};
})();
if (typeof window !== "undefined") window.CorePeriodResearch = CorePeriodResearch;
if (typeof module !== "undefined" && module.exports) module.exports = CorePeriodResearch;
