(function (root) {
  "use strict";

  // Laerer udelukkende af de oprindelige (raa) prognoser mod officielle priser.
  // v23: Medtager ogsaa i dag og i morgen, naar de officielle priser allerede er kendt
  // (MIN_AGE_DAYS = -1), og krymper ikke laengere korrektionen. Backtest paa
  // 26. sep.-23. okt. 2026 viste, at den gamle krympning (n/(n+10)) systematisk
  // underkorrigerede en vedvarende for lav prognose.
  const LOOKBACK_DAYS = 21;
  const MIN_AGE_DAYS = -1;
  const MIN_COMPLETE_DAYS = 10;
  const MAX_CORRECTION_DKK = 0.12;
  const CALIBRATION_VERSION = 2;

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
        if (!Number.isFinite(age) || age < MIN_AGE_DAYS || age > LOOKBACK_DAYS) continue;
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
    const adjustment = reliable ? Math.max(-MAX_CORRECTION_DKK, Math.min(MAX_CORRECTION_DKK, meanRawBias)) : 0;
    return { adjustment, sampleDays, meanRawBias, active: reliable, version: CALIBRATION_VERSION };
  }

  function adjustForecastSpot(spotExVat, adjustment) {
    const raw = Number(spotExVat);
    if (!Number.isFinite(raw)) return raw;
    return Math.max(-0.5, Math.min(5, raw + (Number.isFinite(adjustment) ? adjustment : 0)));
  }

  const api = { calculateCalibration, adjustForecastSpot, CALIBRATION_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ElprisCalibration = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
