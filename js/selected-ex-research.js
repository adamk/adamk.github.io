"use strict";

(function (root) {
  const unavailable = "—";
  const studyUrl = "/data/selected_ex_research_20261013.json";
  const setText = (document, id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const dateLabel = value => new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
    month:"long", day:"numeric", year:"numeric", timeZone:"UTC"
  });
  const wholeMoney = value => {
    if (!Number.isFinite(value)) return unavailable;
    const magnitude = Math.abs(value).toLocaleString("en-US", {maximumFractionDigits:0});
    return (value < 0 ? "-" : value > 0 ? "+" : "") + "$" + magnitude;
  };
  const percentage = value => Number.isFinite(value) ? value.toFixed(2) + "%" : unavailable;

  function validateStudy(study) {
    const stats = study?.statistics;
    if (!study || study.schema_version !== 1 || study.classification !== "SELECTED_EX_ONE_CONTRACT_RESEARCH" ||
        study.display_label !== "Selected EX sleeve" || study.cost_basis !== "gross_before_fees" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(study.study_start || "") ||
        !/^\d{4}-\d{2}-\d{2}$/.test(study.study_end || "") || study.study_end < study.study_start ||
        !Number.isInteger(study.sessions_considered) || !Number.isInteger(study.sessions_assessable) ||
        !Number.isInteger(study.sessions_unassessable) ||
        study.sessions_assessable + study.sessions_unassessable !== study.sessions_considered ||
        study.sessions_unassessable <= 0 || !stats ||
        !["trades", "wins", "losses", "breakeven"].every(key => Number.isInteger(stats[key])) ||
        stats.trades !== stats.wins + stats.losses + stats.breakeven ||
        !["gross_pnl", "gross_profit", "gross_loss", "win_rate_pct", "profit_factor", "max_drawdown_dollars"]
          .every(key => Number.isFinite(stats[key])) ||
        Math.abs(stats.gross_profit - stats.gross_loss - stats.gross_pnl) > 1e-7 ||
        study.unknown_outcomes_are_zero !== false || study.complete_history !== false ||
        typeof study.limitations !== "string" || study.limitations.length < 40 ||
        !/^[a-f0-9]{64}$/.test(study.source_report_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(study.source_ledger_sha256 || "")) {
      throw new Error("Selected EX research metadata invalid");
    }
    return study;
  }

  function render(document, study) {
    validateStudy(study);
    const stats = study.statistics;
    setText(document, "selectedExPeriod", dateLabel(study.study_start) + " – " + dateLabel(study.study_end) +
      ". One-contract, outside-lunch historical research; gross before fees.");
    setText(document, "selectedExTrades", String(stats.trades));
    setText(document, "selectedExGrossPnl", wholeMoney(stats.gross_pnl));
    setText(document, "selectedExWinRate", percentage(stats.win_rate_pct));
    setText(document, "selectedExProfitFactor", stats.profit_factor.toFixed(3));
    setText(document, "selectedExDrawdown", wholeMoney(stats.max_drawdown_dollars));
    setText(document, "selectedExUnknown", study.sessions_unassessable + " / " + study.sessions_considered + " sessions");
    setText(document, "selectedExLimitations", study.limitations);
    setText(document, "selectedExDataStatus", "");
    return study;
  }

  function load(document, fetchStudy) {
    return fetchStudy(studyUrl).then(response => {
      if (!response.ok) throw new Error("Selected EX research unavailable");
      return response.json();
    }).then(study => render(document, study)).catch(() => {
      setText(document, "selectedExDataStatus", "Selected EX research is temporarily unavailable.");
      return null;
    });
  }

  root.SelectedExResearch = {validateStudy, render, load, initialize:(document, fetchStudy) => load(document, fetchStudy)};
  if (typeof module !== "undefined" && module.exports) module.exports = root.SelectedExResearch;
})(typeof window === "undefined" ? globalThis : window);
