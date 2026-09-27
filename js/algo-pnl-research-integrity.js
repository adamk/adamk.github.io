"use strict";

(function (root) {
  const unavailable = "—";
  const studyUrl = "/data/intraday_research_integrity_20260922.json";

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
    if (!study || study.schema_version !== 1 || study.classification !== "FULL_RANGE_RESEARCH_REPLAY" ||
        date(study.study_start) === unavailable || date(study.study_end) === unavailable ||
        !Number.isInteger(study.sessions_considered) || !Number.isInteger(study.fully_evaluable_sessions) ||
        study.sessions_considered <= 0 || study.fully_evaluable_sessions < 0 ||
        !Array.isArray(study.unresolved_sessions) ||
        study.unresolved_sessions.length !== study.sessions_considered - study.fully_evaluable_sessions ||
        study.unresolved_sessions.some(session => date(session) === unavailable) ||
        study.cost_basis !== "gross_before_fees" || !stats ||
        !["trades", "wins", "losses", "breakeven"].every(key => Number.isInteger(stats[key])) ||
        stats.trades !== stats.wins + stats.losses + stats.breakeven ||
        !["gross_pnl", "ending_equity", "win_rate_pct", "profit_factor", "daily_sharpe_annualized", "max_drawdown_dollars", "max_drawdown_pct"]
          .every(key => typeof stats[key] === "number" && Number.isFinite(stats[key]))) {
      throw new Error("Historical research metadata invalid");
    }
  }

  function renderStudy(document, study) {
    validateStudy(study);
    const stats = study.statistics;
    const coverage = 100 * study.fully_evaluable_sessions / study.sessions_considered;
    setText(document, "researchPeriod", date(study.study_start) + " – " + date(study.study_end) + " · Intraday strategy research");
    setText(document, "researchCoverage", study.fully_evaluable_sessions + " / " + study.sessions_considered + " sessions");
    setText(document, "researchCoveragePct", coverage.toFixed(2) + "% coverage");
    setText(document, "researchUnresolved", String(study.unresolved_sessions.length));
    setOptional(document, "researchRuleset", Number.isInteger(study.setup_families) && study.setup_families > 0
      ? study.setup_families + " intraday spread setups" : null, "researchRulesetCard");
    setText(document, "researchCostBasis", "Gross before fees");
    setOptional(document, "researchScope", study.scope);
    setOptional(document, "researchInputPolicy", study.input_policy);
    setOptional(document, "researchExecutionBasis", study.execution_basis);
    setOptional(document, "researchCostNote", study.cost_note);
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
    setText(document, "researchTradeSummary", stats.wins + " wins · " + stats.losses + " losses · " + stats.breakeven +
      " flat. Intraday gross P&L is " + money(stats.gross_pnl, true) +
      "; its additive hypothetical value ends at " + money(stats.ending_equity) + ".");
    setText(document, "researchLimitations", "Historical results are simulated research and are separate from live account performance. " +
      study.unresolved_sessions.length + " sessions remain unresolved: " + study.unresolved_sessions.map(date).join("; ") + ". " +
      "Historical results do not guarantee future performance.");
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

  const api = { renderStudy, renderLive, loadStudy };
  root.FoxchaseResearchIntegrity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
