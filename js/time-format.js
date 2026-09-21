(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FoxchaseTime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const EASTERN_TIME_ZONE = "America/New_York";

  function formatChartTime(value, includeDate = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const options = {
      timeZone: EASTERN_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit"
    };
    if (includeDate) {
      options.month = "short";
      options.day = "numeric";
    }
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }

  function formatChartTooltipTime(value) {
    const formatted = formatChartTime(value, true);
    return formatted === "—" ? formatted : `${formatted} ET`;
  }

  function formatDurationMinutes(value) {
    if (
      value === null
      || value === undefined
      || (typeof value !== "number" && typeof value !== "string")
      || (typeof value === "string" && value.trim() === "")
    ) return "—";
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes < 0) return "—";

    const totalMinutes = Math.round(minutes);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const remainingMinutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h ${remainingMinutes}m`;
    if (hours > 0) return `${hours}h ${remainingMinutes}m`;
    return `${remainingMinutes}m`;
  }

  return { EASTERN_TIME_ZONE, formatChartTime, formatChartTooltipTime, formatDurationMinutes };
});
