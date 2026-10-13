"use strict";

(function (root) {
  const unavailable = "—";
  const studyUrl = "/data/selected_ex_research_20261013.json";

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
    const yearly = study && study.yearly;
    if (!study || study.schema_version !== 1 || study.classification !== "SELECTED_EX_ONE_CONTRACT_RESEARCH" ||
        date(study.study_start) === unavailable || date(study.study_end) === unavailable ||
        !Number.isInteger(study.sessions_considered) || study.sessions_considered <= 0 ||
        !Number.isInteger(study.sessions_assessable) || study.sessions_assessable < 0 ||
        !Number.isInteger(study.sessions_unassessable) ||
        study.sessions_assessable + study.sessions_unassessable !== study.sessions_considered ||
        study.analysis_set !== "OUTSIDE_LUNCH" || study.stop_pct !== 0.2 || study.target_pct !== 0.3 ||
        study.cost_basis !== "gross_before_fees" || study.complete_history !== false ||
        study.unknown_outcomes_are_zero !== false || !stats || !Array.isArray(yearly) || yearly.length !== 4 ||
        !["trades", "wins", "losses", "breakeven"].every(key => Number.isInteger(stats[key])) ||
        stats.trades !== stats.wins + stats.losses + stats.breakeven ||
        stats.tp_exits + stats.sl_exits + stats.time_exits !== stats.trades ||
        !["gross_pnl", "gross_profit", "gross_loss", "win_rate_pct", "profit_factor", "dollar_expectancy",
          "max_drawdown_dollars", "average_hold_minutes", "median_hold_minutes", "trade_return_sharpe"]
          .every(key => typeof stats[key] === "number" && Number.isFinite(stats[key])) ||
        Math.abs(stats.gross_profit - stats.gross_loss - stats.gross_pnl) > 1e-9 ||
        yearly.some(row => !Number.isInteger(row.year) || !Number.isInteger(row.trades) ||
          !Number.isInteger(row.wins) || !Number.isInteger(row.losses) || !Number.isInteger(row.time_exits) ||
          row.trades !== row.wins + row.losses || typeof row.gross_pnl !== "number" || !Number.isFinite(row.gross_pnl)) ||
        yearly.reduce((sum, row) => sum + row.trades, 0) !== stats.trades ||
        Math.abs(yearly.reduce((sum, row) => sum + row.gross_pnl, 0) - stats.gross_pnl) > 1e-9) {
      throw new Error("Selected EX research metadata invalid");
    }
  }

  function renderStudy(document, study) {
    validateStudy(study);
    const stats = study.statistics;
    const coverage = 100 * study.sessions_assessable / study.sessions_considered;
    setText(document, "researchPeriod", date(study.study_start) + " – " + date(study.study_end) +
      " · Selected EX one-contract research");
    setText(document, "researchCoverage", study.sessions_assessable + " / " + study.sessions_considered + " sessions");
    setText(document, "researchCoveragePct", study.sessions_unassessable + " unassessable · signal counts unknown, not zero");
    setText(document, "researchUnresolved", study.sessions_unassessable + " unassessable");
    setText(document, "researchRuleset", "Selected EX sleeve · SL20 / TP30");
    setText(document, "researchCostBasis", "Gross before fees");
    setOptional(document, "researchScope", study.scope);
    setOptional(document, "researchInputPolicy", study.input_policy);
    setOptional(document, "researchExecutionBasis", study.execution_basis);
    setOptional(document, "researchSizingBasis", study.sizing_basis);
    setOptional(document, "researchProvenance", study.provenance);
    setText(document, "researchEXTrades", String(stats.trades));
    for (const year of study.yearly) {
      setText(document, "researchYear" + year.year + "Trades", String(year.trades));
      setText(document, "researchYear" + year.year + "Pnl", money(year.gross_pnl, true));
    }
    setText(document, "researchTrades", String(stats.trades));
    setText(document, "researchGrossPnl", money(stats.gross_pnl, true));
    setText(document, "researchWinRate", percent(stats.win_rate_pct));
    setText(document, "researchProfitFactor", number(stats.profit_factor, 3));
    setText(document, "researchSharpe", number(stats.trade_return_sharpe, 3));
    setText(document, "researchDrawdown", money(stats.max_drawdown_dollars));
    setText(document, "compareHistoricalTrades", String(stats.trades));
    setText(document, "compareHistoricalWinRate", percent(stats.win_rate_pct));
    setText(document, "compareHistoricalProfitFactor", number(stats.profit_factor, 3));
    setText(document, "compareHistoricalDrawdown", money(stats.max_drawdown_dollars));
    setText(document, "researchTradeSummary", stats.wins + " wins · " + stats.losses + " losses · " +
      stats.time_exits + " time exits. Gross one-contract P&L is " + money(stats.gross_pnl, true) + ".");
    setText(document, "researchLimitations", study.limitations);
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

  function renderAttribution() {
    return null;
  }

  function loadAttribution() {
    return Promise.resolve(null);
  }

  const api = { renderStudy, renderLive, loadStudy, renderAttribution, loadAttribution };
  root.FoxchaseResearchIntegrity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
