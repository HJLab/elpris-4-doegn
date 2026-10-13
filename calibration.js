(function (root) {
  "use strict";

  // Laer udelukkende af afsluttede doegn og de oprindelige (ra) prognoser.
  const LOOKBACK_DAYS = 21;
  const MIN_COMPLETE_DAYS = 10;
  const SHRINKAGE_DAYS = 10;
  const MAX_CORRECTION_DKK = 0.12;

  function dayNumber(day) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
    const time = Date.parse(day + "T00:00:00Z");
    return Number.isFinite(time) ? Math.floor(time / 86400000) : NaN;
  }

  function calculateCalibration(observations, area, asOfDate) {
    const today = dayNumber(asOfDate);
    const daily = new Map();
    if (Number.isFinite(today) && Array.isArray(observations)) {
      for (const row of observations) {
        if (!row || row.area !== area || typeof row.target !== "string") continue;
        const targetDate = row.target.slice(0, 10);
        const age = today - dayNumber(targetDate);
        if (!Number.isFinite(age) || age < 1 || age > LOOKBACK_DAYS) continue;
        if (row.actualSpotExVat == null || (row.rawForecastSpotExVat ?? row.forecastSpotExVat) == null) continue;
        const raw = Number(row.rawForecastSpotExVat ?? row.forecastSpotExVat);
        const actual = Number(row.actualSpotExVat);
        if (!Number.isFinite(raw) || !Number.isFinite(actual)) continue;
        const day = daily.get(targetDate) || { sum: 0, count: 0 };
        day.sum += actual - raw;
        day.count++;
        daily.set(targetDate, day);
      }
    }
    const sampleDays = daily.size;
    const biases = [...daily.values()].map(day => day.sum / day.count);
    const meanRawBias = sampleDays ? biases.reduce((sum, x) => sum + x, 0) / sampleDays : 0;
    const reliable = sampleDays >= MIN_COMPLETE_DAYS;
    const shrunkBias = reliable ? meanRawBias * sampleDays / (sampleDays + SHRINKAGE_DAYS) : 0;
    const adjustment = Math.max(-MAX_CORRECTION_DKK, Math.min(MAX_CORRECTION_DKK, shrunkBias));
    return { adjustment, sampleDays, meanRawBias, active: reliable };
  }

  function adjustForecastSpot(spotExVat, adjustment) {
    const raw = Number(spotExVat);
    if (!Number.isFinite(raw)) return raw;
    return Math.max(-0.5, Math.min(5, raw + (Number.isFinite(adjustment) ? adjustment : 0)));
  }

  const api = { calculateCalibration, adjustForecastSpot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ElprisCalibration = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
