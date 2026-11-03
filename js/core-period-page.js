"use strict";

(function (root) {
  const money = value => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    const amount = Math.abs(value).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
    return (value < 0 ? "−" : value > 0 ? "+" : "") + "$" + amount;
  };
  const balance = value => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return (value < 0 ? "−" : "") + "$" + Math.abs(value).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
  };
  const percent = (value, digits=2) => typeof value === "number" && Number.isFinite(value)
    ? (value > 0 ? "+" : "") + value.toFixed(digits) + "%" : "—";
  const number = (value, digits=4) => typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits) : "—";
  const dateLabel = value => new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
    month:"long", day:"numeric", year:"numeric", timeZone:"UTC"
  });
  const monthLabel = value => new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
    month:"long", year:"numeric", timeZone:"UTC"
  });

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
  function td(text, header=false) {
    const element = document.createElement(header ? "th" : "td");
    if (header) element.scope = "row";
    element.textContent = text;
    return element;
  }
  function replaceRows(bodyId, rows) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    body.replaceChildren(...rows);
  }

  async function fetchPayload() {
    const [response, hashResponse] = await Promise.all([
      fetch("/data/core_alpaca_fee_periods_20261016.json?v=20261016-alpaca-fees-r2-two-comparisons"),
      fetch("/data/core_alpaca_fee_periods_20261016.sha256?v=20261016-alpaca-fees-r2-two-comparisons", {cache:"no-store"})
    ]);
    if (!response.ok || !hashResponse.ok) throw new Error("period_source_unavailable");
    const body = await response.text();
    const expected = (await hashResponse.text()).trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{64}$/.test(expected) || !root.crypto?.subtle || typeof TextEncoder === "undefined") {
      throw new Error("period_source_hash_unavailable");
    }
    const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,"0")).join("");
    if (actual !== expected) throw new Error("period_source_hash_mismatch");
    return root.CorePeriodResearch.validatePayload(JSON.parse(body));
  }

  function renderComparisons(view) {
    for (const id of ["natural_nbbo_plus_slippage","natural_nbbo"]) {
      const row = view.comparisonMap[id];
      const prefix = id === "natural_nbbo_plus_slippage" ? "coreComparisonSlippage" : "coreComparisonNatural";
      setText(prefix + "EligibleSessions", String(row.eligible_sessions));
      setText(prefix + "Trades", String(row.trades));
      setText(prefix + "WinRate", percent(row.win_rate_pct));
      setText(prefix + "GrossPnl", money(row.gross_pnl));
      setText(prefix + "NetPnl", money(row.net_pnl));
      setText(prefix + "ProfitFactor", number(row.net_profit_factor));
      setText(prefix + "EndingEquity", balance(row.ending_equity));
      setText(prefix + "Return", percent(row.cumulative_return_pct,4));
      setText(prefix + "MaxDrawdown", money(row.maximum_drawdown_dollars));
      setText(prefix + "Expectancy", money(row.net_expectancy_per_trade));
      setText(prefix + "ExpectancyCI", row.expectancy_ci_95
        ? money(row.expectancy_ci_95[0]) + " to " + money(row.expectancy_ci_95[1]) + " / trade" : "—");
      setText(prefix + "Slippage", money(row.assumed_slippage_cost));
      setText(prefix + "Fees", money(row.assumed_fees));
    }
    const interval = view.comparisonMap.natural_nbbo_plus_slippage.expectancy_ci_95;
    setText("coreStudySlippageInterval", interval ? money(interval[0]) + " to " + money(interval[1]) : "—");
  }

  function renderSetups(view, comparisonId) {
    const rows = view.period.setups.map(setup => {
      const metric = setup.comparisons[comparisonId];
      const tr = document.createElement("tr");
      tr.append(
        td(setup.label,true), td(String(metric.trades)), td(percent(metric.win_rate_pct)),
        td(money(metric.gross_pnl)), td(money(metric.net_pnl)), td(number(metric.net_profit_factor)),
        td(money(metric.net_expectancy_per_trade)), td(money(metric.maximum_drawdown_dollars)),
        td(metric.expectancy_ci_95 ? money(metric.expectancy_ci_95[0]) + " to " + money(metric.expectancy_ci_95[1]) : "—")
      );
      return tr;
    });
    replaceRows("coreSetupTableBody", rows);
  }

  function renderYearly(view) {
    const rows = view.yearly.map(row => {
      const label = String(row.year) === "2026" ? "2026 YTD through September 21" : String(row.year);
      const tr = document.createElement("tr");
      tr.append(td(label,true), td(money(row.natural_nbbo)), td(money(row.natural_nbbo_plus_slippage)));
      return tr;
    });
    replaceRows("coreYearlyTableBody", rows);
  }

  function renderQuoteQuality(view) {
    const rows = Object.entries(view.quoteQuality).map(([year, row]) => {
      const spread = row.option_bid_ask_spread_dollars;
      const spreadText = spread.median === null ? "—" :
        "$" + number(spread.p25,4) + " / $" + number(spread.median,4) + " / $" + number(spread.p75,4);
      const tr = document.createElement("tr");
      tr.append(td(year,true), td(row.requested_contract_minute_observations.toLocaleString("en-US")),
        td(percent(row.availability_pct)), td(row.missing_quote_observations.toLocaleString("en-US")),
        td(row.authoritative_no_data_observations.toLocaleString("en-US")),
        td(row.invalid_quote_observations.toLocaleString("en-US")), td(spreadText));
      return tr;
    });
    replaceRows("coreQuoteQualityBody", rows);
  }

  function renderLimitations(view) {
    const nodes = view.limitations.map(text => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    });
    replaceRows("corePeriodLimitations", nodes);
  }

  function colors() {
    return {"CORE — Natural NBBO":"#2f855a","CORE — Natural NBBO + $0.01 Slippage":"#c77724",
      "Risk-Free / Cash":"#087f8c","SPY Buy & Hold (adjusted)":"#666666"};
  }
  function datasets(rows) {
    const palette = colors();
    return rows.map(row => ({...row, borderColor:palette[row.label], backgroundColor:"transparent",
      borderWidth:row.label === "CORE — Natural NBBO + $0.01 Slippage" ? 3 : 2,
      borderDash:row.label === "SPY Buy & Hold (adjusted)" ? [6,4] : undefined,
      pointRadius:0,pointHitRadius:8,tension:0,spanGaps:false}));
  }

  function initialize() {
    const benchmarkStatus = document.getElementById("coreBenchmarkStatus");
    const portfolioStatus = document.getElementById("corePortfolioStatus");
    const periodSelector = document.getElementById("corePeriodSelector");
    const setupSelector = document.getElementById("coreSetupComparison");
    const benchmarkSelector = document.getElementById("coreBenchmarkSelection");
    let payload, drawdownChart, portfolioChart, currentPeriodId, labels;
    const displaySelector = document.getElementById("corePerformanceDisplay");
    const chartDateAxis = values => ({ticks:{maxTicksLimit:8,callback:value => values[value].slice(0,7)}});

    function render(periodId) {
      const view = root.CorePeriodResearch.periodView(payload, periodId, setupSelector.value, benchmarkSelector.value);
      const period = view.period, benchmark = view.benchmarkReturns;
      const selectedBenchmark = view.selectedBenchmark;
      currentPeriodId = periodId;
      setText("coreStudyPeriod", "Historical period: " + monthLabel(period.requested_start) + " – " + dateLabel(period.comparison_end) +
        ". Fresh normalized $10,000 modeled equity; " + period.eligible_sessions.toLocaleString("en-US") + " eligible of " +
        period.candidate_sessions.toLocaleString("en-US") + " candidate sessions. September 22 candidate data is excluded from the validated endpoint.");
      renderComparisons(view);
      setText("coreBenchmarkComparisonName", selectedBenchmark.label);
      setText("coreBenchmarkStrategyReturn", percent(selectedBenchmark.return_pct,4));
      setText("coreBenchmarkCashReturn", percent(benchmark.risk_free_cash_return_pct,4));
      setText("coreBenchmarkExcessReturn", (selectedBenchmark.excess_return_over_cash_pp > 0 ? "+" : "") +
        (Number.isFinite(selectedBenchmark.excess_return_over_cash_pp) ? selectedBenchmark.excess_return_over_cash_pp.toFixed(4) + " pp" : "—"));
      setText("coreBenchmarkSPYReturn", percent(benchmark.adjusted_spy_buy_hold_return_pct,4));
      setText("coreBenchmarkDescription", benchmark.available
        ? "Independent fresh replay: " + monthLabel(period.requested_start) + " through " + dateLabel(period.comparison_end) +
          ". All series share a $10,000 baseline at the preceding adjusted SPY market close on " + dateLabel(benchmark.base_date) +
          ". The first plotted session close includes that session's strategy P&L, SPY return, and Treasury cash accrual. September 22, 2026 is in candidate coverage but excluded."
        : "Independent fresh replay: " + monthLabel(period.requested_start) + " through " + dateLabel(period.comparison_end) +
          ". The retained adjusted SPY source has no pre-session close for this period, so aligned cash and SPY benchmark returns are unavailable; no substitute was estimated. September 22, 2026 is in candidate coverage but excluded.");
      setText("corePortfolioDescription", "Daily cumulative modeled closed-trade equity for " + monthLabel(period.requested_start) +
        " through " + dateLabel(period.comparison_end) + ", with a fresh $10,000 seed before the first session. First close includes first-session P&L. Modeled strategy equity, not actual live-account or intraday mark-to-market equity. " +
        period.gap_dates.length + " non-evaluable strategy session(s) remain blank; no strategy values are interpolated.");
      renderSetups(view, setupSelector.value);
      renderYearly(view);
      renderQuoteQuality(view);
      renderLimitations(view);

      if (!portfolioChart) return;
      labels = view.labels;
      portfolioChart.data.labels = labels;
      portfolioChart.data.datasets = datasets(root.CorePeriodResearch.performanceDatasets(view, displaySelector.value));
      portfolioChart.options.scales.x = chartDateAxis(labels);
      const equity = displaySelector.value === "equity";
      const log = document.getElementById("corePortfolioScale").value === "logarithmic";
      portfolioChart.options.scales.y.type = log ? "logarithmic" : "linear";
      portfolioChart.options.scales.y.title.text = (equity ? "Modeled equity (USD, $10,000 baseline" : "Normalized index (100 baseline") + ", " + (log ? "logarithmic" : "linear") + " scale)";
      portfolioChart.options.scales.y.ticks = {callback:value => equity ? balance(value) : Number(value).toLocaleString("en-US")};
      setText("corePortfolioScaleStatus", log
        ? "Logarithmic scale: equal spacing represents equal percentage changes."
        : "Linear scale: equal spacing represents equal " + (equity ? "dollar" : "index-point") + " changes.");
      portfolioChart.update();
      drawdownChart.data.labels = labels;
      drawdownChart.data.datasets = datasets(root.CorePeriodResearch.drawdownDatasets(view));
      drawdownChart.options.scales.x = chartDateAxis(labels);
      drawdownChart.update();
      setText("coreDrawdownStatus", period.label + ": " + period.gap_dates.length + " non-evaluable session gap(s). Through September 21, 2026; September 22 excluded.");
      benchmarkStatus.textContent = "";
      portfolioStatus.textContent = "";
      document.getElementById("corePortfolioChart").setAttribute("aria-label",
        "Selected-period modeled closed-trade CORE Natural NBBO and CORE Natural NBBO plus $0.01 Slippage; " +
        (equity ? "$10,000 equity" : "100 index") + " pre-session baseline. " +
        (benchmark.available ? "Includes risk-free cash and dividend/split-adjusted SPY." : "Aligned cash and adjusted SPY benchmarks are unavailable."));
    }

    return Promise.all([fetchPayload(), root.loadChartLibrary()]).then(([data, ChartLibrary]) => {
      payload = data;
      const initialId = payload.default_period;
      const initialView = root.CorePeriodResearch.periodView(payload, initialId, setupSelector.value, benchmarkSelector.value);
      const tooltipTitle = items => items.length ? dateLabel(items[0].label) : "";
      portfolioChart = new ChartLibrary(document.getElementById("corePortfolioChart"), {
        type:"line",data:{labels:initialView.labels,datasets:[]},
        options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:"index",intersect:false},
          plugins:{tooltip:{callbacks:{title:tooltipTitle,
            label:item => item.dataset.label + ": " + (item.parsed.y === null ? "not evaluable" :
              displaySelector.value === "equity" ? balance(item.parsed.y) : Number(item.parsed.y).toFixed(4) + " index points")
          }}},
          scales:{x:chartDateAxis(initialView.labels),y:{type:"linear",title:{display:true,text:"Normalized index"}}}}
      });
      drawdownChart = new ChartLibrary(document.getElementById("coreDrawdownChart"), {
        type:"line",data:{labels:initialView.labels,datasets:[]},
        options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:"index",intersect:false},
          plugins:{legend:{display:false},tooltip:{callbacks:{title:tooltipTitle,
            label:item => item.dataset.label + " closed-trade drawdown: " +
              (item.parsed.y === null ? "not evaluable" : percent(item.parsed.y))
          }}},
          scales:{x:chartDateAxis(initialView.labels),y:{type:"linear",max:0,
            title:{display:true,text:"Closed-trade drawdown (%)"},ticks:{callback:value=>value + "%"}}}}
      });
      document.getElementById("corePortfolioScale").addEventListener("change", () => render(currentPeriodId));
      displaySelector.addEventListener("change", () => render(currentPeriodId));
      render(initialId);
      periodSelector.value = initialId;
      periodSelector.addEventListener("change", () => render(periodSelector.value));
      setupSelector.addEventListener("change", () => render(currentPeriodId));
      benchmarkSelector.addEventListener("change", () => render(currentPeriodId));
    }).catch(() => {
      benchmarkStatus.textContent = "CORE period comparison is temporarily unavailable until the multi-period payload passes hash and research-integrity checks.";
      portfolioStatus.textContent = "CORE period curves are temporarily unavailable until the payload passes validation.";
      setText("coreDrawdownStatus", "Drawdown unavailable until the source payload passes validation.");
      setText("coreSlippageDataStatus", "CORE period research is temporarily unavailable until all verified data passes validation.");
    });
  }

  root.CorePeriodPage = {initialize};
  if (typeof module !== "undefined" && module.exports) module.exports = {initialize};
})(typeof window === "undefined" ? globalThis : window);
