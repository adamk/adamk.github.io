"use strict";

const CorePeriodResearch = (() => {
  const PERIOD_IDS = ["2024_2026", "2025_2026", "2023_2026"];
  const COMPARISON_IDS = ["natural_nbbo", "natural_nbbo_plus_slippage"];
  const DISPLAY_NAMES = {
    natural_nbbo:"Natural NBBO",
    natural_nbbo_plus_slippage:"Natural NBBO + $0.01 Slippage"
  };
  const sha256 = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

  function assert(condition, code) {
    if (!condition) throw new Error(code);
  }

  function validatePayload(payload) {
    assert(payload && payload.schema_version === 3 &&
      payload.classification === "INDEPENDENT_FRESH_CORE_PERIOD_REPLAYS_WITH_RETROSPECTIVE_ALPACA_FEE_APPROXIMATION" &&
      payload.independent_verification === "PASS", "period_payload_certificate_invalid");
    assert(Array.isArray(payload.execution_comparisons) && payload.execution_comparisons.length === 2 &&
      payload.execution_comparisons.every((row,index) => row.id === COMPARISON_IDS[index] &&
        row.label === DISPLAY_NAMES[row.id]), "period_comparison_names_invalid");
    assert(typeof payload.comparison_methodology === "string" &&
      payload.comparison_methodology.includes("same historical trades and contract quantities") &&
      payload.comparison_methodology.includes("does not model how lower equity could change later position sizing or order eligibility") &&
      payload.comparison_methodology.includes("not a full live broker execution simulation"),
    "fixed_trade_slippage_methodology_missing");

    const feeModel = payload.fee_model;
    assert(feeModel && typeof feeModel.commission === "string" && feeModel.commission.includes("$0") &&
      typeof feeModel.aggregation === "string" && feeModel.aggregation.includes("account-day") &&
      feeModel.aggregation.includes("rounded up") &&
      typeof feeModel.historical_classification === "string" && feeModel.historical_classification.includes("retrospective approximation"),
    "period_fee_model_disclosure_invalid");
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
      for (const key of [...COMPARISON_IDS,"risk_free_cash","adjusted_spy_buy_hold"]) {
        assert(Array.isArray(curves[key]) && curves[key].length === labels.length, "period_curve_length_invalid");
      }
      assert(JSON.stringify(curves.dates.filter((_,index)=>curves[COMPARISON_IDS[0]][index]===null)) ===
        JSON.stringify(period.gap_dates) &&
        JSON.stringify(curves.dates.filter((_,index)=>curves[COMPARISON_IDS[1]][index]===null)) ===
        JSON.stringify(period.gap_dates), "period_gap_index_invalid");

      const benchmark = period.benchmarks;
      const benchmarksAvailable = benchmark?.available === true;
      for (const key of ["risk_free_cash","adjusted_spy_buy_hold"]) {
        assert(benchmarksAvailable
          ? curves[key].every(value => Number.isFinite(value) && value > 0)
          : curves[key].every(value => value === null), "period_benchmark_curve_invalid");
      }
      const metrics = new Map(period.comparisons.map(row => [row.id,row]));
      assert(period.comparisons.length === COMPARISON_IDS.length &&
        COMPARISON_IDS.every((id,index)=>metrics.has(id) && period.comparisons[index].label===DISPLAY_NAMES[id]),
      "period_comparisons_invalid");
      const natural = metrics.get(COMPARISON_IDS[0]);
      const slipped = metrics.get(COMPARISON_IDS[1]);
      assert(natural.trades === slipped.trades && natural.average_quantity === slipped.average_quantity &&
        natural.eligible_sessions === slipped.eligible_sessions && natural.assumed_slippage_cost === 0 &&
        slipped.assumed_slippage_cost > 0, "fixed_trade_comparison_mismatch");

      for (const id of COMPARISON_IDS) {
        const comparison = metrics.get(id), values = curves[id];
        assert(Number.isInteger(comparison.trades) && comparison.trades >= 0 &&
          Number.isInteger(comparison.eligible_sessions) && comparison.eligible_sessions === period.eligible_sessions &&
          [comparison.gross_pnl,comparison.net_pnl,comparison.net_expectancy_per_trade,
            comparison.maximum_drawdown_dollars,comparison.ending_equity,comparison.cumulative_return_pct,
            comparison.assumed_slippage_cost,comparison.assumed_fees].every(Number.isFinite) &&
          (comparison.net_profit_factor === null || Number.isFinite(comparison.net_profit_factor)) &&
          (comparison.win_rate_pct === null || Number.isFinite(comparison.win_rate_pct)), "period_comparison_metrics_invalid");
        assert(Math.abs(comparison.ending_equity-(period.starting_equity+comparison.net_pnl)) <= 0.011 &&
          Math.abs(comparison.cumulative_return_pct-100*(comparison.ending_equity/period.starting_equity-1)) < 1e-7,
        "period_comparison_return_invalid");
        assert(Array.isArray(comparison.expectancy_ci_95) && comparison.expectancy_ci_95.length === 2 &&
          comparison.expectancy_ci_95.every(Number.isFinite) && comparison.expectancy_ci_95[0] <= comparison.expectancy_ci_95[1],
        "period_comparison_interval_invalid");
        let prior = period.starting_equity, total = 0;
        const curveYearly = new Map();
        values.forEach((value,index) => {
          const shouldGap = gapSet.has(labels[index]);
          assert(shouldGap ? value === null : Number.isFinite(value) && value > 0,
            "period_comparison_point_invalid");
          if (value === null) return;
          const change = value-prior;
          total += change;
          const year = labels[index].slice(0,4);
          curveYearly.set(year,(curveYearly.get(year)||0)+change);
          prior = value;
        });
        assert(Math.abs(prior-comparison.ending_equity) <= 0.011 && Math.abs(total-comparison.net_pnl) <= 0.011,
          "period_curve_reconciliation_failed");
        for (const annual of period.yearly_net_pnl) {
          assert(Math.abs((curveYearly.get(String(annual.year))||0)-annual[id])<=0.011,
            "period_daily_curve_annual_reconciliation_failed");
        }
      }
      assert(benchmark && benchmark.starting_equity === 10000 &&
        benchmark.comparison_returns_pct && COMPARISON_IDS.every(id =>
          Math.abs(benchmark.comparison_returns_pct[id]-metrics.get(id).cumulative_return_pct) < 1e-7),
      "period_benchmark_returns_invalid");
      if (benchmarksAvailable) {
        assert(benchmark.excess_return_over_cash_pp_by_comparison &&
          COMPARISON_IDS.every(id => Number.isFinite(benchmark.excess_return_over_cash_pp_by_comparison[id]) &&
            Math.abs(benchmark.excess_return_over_cash_pp_by_comparison[id]-
              (benchmark.comparison_returns_pct[id]-benchmark.risk_free_cash_return_pct)) < 1e-7),
        "period_comparison_benchmark_returns_invalid");
        assert(typeof benchmark.base_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(benchmark.base_date) &&
          Number.isFinite(Date.parse(benchmark.base_date+"T00:00:00Z")) &&
          Date.parse(benchmark.base_date+"T00:00:00Z") < Date.parse(period.start+"T00:00:00Z") &&
          [benchmark.risk_free_cash_return_pct,benchmark.adjusted_spy_buy_hold_return_pct].every(Number.isFinite) &&
          Math.abs(benchmark.risk_free_cash_return_pct-(100*(curves.risk_free_cash.at(-1)/10000-1))) < 1e-7 &&
          Math.abs(benchmark.adjusted_spy_buy_hold_return_pct-(100*(curves.adjusted_spy_buy_hold.at(-1)/10000-1))) < 1e-7,
        "period_benchmark_returns_invalid");
      } else {
        assert(benchmark.base_date === null && benchmark.risk_free_cash_return_pct === null &&
          benchmark.adjusted_spy_buy_hold_return_pct === null &&
          COMPARISON_IDS.every(id=>benchmark.excess_return_over_cash_pp_by_comparison[id]===null) &&
          period.limitations.some(row=>row.includes("no preceding adjusted close")),
        "period_benchmark_unavailability_not_disclosed");
      }

      assert(Array.isArray(period.yearly_net_pnl) && period.yearly_net_pnl.length > 0, "period_yearly_missing");
      for (const id of COMPARISON_IDS) {
        const annual = period.yearly_net_pnl.reduce((sum,row)=>sum+row[id],0);
        assert(Math.abs(annual-metrics.get(id).net_pnl) <= 0.011, "period_yearly_reconciliation_failed");
      }
      assert(Array.isArray(period.setups) && period.setups.length === 6, "period_setup_results_invalid");
      for (const id of COMPARISON_IDS) {
        const setupRows = period.setups.map(row=>row.comparisons?.[id]);
        assert(setupRows.every(Boolean) &&
          setupRows.reduce((sum,row)=>sum+row.trades,0)===metrics.get(id).trades &&
          Math.abs(setupRows.reduce((sum,row)=>sum+row.net_pnl,0)-metrics.get(id).net_pnl)<=0.011,
        "period_setup_reconciliation_failed");
      }
      assert(period.source_sha256 && Object.values(period.source_sha256).every(sha256), "period_source_hash_invalid");
      assert(Array.isArray(period.limitations) && period.limitations.some(row=>row.includes("R5VWAPB") && row.includes("enabled in production")) &&
        period.limitations.some(row=>row.includes("same historical trades and contract quantities") &&
          row.includes("does not simulate how lower equity could change later position sizing")),
      "period_disclosure_missing");
      assert(period.quote_quality_by_year && Object.keys(period.quote_quality_by_year).length > 0 &&
        Object.values(period.quote_quality_by_year).every(row=>row.quote_size_depth_or_volume_available===false),
      "period_quote_quality_invalid");
    }
    return payload;
  }

  function periodView(payload, id, setupComparisonId = COMPARISON_IDS[1], benchmarkComparisonId = COMPARISON_IDS[1]) {
    validatePayload(payload);
    const period = payload.periods.find(row => row.id === id);
    assert(period, "period_selection_invalid");
    assert(COMPARISON_IDS.includes(setupComparisonId), "setup_comparison_selection_invalid");
    assert(COMPARISON_IDS.includes(benchmarkComparisonId), "benchmark_comparison_selection_invalid");
    const comparisonMap = Object.fromEntries(period.comparisons.map(row=>[row.id,row]));
    const normalized = values=>values.map(value=>value===null?null:100*value/10000);
    const label = comparisonId=>"CORE — "+DISPLAY_NAMES[comparisonId];
    return {
      period,comparisonMap,labels:period.equity_curves.dates,
      benchmarkDatasets:[
        {label:label(benchmarkComparisonId),data:normalized(period.equity_curves[benchmarkComparisonId])},
        ...(period.benchmarks.available?[
          {label:"Risk-Free / Cash",data:normalized(period.equity_curves.risk_free_cash)},
          {label:"SPY Buy & Hold (adjusted)",data:normalized(period.equity_curves.adjusted_spy_buy_hold)}
        ]:[])
      ],
      portfolioDatasets:[
        {label:label(COMPARISON_IDS[0]),data:period.equity_curves[COMPARISON_IDS[0]]},
        {label:label(COMPARISON_IDS[1]),data:period.equity_curves[COMPARISON_IDS[1]]},
        ...(period.benchmarks.available?[
          {label:"Risk-Free / Cash",data:period.equity_curves.risk_free_cash},
          {label:"SPY Buy & Hold (adjusted)",data:period.equity_curves.adjusted_spy_buy_hold}
        ]:[])
      ],
      setups:period.setups.map(row=>({id:row.id,label:row.label,...row.comparisons[setupComparisonId]})),
      yearly:period.yearly_net_pnl,limitations:period.limitations,quoteQuality:period.quote_quality_by_year,
      benchmarkReturns:period.benchmarks,
      selectedBenchmark:{
        id:benchmarkComparisonId,label:label(benchmarkComparisonId),
        return_pct:period.benchmarks.comparison_returns_pct[benchmarkComparisonId],
        cash_return_pct:period.benchmarks.risk_free_cash_return_pct,
        excess_return_over_cash_pp:period.benchmarks.excess_return_over_cash_pp_by_comparison[benchmarkComparisonId],
        adjusted_spy_return_pct:period.benchmarks.adjusted_spy_buy_hold_return_pct
      }
    };
  }

  return {validatePayload,periodView,COMPARISON_IDS,DISPLAY_NAMES};
})();
if (typeof window !== "undefined") window.CorePeriodResearch = CorePeriodResearch;
if (typeof module !== "undefined" && module.exports) module.exports = CorePeriodResearch;
