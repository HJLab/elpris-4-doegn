const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, totalPrice } = require("../app.js");
// v24: gennemsnitlig samlet pris fra den 1. i måneden til og med den igangværende time.
{
  const { startOfMonth, monthAveragePrice } = require("../app.js");
  const s = normalizeSettings(DEFAULT_SETTINGS);
  const now = new Date(2026, 10, 3, 14, 25);
  assert.equal(startOfMonth(now).getTime(), new Date(2026, 10, 1).getTime());
  const hours = new Map();
  for (let d = new Date(2026, 9, 31, 20); d <= new Date(2026, 10, 4, 23); d = new Date(d.getTime() + 3600000)) {
    hours.set(d.toISOString(), { date: new Date(d), spotExVat: 0.5, kind: "actual" });
  }
  const r = monthAveragePrice(hours, now, s);
  assert.equal(r.hours, 24 + 24 + 15); // 1/11 og 2/11 hele døgn + 3/11 kl. 00–14
  assert.equal(r.expectedHours, 63);
  let sum = 0;
  for (const it of hours.values()) if (it.date >= new Date(2026, 10, 1) && it.date <= new Date(2026, 10, 3, 14)) sum += totalPrice(0.5, it.date, s);
  assert.ok(Math.abs(r.average - sum / 63) < 1e-12);
  // Prognosetimer tæller aldrig med.
  hours.set("x", { date: new Date(2026, 10, 2, 5, 0), spotExVat: 99, kind: "forecast" });
  assert.ok(Math.abs(monthAveragePrice(hours, now, s).average - sum / 63) < 1e-12);
  assert.equal(monthAveragePrice(new Map(), now, s).average, null);
}
console.log("Månedsgennemsnit bestået.");
