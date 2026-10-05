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
        {label:"Foxchase Algo",data:points.map(p=>p.index_value),borderColor:"#f4c430",backgroundColor:"rgba(244, 196, 48, 0.18)",borderWidth:3,pointRadius:2,tension:0.25},
        {label:"Risk-Free / Cash",data:cash.values||labels.map(()=>null),borderColor:"#087f8c",borderWidth:3,pointRadius:0,tension:0},
        {label:"SPY Buy & Hold",data:spy.values||labels.map(()=>null),borderColor:"#666666",borderWidth:2,borderDash:[6,4],pointRadius:0,tension:0}
      ]
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
      {label:"Foxchase Backtest",data:intraday.values.map(value=>100*value/data.initial_value),borderColor:"#234a76",borderWidth:3,pointRadius:0,tension:0},
      {label:"Risk-Free / Cash",data:cash.values||labels.map(()=>null),borderColor:"#087f8c",borderWidth:3,pointRadius:0,tension:0},
      {label:"SPY Buy & Hold",data:spy.values.map(value=>100*value/data.initial_value),borderColor:"#666666",borderWidth:2,borderDash:[6,4],pointRadius:0,tension:0}
    ]};
  }
  return {cashSeries,spySeries,compare,historicalComparison};
})();
if (typeof module !== "undefined" && module.exports) module.exports = FoxchaseBenchmarks;
