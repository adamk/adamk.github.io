"use strict";

(function (root) {
  const unavailable = "—";
  const studyUrl = "/data/intraday_research_with_ex_20261003.json";

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
    const legacy = study && study.schema_version === 1 && study.classification === "FULL_RANGE_RESEARCH_REPLAY";
    const combined = study && study.schema_version === 2 && study.classification === "COMBINED_MODELED_INTRADAY_RESEARCH";
    if (!study || (!legacy && !combined) ||
        date(study.study_start) === unavailable || date(study.study_end) === unavailable ||
        !Number.isInteger(study.sessions_considered) || study.sessions_considered <= 0 ||
        study.cost_basis !== "gross_before_fees" || !stats ||
        !["trades", "wins", "losses", "breakeven"].every(key => Number.isInteger(stats[key])) ||
        stats.trades !== stats.wins + stats.losses + stats.breakeven ||
        !["gross_pnl", "ending_equity", "win_rate_pct", "profit_factor", "daily_sharpe_annualized", "max_drawdown_dollars", "max_drawdown_pct"]
          .every(key => typeof stats[key] === "number" && Number.isFinite(stats[key]))) {
      throw new Error("Historical research metadata invalid");
    }
    if (legacy && (!Number.isInteger(study.fully_evaluable_sessions) || study.fully_evaluable_sessions < 0 ||
        !Array.isArray(study.unresolved_sessions) ||
        study.unresolved_sessions.length !== study.sessions_considered - study.fully_evaluable_sessions ||
        study.unresolved_sessions.some(session => date(session) === unavailable))) {
      throw new Error("Historical research metadata invalid");
    }
    if (combined && (!Number.isInteger(study.spread_evaluable_sessions) || study.spread_evaluable_sessions < 0 ||
        !Array.isArray(study.spread_unresolved_sessions) ||
        study.spread_unresolved_sessions.length !== study.sessions_considered - study.spread_evaluable_sessions ||
        study.spread_unresolved_sessions.some(session => date(session) === unavailable) ||
        !Number.isInteger(study.ex_sessions_considered) || study.ex_sessions_considered <= 0 ||
        !Number.isInteger(study.ex_evaluable_sessions) || study.ex_evaluable_sessions < 0 ||
        study.ex_excluded_sessions !== study.ex_sessions_considered - study.ex_evaluable_sessions ||
        date(study.ex_study_end) === unavailable || study.ex_study_end > study.study_end ||
        !Number.isInteger(study.jointly_evaluable_sessions) || study.jointly_evaluable_sessions < 0 ||
        study.jointly_evaluable_sessions > Math.min(study.ex_evaluable_sessions, study.spread_evaluable_sessions) ||
        study.ex_not_evaluated_full_calendar !== study.sessions_considered - study.ex_evaluable_sessions ||
        !Number.isInteger(study.spread_setup_families) || study.spread_setup_families <= 0 ||
        !Number.isInteger(study.ex_sleeves) || study.ex_sleeves <= 0 ||
        !Number.isInteger(study.core_trades) || !Number.isInteger(study.ex_trades) ||
        study.core_trades + study.ex_trades !== stats.trades ||
        !Array.isArray(study.yearly) || study.yearly.reduce((n, row) => n + row.total_trades, 0) !== stats.trades ||
        study.yearly.reduce((n, row) => n + row.combined_pnl, 0) !== stats.gross_pnl ||
        study.live_execution_parity !== false || study.unknown_component_outcomes_are_zero !== false)) {
      throw new Error("Historical research metadata invalid");
    }
  }

  function renderStudy(document, study) {
    validateStudy(study);
    const stats = study.statistics;
    const combined = study.schema_version === 2;
    const coverage = 100 * (combined ? study.spread_evaluable_sessions : study.fully_evaluable_sessions) / study.sessions_considered;
    setText(document, "researchPeriod", date(study.study_start) + " – " + date(study.study_end) +
      (combined ? " · Combined modeled intraday research" : " · Intraday strategy research"));
    setText(document, "researchCoverage", combined ? "Spreads " + study.spread_evaluable_sessions + " / " + study.sessions_considered :
      study.fully_evaluable_sessions + " / " + study.sessions_considered + " sessions");
    setText(document, "researchCoveragePct", combined ? "EX " + study.ex_evaluable_sessions + " / " + study.ex_sessions_considered +
      " sessions · through " + date(study.ex_study_end) : coverage.toFixed(2) + "% coverage");
    setText(document, "researchUnresolved", combined ? "Spreads " + study.spread_unresolved_sessions.length + " · EX " + study.ex_excluded_sessions :
      String(study.unresolved_sessions.length));
    setOptional(document, "researchRuleset", combined ? study.spread_setup_families + " spread setups + " + study.ex_sleeves + " EX sleeves" :
      Number.isInteger(study.setup_families) && study.setup_families > 0
      ? study.setup_families + " intraday spread setups" : null, "researchRulesetCard");
    setText(document, "researchCostBasis", "Gross before fees");
    setOptional(document, "researchScope", study.scope);
    setOptional(document, "researchInputPolicy", study.input_policy);
    setOptional(document, "researchExecutionBasis", study.execution_basis);
    setOptional(document, "researchCostNote", study.cost_note);
    setOptional(document, "researchSizingBasis", study.sizing_basis);
    setOptional(document, "researchProvenance", study.provenance);
    setOptional(document, "researchVintage", study.vintage_note);
    if (combined) {
      setText(document, "researchCoreTrades", String(study.core_trades));
      setText(document, "researchEXTrades", String(study.ex_trades));
      for (const year of study.yearly) {
        setText(document, "researchYear" + year.year + "Trades", String(year.total_trades));
        setText(document, "researchYear" + year.year + "Pnl", money(year.combined_pnl, true));
      }
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
    setText(document, "researchTradeSummary", stats.wins + " wins · " + stats.losses + " losses · " + stats.breakeven +
      " flat. Intraday gross P&L is " + money(stats.gross_pnl, true) +
      "; its additive hypothetical value ends at " + money(stats.ending_equity) + ".");
    setText(document, "researchLimitations", combined ? study.limitations + " " + study.accounting +
      " Spread inputs remain unresolved on " + study.spread_unresolved_sessions.map(date).join("; ") + ". " +
      study.jointly_evaluable_sessions + " / " + study.sessions_considered + " dates have joint spread/EX coverage." :
      "Historical results are simulated research and are separate from live account performance. " +
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
