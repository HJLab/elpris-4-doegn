const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, aggregateToHours, mergeKnownHours, forecastPayloadToHours, ceriusTariff, fixedCostPerKwh, officialBasePrice, variablePrice, totalPrice, comparableAccuracyPrice, pricedAccuracyObservation, startOfDay, calendarHour, buildHorizon, bestChargeWindow, classifyDay, calculateAccuracy, dailyAccuracyReport, monthlyAccuracyReport, availableAccuracyMonths, shouldShowReviewReminder } = require("../app.js");

const records = [
  { TimeDK: "2026-08-29T10:00:00", PriceArea: "DK2", DayAheadPriceDKK: 400 },
  { TimeDK: "2026-08-29T10:15:00", PriceArea: "DK2", DayAheadPriceDKK: 600 },
  { TimeDK: "2026-08-29T10:30:00", PriceArea: "DK2", DayAheadPriceDKK: 800 },
  { TimeDK: "2026-08-29T10:45:00", PriceArea: "DK2", DayAheadPriceDKK: 1000 }
];
const hourly = aggregateToHours(records);
assert.equal(hourly.size, 1);
assert.equal([...hourly.values()][0].spotExVat, 0.7);
assert.equal([...hourly.values()][0].kind, "actual");

const forecastHours = forecastPayloadToHours([
  { date: "2026-08-29", type: "actual", prices: [{ hour: 10, price: 0.7 }] },
  { date: "2026-08-30", type: "forecast", prices: [{ hour: 10, price: 0.8 }] }
]);
assert.equal(forecastHours.size, 2);
assert.equal([...forecastHours.values()][0].kind, "actual");
assert.equal([...forecastHours.values()][1].kind, "forecast");

const mergedHours = mergeKnownHours(forecastHours, aggregateToHours([
  { TimeDK: "2026-08-30T10:00:00", PriceArea: "DK2", DayAheadPriceDKK: "900" },
  { TimeDK: "2026-08-30T10:15:00", PriceArea: "DK2", DayAheadPriceDKK: 1100 },
  { TimeDK: "2026-08-30T10:30:00", PriceArea: "DK2", DayAheadPriceDKK: 1000 },
  { TimeDK: "2026-08-30T10:45:00", PriceArea: "DK2", DayAheadPriceDKK: 1000 }
]));
assert.equal(mergedHours.get("2026-08-30T10:00").kind, "actual");
assert.equal(mergedHours.get("2026-08-30T10:00").spotExVat, 1);

assert.equal(ceriusTariff(new Date(2026, 7, 29, 3)), 0.1442);
assert.equal(ceriusTariff(new Date(2026, 7, 29, 12)), 0.2163);
assert.equal(ceriusTariff(new Date(2026, 7, 29, 18)), 0.5623);
assert.equal(ceriusTariff(new Date(2026, 9, 1, 3)), 0.1442);
assert.equal(ceriusTariff(new Date(2026, 9, 1, 12)), 0.4325);
assert.equal(ceriusTariff(new Date(2026, 9, 1, 18)), 1.2975);

const priceDate = new Date(2026, 7, 29, 12);
const baseCalculated = officialBasePrice(0.7, priceDate, DEFAULT_SETTINGS);
const variableCalculated = variablePrice(0.7, priceDate, DEFAULT_SETTINGS);
const calculated = totalPrice(0.7, priceDate, DEFAULT_SETTINGS);
assert.ok(baseCalculated > 1.24 && baseCalculated < 1.26);
assert.ok(variableCalculated > 1.35 && variableCalculated < 1.37);
assert.equal(calculated, variableCalculated);

const custom = normalizeSettings({ ...DEFAULT_SETTINGS, priceArea: "DK1", supplierSubscriptionMonthly: 100, gridSubscriptionMonthly: 50, annualConsumption: 3000 });
assert.equal(custom.priceArea, "DK1");
assert.equal(fixedCostPerKwh(custom), 0.6);
assert.equal(normalizeSettings({ annualConsumption: 0 }).annualConsumption, 100);

const exampleNow = new Date(2026, 7, 29, 16, 37);
assert.equal(startOfDay(exampleNow).getHours(), 0);
assert.equal(calendarHour(startOfDay(exampleNow), 24).getDate(), 30);
assert.equal(calendarHour(startOfDay(exampleNow), 24).getHours(), 0);
const horizon = buildHorizon(forecastHours, exampleNow);
assert.equal(horizon.length, 96);
assert.equal(horizon[0].date.getHours(), 0);
assert.equal(horizon[0].date.getDate(), 29);
assert.equal(horizon[23].date.getHours(), 23);
assert.equal(horizon[23].date.getDate(), 29);
assert.equal(horizon[24].date.getHours(), 0);
assert.equal(horizon[24].date.getDate(), 30);
assert.equal(horizon[10].kind, "actual");
assert.equal(horizon[34].kind, "forecast");

assert.equal(shouldShowReviewReminder(new Date(2026, 9, 21, 23, 59), null), false);
assert.equal(shouldShowReviewReminder(new Date(2026, 9, 22, 0, 0), null), true);
assert.equal(shouldShowReviewReminder(new Date(2026, 9, 22, 12, 0), "dismissed"), false);

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

const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`Expected ${b} got ${a}`);
const aDate=new Date(2026,9,8,18);
const customPrice=normalizeSettings({...DEFAULT_SETTINGS,supplierMarkupOre:27,supplierSubscriptionMonthly:100,gridSubscriptionMonthly:50,annualConsumption:3000});
approx(totalPrice(0.5,aDate,customPrice)-comparableAccuracyPrice(0.5,aDate,customPrice),0.27);
approx(comparableAccuracyPrice(0.5,aDate,customPrice),officialBasePrice(0.5,aDate,customPrice)+0.6);
const observation={area:"DK2",target:"2026-10-08T18:00",issuedAt:"2026-10-07T13:00:00Z",forecastSpotExVat:0.8,actualSpotExVat:0.5,errorOre:999};
approx(pricedAccuracyObservation(observation,customPrice).errorOre,37.5);
approx(calculateAccuracy([observation],7,aDate,"DK2",customPrice).averageOre,37.5);
const day=dailyAccuracyReport([observation],7,aDate,"DK2",customPrice);
approx(day.rows[0].forecastAverageOre/100,comparableAccuracyPrice(0.8,aDate,customPrice));
approx(day.rows[0].actualAverageOre/100,comparableAccuracyPrice(0.5,aDate,customPrice));
const month=monthlyAccuracyReport([observation],"2026-10","DK2",customPrice);
approx(month.rows[3].averageOre,37.5);
approx(month.rows[3].averagePercent,37.5/(comparableAccuracyPrice(0.5,aDate,customPrice)*100)*100);
assert.equal(pricedAccuracyObservation({...observation,forecastSpotExVat:null}),null);
assert.deepEqual(availableAccuracyMonths([{area:"DK2",target:"2026-07-01T01:00",forecastSpotExVat:1,actualSpotExVat:1}],new Date(2026,7,1),"DK2"),["2026-07"]);
console.log("Alle kernekontroller bestået.");
