"use strict";

(function (root) {
  const unavailable = "—";
  const studyUrl = "/data/intraday_research_with_ex_20261003.json";
  const attributionUrl = "/data/intraday_research_attribution_20261003.json";
  const limitations = "Historical results are simulated research and are separate from live account performance. The research uses modeled historical execution, retrospective portfolio sizing, and datasets with differing coverage periods. Historical quotes do not fully reproduce live market conditions, broker execution, liquidity, capacity, or market impact. Required missing inputs remain unknown; this update does not estimate or synthesize them. Historical results do not guarantee future performance.";
  const limitationsDisplay = "Historical results are simulated research, separate from live account performance, using modeled execution and retrospective sizing. Dataset coverage differs by component; missing inputs remain unknown and are not synthesized. Results do not fully reproduce live market conditions, broker execution, liquidity, capacity or market impact and do not guarantee future performance.";

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
          .every(key => typeof stats[key] === "number" && Number.isFinite(stats[key]))) {
      throw new Error("Historical research metadata invalid");
    }
    if (!Number.isInteger(study.spread_evaluable_sessions) || study.spread_evaluable_sessions < 0 ||
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
      " · Modeled intraday research");
    setText(document, "researchCoverage", "Spreads " + study.spread_evaluable_sessions + " / " + study.sessions_considered);
    setText(document, "researchCoveragePct", "EX " + study.ex_evaluable_sessions + " / " + study.ex_sessions_considered +
      " sessions · through " + date(study.ex_study_end));
    setText(document, "researchUnresolved", "Spreads " + study.spread_excluded_sessions + " · EX " + study.ex_excluded_sessions);
    setText(document, "researchRuleset", "Intraday + EX sleeves");
    setText(document, "researchCostBasis", "Gross before fees");
    setOptional(document, "researchScope", study.scope);
    setOptional(document, "researchInputPolicy", study.input_policy);
    setOptional(document, "researchExecutionBasis", study.execution_basis);
    setOptional(document, "researchCostNote", study.cost_note);
    setOptional(document, "researchSizingBasis", study.sizing_basis);
    setOptional(document, "researchProvenance", study.provenance);
    setOptional(document, "researchVintage", study.vintage_note);
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
    setText(document, "compareHistoricalTrades", String(stats.trades));
    setText(document, "compareHistoricalWinRate", percent(stats.win_rate_pct));
    setText(document, "compareHistoricalProfitFactor", number(stats.profit_factor, 3));
    setText(document, "compareHistoricalDrawdown", percent(stats.max_drawdown_pct));
    setText(document, "researchTradeSummary", stats.wins + " wins · " + stats.losses + " losses · " + stats.breakeven + " flat.");
    setText(document, "researchLimitations", limitationsDisplay);
    setText(document, "researchDataStatus", "");
    return coverage;
  }

  function renderLive(document, canonicalMetrics, available) {
    const performance = available && canonicalMetrics && canonicalMetrics.performance || {};
    const trades = available && canonicalMetrics && canonicalMetrics.trades || {};
    setText(document, "compareLiveTrades", Number.isInteger(trades.closed_trade_count) ? String(trades.closed_trade_count) : unavailable);
    setText(document, "compareLiveWinRate", percent(trades.win_rate_pct));
    setText(document, "compareLiveProfitFactor", number(trades.profit_factor, 2));
    setText(document, "compareLiveDrawdown", percent(performance.max_drawdown_pct));
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
    return Promise.all([get(attributionUrl), get(studyUrl)])
      .then(([data, study]) => renderAttribution(document, data, study)).catch(() => {
        setText(document, "attributionDataStatus", "Modeled portfolio comparison temporarily unavailable.");
        return null;
      });
  }

  const api = { renderStudy, renderLive, loadStudy, renderAttribution, loadAttribution };
  root.FoxchaseResearchIntegrity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
