"use strict";

function canonicalArtifactState(payload, nowMilliseconds = Date.now()) {
  const historicalPoints = Array.isArray(payload && payload.points)
    ? payload.points
    : [];
  const timestamp = payload && payload.updated_at;
  if (typeof timestamp !== "string" || !timestamp.trim()) {
    return unavailable("timestamp_missing", historicalPoints);
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp.trim())) {
    return unavailable("timestamp_lacks_timezone", historicalPoints);
  }
  const updatedMilliseconds = Date.parse(timestamp);
  if (!Number.isFinite(updatedMilliseconds)) {
    return unavailable("timestamp_malformed", historicalPoints);
  }
  const ageMilliseconds = nowMilliseconds - updatedMilliseconds;
  if (ageMilliseconds < -60 * 1000) {
    return unavailable("future_timestamp", historicalPoints);
  }
  const performance = payload.performance;
  if (!performance || performance.flow_adjusted !== true) {
    return unavailable("performance_not_canonical", historicalPoints);
  }
  const baseIndex = Number(performance.base_index);
  const currentIndex = Number(performance.current_index);
  const totalReturn = Number(performance.total_return_pct);
  if (
    !Number.isFinite(baseIndex)
    || !Number.isFinite(currentIndex)
    || !Number.isFinite(totalReturn)
    || Math.abs(baseIndex - 100) > 1e-9
    || Math.abs(totalReturn - (currentIndex - baseIndex)) > 1e-6
  ) {
    return unavailable("performance_inconsistent", historicalPoints);
  }

  const calendar = payload.market_session_calendar;
  if (!calendar || calendar.source !== "alpaca_market_calendar") {
    return unavailable("session_calendar_missing", historicalPoints);
  }
  const coverageStart = awareTimestampMilliseconds(calendar.coverage_start);
  const coverageEnd = awareTimestampMilliseconds(calendar.coverage_end);
  if (
    coverageStart === null
    || coverageEnd === null
    || coverageEnd <= coverageStart
    || nowMilliseconds < coverageStart
    || nowMilliseconds >= coverageEnd
  ) {
    return unavailable("session_calendar_stale", historicalPoints);
  }
  if (!Array.isArray(calendar.sessions)) {
    return unavailable("session_calendar_malformed", historicalPoints);
  }
  let expectedUpdate = false;
  let priorClose = null;
  for (const session of calendar.sessions) {
    const openAt = awareTimestampMilliseconds(session && session.open_at);
    const closeAt = awareTimestampMilliseconds(session && session.close_at);
    if (
      openAt === null
      || closeAt === null
      || closeAt <= openAt
      || (priorClose !== null && openAt < priorClose)
    ) {
      return unavailable("session_calendar_malformed", historicalPoints);
    }
    priorClose = closeAt;
    if (openAt <= nowMilliseconds && nowMilliseconds <= closeAt) {
      expectedUpdate = true;
    }
  }

  const maxAgeSeconds = 20 * 60;
  if (expectedUpdate && ageMilliseconds > maxAgeSeconds * 1000) {
    return unavailable("stale", historicalPoints, timestamp);
  }
  const dataStatus = expectedUpdate ? "live" : "latest_closed_session";
  return {
    isFresh: dataStatus === "live",
    valuesAvailable: true,
    dataStatus,
    asOfTimestamp: timestamp,
    reason: null,
    livePerformance: performance,
    livePerformanceFallback: null,
    historicalPoints,
  };
}

function awareTimestampMilliseconds(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unavailable(reason, historicalPoints, asOfTimestamp = null) {
  return {
    isFresh: false,
    valuesAvailable: false,
    dataStatus: "stale",
    asOfTimestamp,
    reason,
    livePerformance: null,
    livePerformanceFallback: null,
    historicalPoints,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { canonicalArtifactState };
}
