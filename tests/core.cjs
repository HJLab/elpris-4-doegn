const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, aggregateToHours, forecastPayloadToHours, ceriusTariff, fixedCostPerKwh, totalPrice, buildHorizon, bestChargeWindow, classifyDay, calculateAccuracy } = require("../app.js");

const records = [
  { TimeDK: "2026-08-29T10:00:00", PriceArea: "DK2", DayAheadPriceDKK: 400 },
  { TimeDK: "2026-08-29T10:15:00", PriceArea: "DK2", DayAheadPriceDKK: 600 },
  { TimeDK: "2026-08-29T10:30:00", PriceArea: "DK2", DayAheadPriceDKK: 800 },
  { TimeDK: "2026-08-29T10:45:00", PriceArea: "DK2", DayAheadPriceDKK: 1000 }
];
const hourly = aggregateToHours(records);
assert.equal(hourly.size, 1);
assert.equal([...hourly.values()][0].spotExVat, 0.7);

const forecastHours = forecastPayloadToHours([
  { date: "2026-08-29", type: "actual", prices: [{ hour: 10, price: 0.7 }] },
  { date: "2026-08-30", type: "forecast", prices: [{ hour: 10, price: 0.8 }] }
]);
assert.equal(forecastHours.size, 2);
assert.equal([...forecastHours.values()][0].kind, "actual");
assert.equal([...forecastHours.values()][1].kind, "forecast");

assert.equal(ceriusTariff(new Date(2026, 7, 29, 3)), 0.1442);
assert.equal(ceriusTariff(new Date(2026, 7, 29, 12)), 0.2163);
assert.equal(ceriusTariff(new Date(2026, 7, 29, 18)), 0.5623);
assert.equal(ceriusTariff(new Date(2026, 11, 29, 18)), 1.2445);

const calculated = totalPrice(0.7, new Date(2026, 7, 29, 12), DEFAULT_SETTINGS);
assert.ok(calculated > 1.35 && calculated < 1.37);

const custom = normalizeSettings({ ...DEFAULT_SETTINGS, priceArea: "DK1", supplierSubscriptionMonthly: 100, gridSubscriptionMonthly: 50, annualConsumption: 3000 });
assert.equal(custom.priceArea, "DK1");
assert.equal(fixedCostPerKwh(custom), 0.6);
assert.equal(normalizeSettings({ annualConsumption: 0 }).annualConsumption, 100);

const horizon = buildHorizon(forecastHours, new Date(2026, 7, 29, 10));
assert.equal(horizon.length, 96);
assert.equal(horizon[0].kind, "actual");
assert.equal(horizon[1].kind, "forecast");

const charge = bestChargeWindow([
  { total: 3 }, { total: 2 }, { total: 1 }, { total: 1 }, { total: 1 }, { total: 4 }
]);
assert.equal(charge.average, 1);

const dayItems = Array.from({ length: 8 }, (_, index) => ({
  date: new Date(2026, 7, 29, index),
  total: [3, 2, 1, 1, 1, 4, 5, 6][index]
}));
const dayMarks = classifyDay(dayItems);
assert.equal(dayMarks.cheap.size, 3);
assert.equal(dayMarks.expensive.size, 3);
assert.equal(dayMarks.charge.average, 1);
assert.equal(dayMarks.mostExpensive.total, 6);

const accuracy = calculateAccuracy([
  { area: "DK1", target: "2026-08-29T01:00", errorOre: 10 },
  { area: "DK1", target: "2026-08-28T01:00", errorOre: 20 },
  { area: "DK2", target: "2026-08-28T01:00", errorOre: 99 },
  { area: "DK1", target: "2026-08-20T01:00", errorOre: 100 }
], 7, new Date(2026, 7, 29, 12), "DK1");
assert.equal(accuracy.averageOre, 15);
assert.equal(accuracy.coveredDays, 2);
assert.equal(accuracy.observations, 2);
console.log("Alle kernekontroller bestået.");
