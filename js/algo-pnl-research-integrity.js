"use strict";

(function (root) {
  const unavailable = "—";
  const studyUrl = "/data/intraday_research_with_ex_20261013.json";
  const attributionUrl = "/data/intraday_research_attribution_20261003.json";
  const attributionStudyUrl = "/data/intraday_research_with_ex_20261003.json";
  const coreSlippageStudyUrl = "/data/core_slippage_replay_20261015.json";
  const limitations = "Historical results are simulated research and are separate from live account performance. This replay uses the corrected commissioned EX sleeve only, modeled execution, retrospective portfolio sizing, and unequal component coverage. Historical quotes do not fully reproduce live market conditions, broker execution, liquidity, capacity, or market impact. Required missing inputs remain unknown; this update does not estimate or synthesize them. Historical results do not guarantee future performance.";
  const limitationsDisplay = "Historical results are simulated research, separate from live trading and not verified live performance, using the corrected commissioned EX sleeve only, modeled execution and retrospective sizing. Missing inputs remain unknown and are not synthesized. Results do not fully reproduce live market conditions, broker execution, liquidity, capacity or market impact and do not guarantee future performance.";

  function setText(document, id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setOptional(document, id, value, containerId) {
    const element = document.getElementById(id);
    if (!element) return;
    const container = containerId ? document.getElementById(containerId) : element;
    if (container) container.hidden = !value;
    if (value) element.textContent = value;
  }

  function number(value, digits) {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : unavailable;
  }

  function percent(value) {
    return number(value, 2) === unavailable ? unavailable : number(value, 2) + "%";
  }

  function money(value, signed = false) {
    if (typeof value !== "number" || !Number.isFinite(value)) return unavailable;
    const absolute = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
    return (value < 0 ? "-" : signed && value > 0 ? "+" : "") + "$" + absolute;
  }

  function moneyExact(value, signed = false) {
    if (typeof value !== "number" || !Number.isFinite(value)) return unavailable;
    const absolute = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (value < 0 ? "-" : signed && value > 0 ? "+" : "") + "$" + absolute;
  }

  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return unavailable;
    return new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric", timeZone: "UTC"
    });
  }

  function validateStudy(study) {
    const stats = study && study.statistics;
    if (!study || study.schema_version !== 3 || study.classification !== "COMBINED_MODELED_INTRADAY_RESEARCH" ||
        date(study.study_start) === unavailable || date(study.study_end) === unavailable ||
        !Number.isInteger(study.sessions_considered) || study.sessions_considered <= 0 ||
        study.cost_basis !== "gross_before_fees" || !stats ||
        !["trades", "wins", "losses", "breakeven"].every(key => Number.isInteger(stats[key])) ||
        stats.trades !== stats.wins + stats.losses + stats.breakeven ||
        !["gross_pnl", "ending_equity", "win_rate_pct", "profit_factor", "daily_sharpe_annualized", "max_drawdown_dollars", "max_drawdown_pct"]
          .every(key => typeof stats[key] === "number" && Number.isFinite(stats[key])) ||
        !Number.isInteger(study.spread_evaluable_sessions) || study.spread_evaluable_sessions < 0 ||
        !Number.isInteger(study.spread_excluded_sessions) || study.spread_excluded_sessions < 0 ||
        study.spread_excluded_sessions !== study.sessions_considered - study.spread_evaluable_sessions ||
        !Number.isInteger(study.ex_sessions_considered) || study.ex_sessions_considered <= 0 ||
        !Number.isInteger(study.ex_evaluable_sessions) || study.ex_evaluable_sessions < 0 ||
        study.ex_excluded_sessions !== study.ex_sessions_considered - study.ex_evaluable_sessions ||
        date(study.ex_study_end) === unavailable || study.ex_study_end > study.study_end ||
        !Number.isInteger(study.core_trades) || !Number.isInteger(study.ex_trades) ||
        study.core_trades + study.ex_trades !== stats.trades ||
        !Array.isArray(study.yearly) || study.yearly.reduce((n, row) => n + row.total_trades, 0) !== stats.trades ||
        study.yearly.reduce((n, row) => n + row.combined_pnl, 0) !== stats.gross_pnl ||
        study.starting_equity !== 10000 || stats.ending_equity !== study.starting_equity + stats.gross_pnl ||
        stats.gross_profit - stats.gross_loss !== stats.gross_pnl ||
        !/^[a-f0-9]{64}$/.test(study.source_ledger_sha256) || study.limitations !== limitations ||
        study.live_execution_parity !== false || study.unknown_component_outcomes_are_zero !== false) {
      throw new Error("Historical research metadata invalid");
    }
  }

  function renderStudy(document, study) {
    validateStudy(study);
    const stats = study.statistics;
    const coverage = 100 * study.spread_evaluable_sessions / study.sessions_considered;
    setText(document, "researchPeriod", date(study.study_start) + " – " + date(study.study_end) +
      " · Corrected commissioned EX integration");
    setText(document, "researchCoverage", "Spreads " + study.spread_evaluable_sessions + " / " + study.sessions_considered);
    setText(document, "researchCoveragePct", "EX " + study.ex_evaluable_sessions + " / " + study.ex_sessions_considered +
      " sessions · through " + date(study.ex_study_end));
    setText(document, "researchUnresolved", "Spreads " + study.spread_excluded_sessions + " · EX " + study.ex_excluded_sessions);
    setText(document, "researchRuleset", "Intraday + corrected commissioned EX");
    setText(document, "researchCostBasis", "Gross before fees");
    setOptional(document, "researchScope", study.scope);
    setOptional(document, "researchInputPolicy", study.input_policy);
    setOptional(document, "researchExecutionBasis", study.execution_basis);
    setOptional(document, "researchSizingBasis", study.sizing_basis);
    setOptional(document, "researchProvenance", study.provenance);
    setOptional(document, "researchCostNote", study.cost_note);
    setText(document, "researchCoreTrades", String(study.core_trades));
    setText(document, "researchEXTrades", String(study.ex_trades));
    for (const year of study.yearly) {
      setText(document, "researchYear" + year.year + "Trades", String(year.total_trades));
      setText(document, "researchYear" + year.year + "Pnl", money(year.combined_pnl, true));
    }
    setText(document, "researchTrades", String(stats.trades));
    setText(document, "researchGrossPnl", money(stats.gross_pnl, true));
    setText(document, "researchWinRate", percent(stats.win_rate_pct));
    setText(document, "researchProfitFactor", number(stats.profit_factor, 3));
    setText(document, "researchSharpe", number(stats.daily_sharpe_annualized, 3));
    setText(document, "researchDrawdown", money(stats.max_drawdown_dollars) + " / " + percent(stats.max_drawdown_pct));
    setText(document, "researchTradeSummary", stats.wins + " wins · " + stats.losses + " losses · " + stats.breakeven + " flat.");
    setText(document, "researchLimitations", limitationsDisplay);
    setText(document, "researchDataStatus", "");
    return coverage;
  }

  function loadStudy(document, fetchStudy) {
    return fetchStudy(studyUrl).then(response => {
      if (!response.ok) throw new Error("Historical research metadata unavailable");
      return response.json();
    }).then(study => renderStudy(document, study)).catch(() => {
      setText(document, "researchDataStatus", "Historical research details temporarily unavailable.");
      return null;
    });
  }

  function renderAttribution(document, data, study) {
    const equal = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
    const validMetric = metric => metric && ["trades", "wins", "losses", "breakeven"].every(key => Number.isInteger(metric[key])) &&
      metric.trades === metric.wins + metric.losses + metric.breakeven &&
      ["gross_pnl", "gross_profit", "gross_loss", "profit_factor", "daily_sharpe_annualized", "max_drawdown_dollars", "max_drawdown_pct"]
        .every(key => Number.isFinite(metric[key])) && equal(metric.gross_profit - metric.gross_loss, metric.gross_pnl);
    const invalid = () => { throw new Error("Attribution metadata invalid"); };
    if (!data || data.schema_version !== 2 || data.classification !== "SAME_ENGINE_EX_INCREMENTAL_ATTRIBUTION" ||
        data.same_engine !== true || data.research_rules_unchanged !== true || data.gross_before_fees !== true ||
        data.exact_live_execution !== false || data.missing_EX_outcomes_are_unknown !== true ||
        !study || study.schema_version !== 3 ||
        data.start !== study.study_start || data.end !== study.study_end || data.initial_equity !== 10000 ||
        data.EX_endpoint !== study.ex_study_end || !data.coverage ||
        typeof data.legacy_context !== "string" || data.legacy_context.length < 30 ||
        data.coverage.calendar !== study.sessions_considered || data.coverage.spread !== study.spread_evaluable_sessions ||
        data.coverage.ex !== study.ex_evaluable_sessions ||
        ![data.legacy, data.spread_only, data.combined].every(validMetric)) invalid();
    for (const [key, value] of Object.entries(study.statistics)) {
      if (typeof value === "number" && !equal(data.combined[key], value)) invalid();
    }
    if (!equal(data.incremental_portfolio_pnl, data.combined.gross_pnl - data.spread_only.gross_pnl) ||
        !data.deltas || !Array.isArray(data.yearly) || data.yearly.length !== 4 ||
        data.yearly.reduce((sum, year) => sum + year.spread_only_gross_pnl, 0) !== data.spread_only.gross_pnl ||
        data.yearly.reduce((sum, year) => sum + year.combined_gross_pnl, 0) !== data.combined.gross_pnl) invalid();
    for (const [key, value] of Object.entries(data.deltas)) {
      if (!equal(value, data.combined[key] - data.spread_only[key])) invalid();
    }
    for (const year of data.yearly) {
      if (!equal(year.incremental_portfolio_pnl, year.combined_gross_pnl - year.spread_only_gross_pnl)) invalid();
    }
    for (const [prefix, metric] of [["modelSpread", data.spread_only], ["modelCombined", data.combined]]) {
      setText(document, prefix + "Trades", String(metric.trades));
      setText(document, prefix + "Pnl", money(metric.gross_pnl, true));
      setText(document, prefix + "PF", number(metric.profit_factor, 3));
      setText(document, prefix + "Sharpe", number(metric.daily_sharpe_annualized, 3));
      setText(document, prefix + "DD", money(metric.max_drawdown_dollars) + " / " + percent(metric.max_drawdown_pct));
    }
    setText(document, "researchLegacyContext", data.legacy_context);
    setText(document, "researchModelInterpretation", "Adding EX increases modeled gross P&L, with lower profit factor and Daily Sharpe and deeper maximum drawdown.");
    setText(document, "attributionDataStatus", "");
    return data;
  }

  function loadAttribution(document, fetchStudy) {
    const get = url => fetchStudy(url).then(response => {
      if (!response.ok) throw new Error("Attribution metadata unavailable");
      return response.json();
    });
    return Promise.all([get(attributionUrl), get(attributionStudyUrl)])
      .then(([data, study]) => renderAttribution(document, data, study)).catch(() => {
        setText(document, "attributionDataStatus", "Modeled portfolio comparison temporarily unavailable.");
        return null;
      });
  }

  function validateCoreSlippageStudy(study) {
    const validMoney = value => typeof value === "number" && Number.isFinite(value);
    const validInterval = value => Array.isArray(value) && value.length === 2 && value.every(validMoney) && value[0] <= value[1];
    const expectedScenarios = [
      ["C", "Full Live-Sequence Slippage Replay"],
      ["A", "Natural NBBO"],
      ["B", "Matched-Trade Slippage"]
    ];
    const expectedSetups = [
      "R1 EM Bear", "R1 SPX Narrow", "R4 Failed PML Reclaim",
      "R4 PML Break", "R5 Late Lower EM", "R5 EM Lower Rejection"
    ];
    const validSourceHashes = study && study.source_sha256 &&
      ["slippage_methodology", "scenario_results", "year_by_year", "independent_verification"]
        .every(key => typeof study.source_sha256[key] === "string" && /^[a-f0-9]{64}$/.test(study.source_sha256[key]));
    const scenarioShape = study && Array.isArray(study.scenarios) && study.scenarios.length === expectedScenarios.length &&
      study.scenarios.every((row, index) => {
        const [id, label] = expectedScenarios[index];
        return row.id === id && row.label === label && Number.isInteger(row.trades) && row.trades > 0 &&
          [row.net_pnl, row.net_profit_factor, row.maximum_drawdown_dollars, row.net_expectancy_per_trade,
            row.added_slippage_cost, row.assumed_fees].every(validMoney) &&
          row.net_profit_factor > 0 && row.maximum_drawdown_dollars <= 0 && row.added_slippage_cost >= 0 &&
          row.assumed_fees >= 0 && validInterval(row.expectancy_ci_95) &&
          Math.abs(row.net_pnl / row.trades - row.net_expectancy_per_trade) < 0.01;
      });
    const setupShape = study && Array.isArray(study.setups) && study.setups.length === expectedSetups.length &&
      study.setups.every((row, index) => {
        if (row.label !== expectedSetups[index] || !Number.isInteger(row.trades) || row.trades < 0) return false;
        if (row.trades === 0) {
          return row.net_pnl === null && row.net_profit_factor === null &&
            row.maximum_drawdown_dollars === null && row.expectancy_ci_95 === null;
        }
        return [row.net_pnl, row.net_profit_factor, row.maximum_drawdown_dollars].every(validMoney) &&
          row.net_profit_factor > 0 && row.maximum_drawdown_dollars <= 0 && validInterval(row.expectancy_ci_95);
      });
    const yearlyShape = study && Array.isArray(study.yearly) && study.yearly.length === 4 &&
      study.yearly.every((row, index) => row.label === ["2023", "2024", "2025", "2026 YTD through Sep 22"][index] &&
        [row.a_net_pnl, row.b_net_pnl, row.c_net_pnl].every(validMoney));
    if (!study || study.schema_version !== 1 || study.classification !== "MODELED_CORE_SLIPPAGE_REPLAY" ||
        !study.period || study.period.start !== "2023-01-04" || study.period.end !== "2026-09-22" ||
        study.period.candidate_sessions !== 932 || study.period.admitted_sessions !== 928 ||
        study.period.starting_equity !== 10000 || study.independent_verification !== "PASS" || !validSourceHashes ||
        !scenarioShape || !setupShape || !yearlyShape || !study.data_quality ||
        study.data_quality.excluded_sessions !== 4 || study.data_quality.invalid_or_crossed_quote_events !== 19 ||
        study.data_quality.provider_no_data_events !== 122 ||
        study.scenarios[0].expectancy_ci_95[0] >= 0 || study.scenarios[0].expectancy_ci_95[1] <= 0 ||
        study.setups.filter(row => row.trades > 0).reduce((sum, row) => sum + row.trades, 0) !== study.scenarios[0].trades ||
        Math.abs(study.setups.filter(row => row.trades > 0).reduce((sum, row) => sum + row.net_pnl, 0) - study.scenarios[0].net_pnl) > 0.005 ||
        Math.abs(study.yearly.reduce((sum, row) => sum + row.a_net_pnl, 0) - study.scenarios[1].net_pnl) > 0.005 ||
        Math.abs(study.yearly.reduce((sum, row) => sum + row.b_net_pnl, 0) - study.scenarios[2].net_pnl) > 0.005 ||
        Math.abs(study.yearly.reduce((sum, row) => sum + row.c_net_pnl, 0) - study.scenarios[0].net_pnl) > 0.005) {
      throw new Error("CORE slippage study metadata invalid");
    }
  }

  function renderCoreSlippageStudy(document, study) {
    validateCoreSlippageStudy(study);
    const start = date(study.period.start);
    const end = date(study.period.end);
    setText(document, "coreStudyPeriod", start + " – " + end + " · " + study.period.admitted_sessions +
      " admitted of " + study.period.candidate_sessions + " candidate sessions · September 22 was not evaluable and is excluded · normalized " +
      moneyExact(study.period.starting_equity) + " start");
    for (const row of study.scenarios) {
      const prefix = "coreScenario" + row.id;
      setText(document, prefix + "Trades", String(row.trades));
      setText(document, prefix + "NetPnl", moneyExact(row.net_pnl, true));
      setText(document, prefix + "ProfitFactor", number(row.net_profit_factor, 4));
      setText(document, prefix + "MaxDrawdown", moneyExact(row.maximum_drawdown_dollars));
      setText(document, prefix + "Slippage", moneyExact(row.added_slippage_cost));
      setText(document, prefix + "Fees", moneyExact(row.assumed_fees));
      setText(document, prefix + "Expectancy", moneyExact(row.net_expectancy_per_trade, true));
      setText(document, prefix + "ExpectancyCI", moneyExact(row.expectancy_ci_95[0], true) + " to " +
        moneyExact(row.expectancy_ci_95[1], true) + " / trade");
    }
    const conservativeInterval = study.scenarios[0].expectancy_ci_95;
    setText(document, "coreStudyCInterval", moneyExact(conservativeInterval[0], true) + " to " +
      moneyExact(conservativeInterval[1], true));
    study.setups.forEach((row, index) => {
      const prefix = "coreSetup" + index;
      setText(document, prefix + "Name", row.label);
      setText(document, prefix + "Trades", String(row.trades));
      setText(document, prefix + "NetPnl", row.trades ? moneyExact(row.net_pnl, true) : unavailable);
      setText(document, prefix + "ProfitFactor", row.trades ? number(row.net_profit_factor, 4) : unavailable);
      setText(document, prefix + "MaxDrawdown", row.trades ? moneyExact(row.maximum_drawdown_dollars) : unavailable);
      setText(document, prefix + "ExpectancyCI", row.trades
        ? moneyExact(row.expectancy_ci_95[0], true) + " to " + moneyExact(row.expectancy_ci_95[1], true)
        : unavailable);
    });
    study.yearly.forEach((row, index) => {
      const year = [2023, 2024, 2025, 2026][index];
      const displayLabel = row.label === "2026 YTD through Sep 22"
        ? "2026 YTD through Sep 22 candidate coverage (Sep 22 excluded)"
        : row.label;
      setText(document, "coreYear" + year + "Label", displayLabel);
      setText(document, "coreYear" + year + "A", moneyExact(row.a_net_pnl, true));
      setText(document, "coreYear" + year + "B", moneyExact(row.b_net_pnl, true));
      setText(document, "coreYear" + year + "C", moneyExact(row.c_net_pnl, true));
    });
    const quality = study.data_quality;
    setText(document, "coreStudyDataQuality", quality.excluded_sessions + " of " + study.period.candidate_sessions +
      " candidate sessions were excluded. Source review recorded " + quality.invalid_or_crossed_quote_events +
      " negative/crossed quote events and " + quality.provider_no_data_events +
      " provider no-data events. Missing or invalid quotes were not treated as fills.");
    setText(document, "coreSlippageDataStatus", "");
    return study;
  }

  function loadCoreSlippageStudy(document, fetchStudy) {
    return fetchStudy(coreSlippageStudyUrl).then(response => {
      if (!response.ok) throw new Error("CORE slippage research unavailable");
      return response.json();
    }).then(study => renderCoreSlippageStudy(document, study)).catch(() => {
      setText(document, "coreSlippageDataStatus", "CORE slippage research details temporarily unavailable.");
      return null;
    });
  }

  const api = { renderStudy, loadStudy, renderAttribution, loadAttribution, renderCoreSlippageStudy, loadCoreSlippageStudy };
  root.FoxchaseResearchIntegrity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
