const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, energinetTariffInclVat, officialBasePrice } = require("../app.js");
// v29: Energinets tarif er datostyret: 11,5 øre ekskl. moms i 2026, 10,5 øre fra 1. januar 2027.
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
near(energinetTariffInclVat(new Date(2026, 11, 31, 23)), 0.115 * 1.25);
near(energinetTariffInclVat(new Date(2027, 0, 1, 0)), 0.105 * 1.25);
near(energinetTariffInclVat(new Date(2027, 5, 15, 12)), 0.105 * 1.25);
near(energinetTariffInclVat(new Date(2026, 9, 15, 12)), 0.115 * 1.25);
// Senere år bruger seneste kendte sats.
near(energinetTariffInclVat(new Date(2028, 0, 1)), 0.105 * 1.25);
// Totalprisen falder præcis 1,25 øre/kWh inkl. moms ved årsskiftet (samme time på dagen, samme nettarif-sæson).
const s = normalizeSettings(DEFAULT_SETTINGS);
const dec = officialBasePrice(0.8, new Date(2026, 11, 30, 15), s);
const jan = officialBasePrice(0.8, new Date(2027, 0, 5, 15), s);
near(dec - jan, 0.0125);
console.log("Energinet-tarif 2026/2027 bestået.");
