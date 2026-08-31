import assert from "node:assert/strict";
import { addNaiveHours, forecastPoints, actualPriceMap, scoreSnapshots } from "../scripts/archive-forecast.mjs";

assert.equal(addNaiveHours("2026-08-29T23:00", 2), "2026-08-30T01:00");

const points = forecastPoints({ days: [
  { date: "2026-08-29", type: "actual", prices: [{ hour: 23, price: 9 }] },
  { date: "2026-08-30", type: "forecast", prices: [{ hour: 0, price: 1 }, { hour: 1, price: 1.2 }] }
] }, "2026-08-29T23:00", "2026-08-30T02:00");
assert.equal(points.length, 2);

const actual = actualPriceMap({ days: [
  { date: "2026-08-30", prices: [{ hour: 0, price: 0.8 }, { hour: 1, price: 1.1 }] }
] });
const scored = scoreSnapshots([{ area: "DK1", collectedAt: "2026-08-29T13:00:00Z", points }], actual, "2026-08-31", "DK1");
assert.equal(scored.length, 2);
assert.equal(scored[0].area, "DK1");
assert.equal(scored[0].errorOre, 25);
assert.equal(scored[1].errorOre, 12.5);
assert.equal(scored[0].forecastSpotExVat, 1);
assert.equal(scored[0].actualSpotExVat, 0.8);

console.log("Arkiveringskontroller bestået.");
