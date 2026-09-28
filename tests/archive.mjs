import assert from "node:assert/strict";
import { addNaiveHours, forecastPoints, actualPriceMap, scoreSnapshots, shouldRun, hasSnapshotsForDate } from "../scripts/archive-forecast.mjs";

assert.equal(addNaiveHours("2026-08-29T23:00", 2), "2026-08-30T01:00");
assert.equal(shouldRun(10, false), false);
assert.equal(shouldRun(11, false), true);
assert.equal(shouldRun(19, false), true);
assert.equal(shouldRun(8, true), true);
assert.equal(hasSnapshotsForDate([
  { area: "DK1", collectedDate: "2026-10-25" },
  { area: "DK2", collectedDate: "2026-10-25" }
], "2026-10-25"), true);
assert.equal(hasSnapshotsForDate([
  { area: "DK1", collectedDate: "2026-10-25" }
], "2026-10-25"), false);

const points = forecastPoints({ days: [
  { date: "2026-08-29", type: "actual", prices: [{ hour: 23, price: 9 }] },
  { date: "2026-08-30", type: "forecast", prices: [{ hour: 0, price: 1 }, { hour: 1, price: 1.2 }] }
] }, "2026-08-29T23:00", "2026-08-30T02:00");
assert.equal(points.length, 2);

const actual = actualPriceMap({ records: [
  { TimeDK: "2026-08-30T00:00:00", DayAheadPriceDKK: 700 },
  { TimeDK: "2026-08-30T00:15:00", DayAheadPriceDKK: 800 },
  { TimeDK: "2026-08-30T00:30:00", DayAheadPriceDKK: 900 },
  { TimeDK: "2026-08-30T00:45:00", DayAheadPriceDKK: 800 },
  { TimeDK: "2026-08-30T01:00:00", DayAheadPriceDKK: 1000 },
  { TimeDK: "2026-08-30T01:15:00", DayAheadPriceDKK: 1100 },
  { TimeDK: "2026-08-30T01:30:00", DayAheadPriceDKK: 1200 },
  { TimeDK: "2026-08-30T01:45:00", DayAheadPriceDKK: 1100 }
] });
const scored = scoreSnapshots([{ area: "DK1", collectedAt: "2026-08-29T13:00:00Z", points }], actual, "DK1");
assert.equal(scored.length, 2);
assert.equal(scored[0].area, "DK1");
assert.equal(scored[0].errorOre, 20);
assert.equal(scored[1].errorOre, 10);
assert.equal(scored[0].forecastSpotExVat, 1);
assert.equal(scored[0].actualSpotExVat, 0.8);

const futureActual = actualPriceMap({ days: [{ date: "2026-08-31", prices: [{ hour: 0, price: 0.5 }] }] });
const futureScored = scoreSnapshots([{ area: "DK1", collectedAt: "2026-08-29T13:00:00Z", points: [{ target: "2026-08-31T00:00", forecastSpotExVat: 0.7 }] }], futureActual, "DK1");
assert.equal(futureScored.length, 1);
assert.equal(futureScored[0].errorOre, 20);

console.log("Arkiveringskontroller bestået.");
