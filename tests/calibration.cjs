"use strict";
const assert = require("node:assert/strict");
const { calculateCalibration, adjustForecastSpot, CALIBRATION_VERSION } = require("../calibration.js");

const asOf = "2026-10-13";
// 10 afsluttede doegn (3.-12. okt.) med raa prognose 0,80 og officiel pris 0,88 => bias +0,08.
const history = Array.from({length: 10}, (_, i) => {
  const target = new Date(Date.UTC(2026, 9, 3 + i)).toISOString().slice(0, 10) + "T12:00";
  return {area:"DK2", target, rawForecastSpotExVat:0.8, forecastSpotExVat:0.9, actualSpotExVat:0.88};
});
const approx = (x,y) => assert.ok(Math.abs(x-y)<1e-10, String(x) + " != " + String(y));
const result = calculateCalibration(history, "DK2", asOf);
assert.equal(CALIBRATION_VERSION, 2);
assert.equal(result.version, 2);
assert.equal(result.sampleDays,10);
assert.equal(result.active,true);
approx(result.meanRawBias,0.08);
// v23: ingen krympning laengere - fuld gennemsnitlig bias bruges (under loftet).
approx(result.adjustment,0.08);
approx(adjustForecastSpot(0.8,result.adjustment),0.88);
assert.equal(calculateCalibration(history.slice(1), "DK2", asOf).active,false);
approx(calculateCalibration(history.slice(1), "DK2", asOf).adjustment,0);
approx(calculateCalibration(history, "DK1", asOf).adjustment,0);
// Hvert doegn vaegtes ens, uanset antal timer.
const repeated = history.concat(Array.from({length:10}, ()=>({...history[0]})));
approx(calculateCalibration(repeated, "DK2", asOf).adjustment,0.08);
// v23: i dag (age 0) og i morgen (age -1) taeller med, naar de officielle priser er kendt.
const today = history.concat([{...history[0], target:"2026-10-13T12:00", actualSpotExVat:0.80}]);
approx(calculateCalibration(today, "DK2", asOf).sampleDays, 11);
approx(calculateCalibration(today, "DK2", asOf).adjustment, 0.8/11);
const tomorrow = history.concat([{...history[0], target:"2026-10-14T12:00", actualSpotExVat:0.80}]);
approx(calculateCalibration(tomorrow, "DK2", asOf).sampleDays, 11);
// Overmorgen (age -2) og aeldre end 21 dage ignoreres.
const tooFar = history.concat([{...history[0], target:"2026-10-15T12:00", actualSpotExVat:100}]);
approx(calculateCalibration(tooFar, "DK2", asOf).adjustment,0.08);
const tooOld = history.concat([{...history[0], target:"2026-09-21T12:00", actualSpotExVat:100}]);
approx(calculateCalibration(tooOld, "DK2", asOf).adjustment,0.08);
// Gamle raekker uden raa prognose bruger den gemte prognose.
const noRaw = history.map(({rawForecastSpotExVat,...rest})=>rest);
approx(calculateCalibration(noRaw, "DK2", asOf).adjustment,-0.02);
// Loft paa +/-0,12 kr/kWh.
const extremes = history.map(x=>({...x, actualSpotExVat:5}));
approx(calculateCalibration(extremes, "DK2", asOf).adjustment,0.12);
const negatives = history.map(x=>({...x, actualSpotExVat:0}));
approx(calculateCalibration(negatives, "DK2", asOf).adjustment,-0.12);
assert.equal(adjustForecastSpot(5,1),5);
assert.equal(adjustForecastSpot(-0.5,-1),-0.5);
console.log("Kalibreringskontroller bestaaet.");
