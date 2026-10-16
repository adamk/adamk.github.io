"use strict";

// Market-data comparisons only. Never modifies the canonical live payload.
const FoxchaseBenchmarks = (() => {
  const DAY = 86400000;
  function day(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid_date");
    const time = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw new Error("invalid_date");
    return time;
  }
  function dates(values) {
    if (!Array.isArray(values) || !values.length) throw new Error("dates_missing");
    const times = values.map(day);
    if (times.some((t,i) => i && t <= times[i-1])) throw new Error("dates_not_increasing");
    return times;
  }
  function cashSeries(labels, observations) {
    const times = dates(labels);
    if (!Array.isArray(observations) || !observations.length) throw new Error("cash_rates_missing");
    const rates = observations.map(row => {
      if (typeof row.annual_yield_pct !== "number" || !Number.isFinite(row.annual_yield_pct) ||
          row.annual_yield_pct < -5 || row.annual_yield_pct > 30) throw new Error("cash_rate_invalid");
      return {time:day(row.date),rate:row.annual_yield_pct / 100 / 365};
    });
    if (rates.some((r,i) => i && r.time <= rates[i-1].time)) throw new Error("cash_dates_not_increasing");
    let cursor = -1, index = 100, nextPoint = 1;
    const result = [100];
    // Each interval [d,d+1) uses the last observation strictly before d.
    // Weekends/holidays accrue, but a rate older than 7 calendar days is refused.
    for (let time=times[0]; time<times.at(-1); time+=DAY) {
      while (cursor+1<rates.length && rates[cursor+1].time<time) cursor++;
      if (cursor < 0) throw new Error("cash_initial_rate_missing");
      if (time-rates[cursor].time > 7*DAY) throw new Error("cash_rate_stale");
      index *= 1 + rates[cursor].rate;
      if (time+DAY === times[nextPoint]) { result.push(index); nextPoint++; }
    }
    return result;
  }
  function spySeries(labels, source) {
    const times = dates(labels);
    if (!source || source.adjustment !== "all" || source.feed !== "sip" ||
        !Array.isArray(source.session_dates) || !Array.isArray(source.prices)) throw new Error("spy_source_invalid");
    dates(source.session_dates);
    const sessions = new Set(source.session_dates);
    const prices = source.prices.map(row => {
      if (typeof row.close !== "number" || !Number.isFinite(row.close) || row.close<=0) throw new Error("spy_price_invalid");
      return {date:row.date,time:day(row.date),close:row.close};
    });
    if (prices.some((r,i) => i && r.time <= prices[i-1].time)) throw new Error("spy_dates_not_increasing");
    const map = new Map(prices.map(row=>[row.date,row]));
    // An absent trading-session quote must never be treated as a holiday.
    for (const date of source.session_dates) {
      if (day(date)>=times[0] && day(date)<=times.at(-1) && !map.has(date)) throw new Error("spy_session_quote_missing");
    }
    const base = map.get(labels[0]);
    if (!base) throw new Error("spy_start_quote_missing");
    let cursor = 0;
    return labels.map((label,i) => {
      while (cursor+1<prices.length && prices[cursor+1].time<=times[i]) cursor++;
      const quote = prices[cursor];
      if (!quote || quote.time>times[i] || times[i]-quote.time>4*DAY || (sessions.has(label)&&quote.date!==label)) {
        throw new Error("spy_quote_missing");
      }
      return i === 0 ? 100 : 100 * quote.close / base.close;
    });
  }
  const missing = reason => ({available:false,reason,values:null,return_pct:null});
  function compare(live, source) {
    const points = Array.isArray(live && live.points) ? live.points : [];
    const labels = points.map(p=>p.date);
    let cash = missing("benchmark_source_unavailable"), spy = missing("benchmark_source_unavailable");
    let strategyReturn = null;
    try {
      dates(labels);
      if (points[0].index_value !== 100 || points.some(p=>typeof p.index_value!=="number"||!Number.isFinite(p.index_value)||p.index_value<=0)) {
        throw new Error("live_index_invalid");
      }
      const performance = live.canonical_metrics && live.canonical_metrics.performance;
      strategyReturn = performance && performance.since_inception_return_pct;
      if (!Number.isFinite(strategyReturn) || Math.abs(strategyReturn-(points.at(-1).index_value-100))>1e-6 ||
          performance.inception_date!==labels[0] || performance.as_of_date!==labels.at(-1)) throw new Error("live_period_inconsistent");
      if (!source || source.schema!=="foxchase-live-benchmarks-v1" || source.base_index!==100 ||
          source.source_start!==labels[0] || source.source_end!==labels.at(-1)) throw new Error("benchmark_period_mismatch");
      try {
        if (!source.cash || source.cash.series!=="UST_3MO_PAR" || source.cash.unit!=="annual_percent") throw new Error("cash_source_invalid");
        const values = cashSeries(labels,source.cash.observations);
        cash = {available:true,reason:null,values,return_pct:values.at(-1)-100};
      } catch (error) { cash = missing(error.message); }
      try {
        const captured = Date.parse(source.source_as_of), liveCaptured = Date.parse(live.updated_at);
        if (!Number.isFinite(captured) || !Number.isFinite(liveCaptured) || captured > liveCaptured ||
            (source.spy.partial_session && source.source_as_of!==live.updated_at)) throw new Error("spy_snapshot_mismatch");
        const values = spySeries(labels,source.spy);
        spy = {available:true,reason:null,values,return_pct:values.at(-1)-100};
      } catch (error) { spy = missing(error.message); }
    } catch (error) { cash = missing(error.message); spy = missing(error.message); }
    return {
      labels, strategy_return_pct:strategyReturn, cash, spy,
      excess_return_pp:cash.available&&Number.isFinite(strategyReturn) ? strategyReturn-cash.return_pct : null,
      datasets:[
        {label:"Foxchase Algo",data:points.map(p=>p.index_value),borderColor:"#f4c430",backgroundColor:"rgba(244, 196, 48, 0.18)",borderWidth:3,pointRadius:2,pointHoverRadius:2,tension:0.25},
        {label:"Risk-Free / Cash",data:cash.values||labels.map(()=>null),borderColor:"#087f8c",borderWidth:3,pointRadius:0,pointHoverRadius:0,tension:0},
        {label:"SPY Buy & Hold",data:spy.values||labels.map(()=>null),borderColor:"#666666",borderWidth:2,borderDash:[6,4],pointRadius:0,pointHoverRadius:0,tension:0}
      ]
    };
  }
  function coreSlippageComparison(curves, study, spySource, cashSource, sourceDigests) {
    const fail = message => { throw new Error(message); };
    const period = curves && curves.period, studyPeriod = study && study.period;
    if (!period || !studyPeriod || curves.schema_version !== 1 ||
        curves.classification !== "MODELED_CORE_CLOSED_TRADE_EQUITY" ||
        curves.currency !== "USD" ||
        !String(curves.curve_basis || "").includes("not intraday mark-to-market") ||
        study.schema_version !== 1 || study.classification !== "MODELED_CORE_SLIPPAGE_REPLAY" ||
        study.independent_verification !== "PASS") fail("core_curve_certificate_invalid");
    const pinnedHashes = curves.source_sha256;
    const digestFields = ["scenario_summary", "adjusted_spy", "historical_cash"];
    if (!pinnedHashes || !sourceDigests || digestFields.some(field =>
        !/^[a-f0-9]{64}$/.test(pinnedHashes[field] || "") ||
        sourceDigests[field] !== pinnedHashes[field])) fail("core_source_digest_mismatch");
    const start = studyPeriod.start, candidateEnd = studyPeriod.end, comparisonEnd = curves.comparison_end;
    if (period.start !== start || period.candidate_end !== candidateEnd ||
        period.candidate_sessions !== studyPeriod.candidate_sessions ||
        period.admitted_sessions !== studyPeriod.admitted_sessions ||
        period.starting_equity !== 10000 || studyPeriod.starting_equity !== 10000 ||
        candidateEnd !== "2026-09-22" || comparisonEnd !== "2026-09-21") fail("core_curve_period_mismatch");
    const labels = curves.dates;
    dates(labels);
    if (labels[0] !== start || labels.at(-1) !== comparisonEnd ||
        labels.length !== 931 || !Array.isArray(curves.not_evaluable_dates) ||
        JSON.stringify(curves.not_evaluable_dates) !== JSON.stringify(["2023-06-05","2023-10-19","2026-08-26","2026-09-22"]) ||
        JSON.stringify(curves.gap_dates) !== JSON.stringify(["2023-06-05","2023-10-19","2026-08-26"])) {
      fail("core_curve_dates_or_gaps_invalid");
    }
    if (!spySource || spySource.status !== "VERIFIED_ADJUSTED_BENCHMARKS" ||
        spySource.initial_value !== 10000 || spySource.adjustment !== "split_and_dividend" ||
        spySource.normalization !== "starting_adjusted_close" ||
        spySource.start !== start || spySource.end !== candidateEnd ||
        !Array.isArray(spySource.daily) || spySource.daily.length !== period.candidate_sessions) {
      fail("core_spy_source_invalid");
    }
    const candidateDates = spySource.daily.map(row => row.date);
    dates(candidateDates);
    if (candidateDates[0] !== start || candidateDates.at(-1) !== candidateEnd ||
        JSON.stringify(candidateDates.slice(0, labels.length)) !== JSON.stringify(labels) ||
        candidateDates[labels.length] !== candidateEnd) fail("core_spy_dates_mismatch");
    const spyByDate = new Map(spySource.daily.map(row => [row.date, row.SPY]));
    const spyStart = spyByDate.get(start);
    if (!Number.isFinite(spyStart) || spyStart <= 0) fail("core_spy_start_invalid");
    for (const date of labels) {
      const value = spyByDate.get(date);
      if (!Number.isFinite(value) || value <= 0) fail("core_spy_session_missing");
    }
    if (!cashSource || cashSource.schema !== "foxchase-historical-cash-v1" ||
        cashSource.base_index !== 100 || cashSource.source_start !== start ||
        cashSource.source_end !== candidateEnd ||
        cashSource.cash?.series !== "UST_3MO_PAR" || cashSource.cash?.unit !== "annual_percent") {
      fail("core_cash_source_invalid");
    }
    const cashIndex = cashSeries(labels, cashSource.cash.observations);
    if (cashIndex.length !== labels.length || cashIndex[0] !== 100 ||
        cashIndex.some(value => !Number.isFinite(value) || value <= 0)) fail("core_cash_series_invalid");

    const studyRows = Array.isArray(study.scenarios) ? study.scenarios : [];
    const curveRows = Array.isArray(curves.scenarios) ? curves.scenarios : [];
    const studyScenarios = new Map(studyRows.map(row => [row.id, row]));
    const curveScenarios = new Map(curveRows.map(row => [row.id, row]));
    const years = ["2023","2024","2025","2026"];
    if (studyRows.length !== 3 || curveRows.length !== 3 ||
        studyScenarios.size !== 3 || curveScenarios.size !== 3 ||
        !Array.isArray(study.yearly) || study.yearly.length !== years.length ||
        study.yearly.some((row, index) => String(row.label).slice(0,4) !== years[index] ||
          !["a_net_pnl","b_net_pnl","c_net_pnl"].every(field => Number.isFinite(row[field]))) ||
        ["C","A","B"].some(id => !studyScenarios.has(id) || !curveScenarios.has(id))) {
      fail("core_scenario_set_invalid");
    }
    const labelById = {C:"CORE Scenario C", A:"CORE Scenario A", B:"CORE Scenario B"};
    const valuesById = {};
    for (const id of ["C","A","B"]) {
      const stats = studyScenarios.get(id), scenario = curveScenarios.get(id);
      if (scenario.label !== labelById[id] && scenario.label !== stats.label) fail("core_scenario_label_invalid");
      if (!Number.isInteger(stats.trades) || !Number.isFinite(stats.net_pnl) ||
          !Number.isFinite(stats.maximum_drawdown_dollars) || !Number.isFinite(stats.net_profit_factor) ||
          !Number.isInteger(scenario.trade_count) || scenario.trade_count !== stats.trades ||
          !Number.isFinite(scenario.net_pnl) || !Number.isFinite(scenario.ending_equity) ||
          !Number.isFinite(scenario.maximum_drawdown_dollars) || !Number.isFinite(scenario.net_profit_factor) ||
          Math.abs(scenario.net_pnl - stats.net_pnl) > 0.011 ||
          Math.abs(scenario.ending_equity - (10000 + stats.net_pnl)) > 0.011 ||
          Math.abs(scenario.maximum_drawdown_dollars - stats.maximum_drawdown_dollars) > 0.011 ||
          Math.abs(scenario.net_profit_factor - stats.net_profit_factor) > 0.00015 ||
          !Array.isArray(scenario.daily) || scenario.daily.length !== labels.length) {
        fail("core_scenario_summary_mismatch");
      }
      let prior = 10000, peak = prior, worstDrawdown = 0;
      const yearly = new Map();
      const values = [];
      for (let index = 0; index < labels.length; index++) {
        const point = scenario.daily[index], expectedDate = labels[index];
        if (!point || point.date !== expectedDate) fail("core_scenario_dates_mismatch");
        const shouldGap = curves.gap_dates.includes(expectedDate);
        if (shouldGap) {
          if (point.equity !== null) fail("core_scenario_gap_was_filled");
          values.push(null);
          continue;
        }
        if (typeof point.equity !== "number" || !Number.isFinite(point.equity) || point.equity <= 0 ||
            (index === 0 && point.equity !== 10000)) {
          fail("core_scenario_equity_invalid");
        }
        const change = point.equity - prior;
        const year = expectedDate.slice(0,4);
        yearly.set(year, (yearly.get(year) || 0) + change);
        prior = point.equity;
        peak = Math.max(peak, point.equity);
        worstDrawdown = Math.min(worstDrawdown, point.equity - peak);
        values.push(point.equity);
      }
      if (Math.abs(prior - scenario.ending_equity) > 0.011 ||
          Math.abs(worstDrawdown - stats.maximum_drawdown_dollars) > 0.011) fail("core_scenario_equity_reconciliation_failed");
      for (const row of study.yearly || []) {
        const year = String(row.label).slice(0,4), field = id.toLowerCase() + "_net_pnl";
        if (Math.abs((yearly.get(year) || 0) - row[field]) > 0.011) fail("core_scenario_yearly_reconciliation_failed");
      }
      valuesById[id] = values;
    }
    const spyUsd = labels.map(date => 10000 * spyByDate.get(date) / spyStart);
    const cashUsd = cashIndex.map(value => 10000 * value / 100);
    const toIndex = values => values.map(value => value === null ? null : 100 * value / 10000);
    const cEquity = valuesById.C.at(-1);
    const cEnd = cEquity;
    const strategyReturn = 100 * (cEnd / 10000 - 1);
    const cashReturn = cashIndex.at(-1) - 100;
    const spyReturn = 100 * (spyUsd.at(-1) / 10000 - 1);
    const benchmarkDatasets = [
      {label:labelById.C, data:toIndex(valuesById.C)},
      {label:"Risk-Free / Cash", data:toIndex(cashUsd)},
      {label:"SPY Buy & Hold (adjusted)", data:toIndex(spyUsd)},
    ];
    const portfolioDatasets = [
      {label:labelById.C, data:valuesById.C},
      {label:labelById.A, data:valuesById.A},
      {label:labelById.B, data:valuesById.B},
      {label:"Risk-Free / Cash", data:cashUsd},
      {label:"SPY Buy & Hold (adjusted)", data:spyUsd},
    ];
    return {
      labels, candidate_end:candidateEnd, comparison_end:comparisonEnd,
      gap_dates:curves.gap_dates, strategy_return_pct:strategyReturn,
      cash_return_pct:cashReturn, excess_return_pp:strategyReturn-cashReturn,
      spy_return_pct:spyReturn, benchmark_datasets:benchmarkDatasets,
      portfolio_datasets:portfolioDatasets,
    };
  }
  function historicalComparison(data, source) {
    const labels = data && data.dates;
    dates(labels);
    const names = ["Foxchase Intraday","Foxchase Multi-Day","Foxchase Combined","SPY Buy & Hold"];
    if (data.initial_value !== 10000 || data.comparison_start !== labels[0] || data.study_end !== labels.at(-1) ||
        !Array.isArray(data.series) || data.series.length !== names.length ||
        new Set(data.series.map(s=>s.label)).size !== names.length) throw new Error("historical_period_invalid");
    for (const series of data.series) {
      const end = labels.indexOf(series.validated_through);
      if (!names.includes(series.label) || end<0 || !Array.isArray(series.values) ||
          series.values.length !== labels.length || series.values[0] !== data.initial_value ||
          series.values.some((value,i)=>i<=end ? typeof value!=="number"||!Number.isFinite(value)||value<=0 : value!==null)) {
        throw new Error("historical_series_invalid");
      }
    }
    let cash = missing("historical_cash_unavailable");
    try {
      if (!source || source.schema!=="foxchase-historical-cash-v1" || source.base_index!==100 ||
          source.source_start!==labels[0] || source.source_end!==labels.at(-1) ||
          source.cash?.series!=="UST_3MO_PAR" || source.cash.unit!=="annual_percent") throw new Error("historical_cash_source_invalid");
      const values = cashSeries(labels,source.cash.observations);
      cash = {available:true,reason:null,values,return_pct:values.at(-1)-100};
    } catch (error) { cash = missing(error.message); }
    const spy = data.series.find(s=>s.label==="SPY Buy & Hold");
    const rows = data.series.filter(s=>s.label!==spy.label).map(series=>{
      const end = labels.indexOf(series.validated_through);
      const strategyReturn = (series.values[end]/data.initial_value-1)*100;
      const cashReturn = cash.available ? cash.values[end]-100 : null;
      if (typeof spy.values[end]!=="number") throw new Error("historical_spy_endpoint_missing");
      return {label:series.label,start:labels[0],end:series.validated_through,
        strategy_return_pct:strategyReturn,cash_return_pct:cashReturn,
        excess_return_pp:cashReturn===null ? null : strategyReturn-cashReturn,
        spy_return_pct:(spy.values[end]/data.initial_value-1)*100};
    });
    const intraday = data.series.find(s=>s.label==="Foxchase Intraday");
    return {labels,cash,rows,datasets:[
      {label:"Foxchase Intraday",data:intraday.values.map(value=>value===null?null:100*value/data.initial_value),borderColor:"#234a76",borderWidth:3,pointRadius:0,tension:0},
      {label:"Risk-Free / Cash",data:cash.values||labels.map(()=>null),borderColor:"#087f8c",borderWidth:3,pointRadius:0,tension:0},
      {label:"SPY Buy & Hold",data:spy.values.map(value=>100*value/data.initial_value),borderColor:"#666666",borderWidth:2,borderDash:[6,4],pointRadius:0,tension:0}
    ]};
  }
  return {cashSeries,spySeries,compare,coreSlippageComparison,historicalComparison};
})();
if (typeof module !== "undefined" && module.exports) module.exports = FoxchaseBenchmarks;
