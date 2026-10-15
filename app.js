"use strict";

const CONFIG = Object.freeze({
  horizonHours: 96,
  energinetTariffInclVat: 0.115 * 1.25,
  electricityTaxInclVat: 0.008 * 1.25,
  ceriusInclVat: {
    summer: { low: 0.1442, high: 0.2163, peak: 0.5623 },
    winter: { low: 0.1442, high: 0.4325, peak: 1.2975 }
  },
  // Radius Elnet, privat C-kunde: gældende fra 1. april / 1. oktober 2026.
  // Nettariffer i kr./kWh inkl. moms; abonnementer angives separat pr. bruger.
  radiusInclVat: {
    summer: { low: 0.1327, high: 0.1991, peak: 0.5176 },
    winter: { low: 0.1327, high: 0.3982, peak: 1.1945 }
  }
});

const DEFAULT_SETTINGS = Object.freeze({
  priceArea: "DK2", gridCompany: "radius", supplier: "Modstrøm", product: "",
  supplierMarkupOre: 11, supplierSubscriptionMonthly: 0,
  annualConsumption: 4000, gridSubscriptionMonthly: 0,
  gridLow: 0.1442, gridHigh: 0.2163, gridPeak: 0.5623
});
// Bevar den gamle Cerius-standard til den sikre v20-genoprettelse af 0-tillæg.
const LEGACY_CERIUS_DEFAULT_SETTINGS = Object.freeze({ ...DEFAULT_SETTINGS, gridCompany: "cerius" });
const SETTINGS_KEY = "elpris-user-settings-v1";
const GRID_NOTICE_DISMISSED_KEY = "elpris-radius-notice-dismissed-v21";
const MARKUP_REPAIR_KEY = "elpris-markup-repair-v20";
const REVIEW_REMINDER_DATE = "2026-10-22";
const REVIEW_REMINDER_KEY = "elpris-review-reminder-2026-10-22";
const fmtPrice = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short" });
const fmtDateLong = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtHistoryUpdated = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false
});

const hasDocument = typeof document !== "undefined";
const CALIBRATION = typeof module !== "undefined" && module.exports
  ? require("./calibration.js")
  : globalThis.ElprisCalibration;
const $ = (id) => hasDocument ? document.getElementById(id) : null;
const ui = hasDocument ? {
  statusPanel: $("statusPanel"), statusText: $("statusText"), refresh: $("refreshButton"),
  markupNotice: $("markupNotice"), markupNoticeText: $("markupNoticeText"), markupFixButton: $("markupFixButton"), markupUndoButton: $("markupUndoButton"),
  gridNotice: $("gridNotice"), gridSwitchButton: $("gridSwitchButton"), gridKeepButton: $("gridKeepButton"),
  summary: $("summary"), legend: $("legend"), daysHelp: $("daysHelp"), days: $("days"), updatedAt: $("updatedAt"),
  currentPrice: $("currentPrice"), currentKind: $("currentKind"),
  bestPrice: $("bestPrice"), bestTime: $("bestTime"),
  expensivePrice: $("expensivePrice"), expensiveTime: $("expensiveTime"),
  accuracyValue: $("accuracyValue"), accuracyCoverage: $("accuracyCoverage"), accuracyUpdatedAt: $("accuracyUpdatedAt"),
  dailyAccuracyList: $("dailyAccuracyList"),
  forecastAuditInfo: $("forecastAuditInfo"), forecastAuditDate: $("forecastAuditDate"),
  forecastAuditTable: $("forecastAuditTable"), forecastAuditStatus: $("forecastAuditStatus"),
  monthlyAccuracyDetails: $("monthlyAccuracyDetails"), monthlyAccuracyMonth: $("accuracyMonth"),
  monthlyAccuracyIntro: $("monthlyAccuracyIntro"), monthlyAccuracyRows: $("monthlyAccuracyRows"), monthlyAccuracyCoverage: $("monthlyAccuracyCoverage"),
  profileSummary: $("profileSummary"), accuracyComparisonNote: $("accuracyComparisonNote"), settingsButton: $("settingsButton"),
  settingsDialog: $("settingsDialog"), settingsForm: $("settingsForm"),
  manualTariffs: $("manualTariffs"), calculationExplanation: $("calculationExplanation"),
  calculationButton: $("calculationButton"), calculationDialog: $("calculationDialog"), closeCalculationButton: $("closeCalculationButton"),
  reviewReminderDialog: $("reviewReminderDialog"), reviewReminderButton: $("reviewReminderButton")
} : {};

let accuracyObservations = [];
let forecastSnapshots = [];
let selectedForecastDate = "";
let officialSpotForAudit = new Map();
let selectedAccuracyDays = 7;
let selectedAccuracyMonth = "";
let markupRepairApplied = false;
let settings = readSettings();

function finiteNumber(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeSettings(value = {}) {
  const area = value.priceArea === "DK1" ? "DK1" : "DK2";
  const gridCompany = ["radius", "cerius", "manual"].includes(value.gridCompany)
    ? value.gridCompany : DEFAULT_SETTINGS.gridCompany;
  const supplier = String(value.supplier || DEFAULT_SETTINGS.supplier).slice(0, 60);
  return {
    priceArea: area, gridCompany, supplier,
    product: String(value.product || "").slice(0, 60),
    supplierMarkupOre: finiteNumber(value.supplierMarkupOre == null || value.supplierMarkupOre === ""
      ? DEFAULT_SETTINGS.supplierMarkupOre : value.supplierMarkupOre, DEFAULT_SETTINGS.supplierMarkupOre, 0, 500),
    supplierSubscriptionMonthly: finiteNumber(value.supplierSubscriptionMonthly, 0, 0, 2000),
    annualConsumption: finiteNumber(value.annualConsumption, DEFAULT_SETTINGS.annualConsumption, 100, 100000),
    gridSubscriptionMonthly: finiteNumber(value.gridSubscriptionMonthly, 0, 0, 2000),
    gridLow: finiteNumber(value.gridLow, DEFAULT_SETTINGS.gridLow, 0, 10),
    gridHigh: finiteNumber(value.gridHigh, DEFAULT_SETTINGS.gridHigh, 0, 10),
    gridPeak: finiteNumber(value.gridPeak, DEFAULT_SETTINGS.gridPeak, 0, 10)
  };
}

// Gendan kun gammel standardprofil, ikke profiler med egen elaftale eller egne tal.
function shouldRepairLegacyZeroMarkup(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (raw.supplierMarkupOre == null || raw.supplierMarkupOre === "" || Number(raw.supplierMarkupOre) !== 0) return false;
  const candidate = normalizeSettings(raw);
  return [DEFAULT_SETTINGS, LEGACY_CERIUS_DEFAULT_SETTINGS].some((defaults) =>
    Object.keys(defaults).every((key) =>
      key === "supplierMarkupOre" || candidate[key] === defaults[key]));
}

function readSettings() {
  if (typeof localStorage === "undefined") return normalizeSettings(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    const loaded = normalizeSettings(saved || DEFAULT_SETTINGS);
    if (localStorage.getItem(MARKUP_REPAIR_KEY) !== "reviewed" && shouldRepairLegacyZeroMarkup(saved)) {
      const repaired = { ...loaded, supplierMarkupOre: DEFAULT_SETTINGS.supplierMarkupOre };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(repaired));
      localStorage.setItem(MARKUP_REPAIR_KEY, "repaired");
      markupRepairApplied = true;
      return repaired;
    }
    return loaded;
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

function saveSettings(next) {
  settings = normalizeSettings(next);
  markupRepairApplied = false;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(MARKUP_REPAIR_KEY, "reviewed");
  }
  return settings;
}

function areaName(area) { return area === "DK1" ? "Vestdanmark" : "Østdanmark"; }
function cacheKey(area = settings.priceArea) { return `elpris-${area.toLowerCase()}-cache-v4`; }

function localIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:00`;
}

function parseDanishTime(value) {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, h, min || 0, 0, 0);
}

function floorHour(date) {
  const copy = new Date(date);
  copy.setMinutes(0, 0, 0);
  return copy;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function calendarHour(dayStart, index) {
  const date = new Date(dayStart);
  date.setDate(dayStart.getDate() + Math.floor(index / 24));
  date.setHours(index % 24, 0, 0, 0);
  return date;
}

function hourKey(date) { return localIso(floorHour(date)); }
function addHours(date, hours) { return new Date(date.getTime() + hours * 3600000); }
function addDays(date, days) { return new Date(date.getTime() + days * 86400000); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }

async function fetchJsonWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function dateKey(date) { return localIso(date).slice(0, 10); }

function dayAheadUrl(area = settings.priceArea, now = new Date()) {
  const start = startOfDay(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const filter = encodeURIComponent(JSON.stringify({ PriceArea: [area] }));
  return `https://api.energidataservice.dk/dataset/DayAheadPrices?start=${dateKey(start)}&end=${dateKey(end)}&columns=TimeDK,PriceArea,DayAheadPriceDKK&filter=${filter}&sort=TimeDK&limit=0`;
}

async function fetchForecastSource() {
  const payload = await fetchJsonWithTimeout(`https://elpriser.org/api/forecast?area=${settings.priceArea}&mode=spot_ex`);
  if (!Array.isArray(payload.days) || !payload.days.length) throw new Error("Prognosekilden returnerede ingen priser");
  return payload;
}

async function fetchOfficialSource() {
  const payload = await fetchJsonWithTimeout(dayAheadUrl());
  if (!Array.isArray(payload.records)) throw new Error("Energinet returnerede ikke DayAheadPrices-data");
  return payload.records;
}

async function fetchRecords() {
  const [forecastResult, officialResult] = await Promise.allSettled([fetchForecastSource(), fetchOfficialSource()]);
  if (forecastResult.status === "rejected" && officialResult.status === "rejected") {
    throw new Error("Både prognosekilden og Energinet fejlede");
  }
  const forecastPayload = forecastResult.status === "fulfilled" ? forecastResult.value : null;
  const saved = {
    savedAt: new Date().toISOString(),
    generatedAt: forecastPayload?.generated || null,
    days: forecastPayload?.days || [],
    officialRecords: officialResult.status === "fulfilled" ? officialResult.value : [],
    officialSourceOk: officialResult.status === "fulfilled",
    forecastSourceOk: forecastResult.status === "fulfilled"
  };
  localStorage.setItem(cacheKey(), JSON.stringify(saved));
  return { ...saved, savedAt: new Date(saved.savedAt), fromCache: false };
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()));
    if (!cached || (!cached.days?.length && !cached.officialRecords?.length)) return null;
    return { ...cached, officialRecords: cached.officialRecords || [], savedAt: new Date(cached.savedAt), fromCache: true };
  } catch { return null; }
}

function forecastPayloadToHours(days) {
  const hours = new Map();
  for (const day of days) {
    if (!day?.date || !Array.isArray(day.prices)) continue;
    const [year, month, dateOfMonth] = day.date.split("-").map(Number);
    for (const point of day.prices) {
      const hour = Number(point.hour);
      const price = Number(point.price);
      if (!Number.isInteger(hour) || !Number.isFinite(price)) continue;
      const date = new Date(year, month - 1, dateOfMonth, hour, 0, 0, 0);
      hours.set(hourKey(date), {
        date,
        spotExVat: price,
        kind: day.type === "actual" ? "actual" : "forecast"
      });
    }
  }
  return hours;
}

function aggregateToHours(records, priceArea = settings.priceArea) {
  const buckets = new Map();
  for (const record of records) {
    const price = Number(record.DayAheadPriceDKK);
    if (record.PriceArea !== priceArea || !record.TimeDK || !Number.isFinite(price)) continue;
    const date = floorHour(parseDanishTime(record.TimeDK));
    const key = hourKey(date);
    if (!buckets.has(key)) buckets.set(key, { date, values: [] });
    buckets.get(key).values.push(price / 1000);
  }
  const hours = new Map();
  for (const [key, bucket] of buckets) hours.set(key, { date: bucket.date, spotExVat: mean(bucket.values), kind: "actual" });
  return hours;
}

function mergeKnownHours(forecastHours, officialHours) {
  const merged = new Map(forecastHours);
  for (const [key, item] of officialHours) merged.set(key, { ...item, kind: "actual" });
  return merged;
}

function forecastSpot(target, knownHours) {
  const candidates = [];
  for (const item of knownHours.values()) {
    if (item.date.getHours() === target.getHours()) candidates.push(item.spotExVat);
  }
  if (!candidates.length) {
    for (const item of knownHours.values()) candidates.push(item.spotExVat);
  }
  return Math.max(-0.5, Math.min(5, mean(candidates) ?? 0));
}

function seasonalGridTariff(date, tariffSet) {
  const summer = date.getMonth() >= 3 && date.getMonth() <= 8;
  const rates = summer ? tariffSet.summer : tariffSet.winter;
  const hour = date.getHours();
  if (hour < 6) return rates.low;
  if (hour >= 17 && hour < 21) return rates.peak;
  return rates.high;
}

function ceriusTariff(date) { return seasonalGridTariff(date, CONFIG.ceriusInclVat); }
function radiusTariff(date) { return seasonalGridTariff(date, CONFIG.radiusInclVat); }

function gridTariff(date, activeSettings = settings) {
  if (activeSettings.gridCompany === "radius") return radiusTariff(date);
  if (activeSettings.gridCompany === "cerius") return ceriusTariff(date);
  const hour = date.getHours();
  if (hour < 6) return activeSettings.gridLow;
  if (hour >= 17 && hour < 21) return activeSettings.gridPeak;
  return activeSettings.gridHigh;
}

function fixedCostPerKwh(activeSettings = settings) {
  return ((activeSettings.supplierSubscriptionMonthly + activeSettings.gridSubscriptionMonthly) * 12) /
    activeSettings.annualConsumption;
}

function officialBasePrice(spotExVat, date, activeSettings = settings) {
  const spotInclVat = spotExVat * 1.25;
  return spotInclVat + CONFIG.energinetTariffInclVat + CONFIG.electricityTaxInclVat +
    gridTariff(date, activeSettings);
}

function variablePrice(spotExVat, date, activeSettings = settings) {
  return officialBasePrice(spotExVat, date, activeSettings) + activeSettings.supplierMarkupOre / 100;
}

function totalPrice(spotExVat, date, activeSettings = settings) {
  return variablePrice(spotExVat, date, activeSettings) + fixedCostPerKwh(activeSettings);
}

function buildHorizon(knownHours, now = new Date(), activeSettings = settings, correction = 0) {
  const start = startOfDay(now);
  return Array.from({ length: CONFIG.horizonHours }, (_, index) => {
    const date = calendarHour(start, index);
    const known = knownHours.get(hourKey(date));
    const originalSpot = known ? known.spotExVat : forecastSpot(date, knownHours);
    // Only forecast prices are calibrated. Published official prices are untouched.
    const spotExVat = known?.kind === "actual" ? originalSpot
      : CALIBRATION.adjustForecastSpot(originalSpot, correction);
    return {
      date,
      spotExVat,
      officialBase: officialBasePrice(spotExVat, date, activeSettings),
      variable: variablePrice(spotExVat, date, activeSettings),
      fixed: fixedCostPerKwh(activeSettings),
      total: totalPrice(spotExVat, date, activeSettings),
      kind: known?.kind || "forecast"
    };
  });
}

function classifyDay(items) {
  const sorted = [...items].sort((a, b) => a.total - b.total);
  const charge = bestChargeWindow(items);
  const cheap = new Set(charge.items.map((x) => hourKey(x.date)));
  const expensive = new Set(sorted.slice(-3).map((x) => hourKey(x.date)));
  return { cheap, expensive, charge, mostExpensive: sorted.at(-1) };
}

function bestChargeWindow(items, length = 3) {
  let best = null;
  for (let i = 0; i <= items.length - length; i++) {
    const slice = items.slice(i, i + length);
    const average = mean(slice.map((x) => x.total));
    if (!best || average < best.average) best = { items: slice, average };
  }
  return best;
}

// The log uses exactly the same all-inclusive kWh price as the hourly view.
// History remains raw spot prices; we reprice with current settings only when shown.
function comparableAccuracyPrice(spotExVat, date, activeSettings = settings) {
  return totalPrice(spotExVat, date, activeSettings);
}
// Audit rows keep the original spot forecast separate from the subsequently
// calibrated forecast; personal kWh markup is included exactly once in every price.
function pricedForecastAuditRow(item, activeSettings = settings) {
  if (typeof item?.target !== "string" || item.forecastSpotExVat == null) return null;
  const forecastSpot = Number(item.forecastSpotExVat);
  const hasRaw = item.rawForecastSpotExVat != null && Number.isFinite(Number(item.rawForecastSpotExVat));
  const rawSpot = hasRaw ? Number(item.rawForecastSpotExVat) : forecastSpot;
  const hasActual = item.actualSpotExVat != null && Number.isFinite(Number(item.actualSpotExVat));
  const date = parseDanishTime(item.target);
  if (!Number.isFinite(forecastSpot) || !Number.isFinite(date.getTime())) return null;

  const originalPriceOre = comparableAccuracyPrice(rawSpot, date, activeSettings) * 100;
  const forecastPriceOre = comparableAccuracyPrice(forecastSpot, date, activeSettings) * 100;
  const actualPriceOre = hasActual
    ? comparableAccuracyPrice(Number(item.actualSpotExVat), date, activeSettings) * 100
    : null;
  const errorOre = hasActual ? Math.abs(forecastPriceOre - actualPriceOre) : null;
  const originalErrorOre = hasActual && hasRaw ? Math.abs(originalPriceOre - actualPriceOre) : null;
  return {
    ...item,
    hasCalibration: hasRaw,
    originalPriceOre,
    forecastPriceOre,
    adjustmentOre: hasRaw ? forecastPriceOre - originalPriceOre : null,
    actualPriceOre,
    signedErrorOre: hasActual ? forecastPriceOre - actualPriceOre : null,
    errorOre,
    originalErrorOre,
    improvementOre: originalErrorOre == null ? null : originalErrorOre - errorOre
  };
}

function pricedAccuracyObservation(item, activeSettings = settings) {
  const priced = pricedForecastAuditRow(item, activeSettings);
  return priced?.actualPriceOre == null ? null : priced;
}

function latestForecastSnapshot(snapshots, area) {
  if (!Array.isArray(snapshots)) return null;
  let latest = null;
  for (const snapshot of snapshots) {
    if (snapshot?.area !== area || !Array.isArray(snapshot.points)) continue;
    if (!latest || String(snapshot.collectedAt || "") > String(latest.collectedAt || "")) latest = snapshot;
  }
  return latest;
}
function calculateAccuracy(observations, days, now = new Date(), priceArea = settings.priceArea, activeSettings = settings) {
  const cutoff = new Date(now);
  cutoff.setHours(0,0,0,0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  const nextDay = startOfDay(now);
  nextDay.setDate(nextDay.getDate() + 1);
  const latestByTarget = new Map();
  for (const item of observations) {
    if (typeof item?.target !== "string" || (item.area || "DK2") !== priceArea) continue;
    const targetDate = parseDanishTime(item.target);
    if (!Number.isFinite(targetDate.getTime()) || targetDate < cutoff || targetDate >= nextDay) continue;
    const priced = pricedAccuracyObservation(item,activeSettings);
    if (!priced) continue;
    const prev=latestByTarget.get(item.target);
    if (!prev || String(item.issuedAt||"")>String(prev.issuedAt||"")) latestByTarget.set(item.target,priced);
  }
  const usable=[...latestByTarget.values()].sort((a,b)=>a.target.localeCompare(b.target));
  return {averageOre:usable.length ? mean(usable.map(x=>x.errorOre)) : null,coveredDays:new Set(usable.map(x=>x.target.slice(0,10))).size,observations:usable.length,items:usable};
}

function dailyAccuracyReport(observations, days, now = new Date(), priceArea = settings.priceArea, activeSettings = settings) {
  const result = calculateAccuracy(observations, days, now, priceArea, activeSettings);
  const groups = new Map();
  for (const item of result.items) {
    const date = item.target.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(item);
  }
  const rows = [...groups.entries()].map(([date, items]) => {
    const sorted = [...items].sort((a, b) => a.target.localeCompare(b.target));
    const best = [...sorted].sort((a, b) => Number(a.errorOre) - Number(b.errorOre))[0];
    const worst = [...sorted].sort((a, b) => Number(b.errorOre) - Number(a.errorOre))[0];
    return {
      date,
      averageOre: mean(sorted.map((item) => Number(item.errorOre))),
      forecastAverageOre: mean(sorted.map((item) => item.forecastPriceOre)),
      actualAverageOre: mean(sorted.map((item) => item.actualPriceOre)),
      items: sorted,
      adjustedHours: sorted.filter((item) => item.hasCalibration).length,
      averageAdjustmentOre: sorted.some((item) => item.hasCalibration)
        ? mean(sorted.filter((item) => item.hasCalibration).map((item) => item.adjustmentOre)) : null,
      averageImprovementOre: sorted.some((item) => item.hasCalibration)
        ? mean(sorted.filter((item) => item.hasCalibration).map((item) => item.improvementOre)) : null,
      observations: sorted.length,
      complete: sorted.length === 24,
      best,
      worst
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
  return { ...result, rows };
}

function monthKey(value) { return String(value || "").slice(0, 7); }

function monthLabel(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function timeBand(target) {
  const hour = Number(String(target).slice(11, 13));
  if (hour < 6) return "00:00–06:00";
  if (hour < 12) return "06:00–12:00";
  if (hour < 18) return "12:00–18:00";
  return "18:00–24:00";
}

function monthlyAccuracyReport(observations, month, priceArea = settings.priceArea, activeSettings = settings) {
  const bands=["00:00–06:00","06:00–12:00","12:00–18:00","18:00–24:00"];
  const groups=new Map(bands.map(x=>[x,[]]));
  const usable=observations.filter(x=>(x.area||"DK2")===priceArea && monthKey(x.target)===month).map(x=>pricedAccuracyObservation(x,activeSettings)).filter(Boolean);
  for(const item of usable) groups.get(timeBand(item.target)).push(item);
  const rows=bands.map(band=>{
    const items=groups.get(band);
    const pct=items.filter(x=>Math.abs(x.actualPriceOre)>=1).map(x=>x.errorOre/Math.abs(x.actualPriceOre)*100);
    return {band,averageOre:items.length?mean(items.map(x=>x.errorOre)):null,averagePercent:pct.length?mean(pct):null,observations:items.length};
  });
  return {rows,observations:usable.length,coveredDays:new Set(usable.map(x=>x.target.slice(0,10))).size};
}

function availableAccuracyMonths(observations, now = new Date(), priceArea = settings.priceArea) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return [...new Set(observations
    .filter((item) => (item.area || "DK2") === priceArea && monthKey(item.target) < currentMonth && Number.isFinite(Number(item.forecastSpotExVat)) && Number.isFinite(Number(item.actualSpotExVat)))
    .map((item) => monthKey(item.target)))]
    .filter(Boolean)
    .sort()
    .reverse();
}

function renderAccuracy(days = selectedAccuracyDays) {
  selectedAccuracyDays = days;
  const result = dailyAccuracyReport(accuracyObservations, days);
  document.querySelectorAll(".accuracy-period").forEach((button) => {
    const active = Number(button.dataset.days) === days;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (result.averageOre === null) {
    ui.accuracyValue.textContent = "Indsamler data…";
    ui.accuracyCoverage.textContent = "Der er endnu ingen afsluttede prognoser i den valgte periode.";
    ui.dailyAccuracyList.replaceChildren();
    return;
  }
  ui.accuracyValue.textContent = `${fmtPrice.format(result.averageOre)} øre/kWh forkert`;
  ui.accuracyCoverage.textContent = `Baseret på ${result.observations} timepriser fordelt over ${result.coveredDays} døgn · ${result.coveredDays} af ${days} dage med data`;
  renderDailyAccuracy(result.rows);
}


function formatAuditOre(value) {
  return Number.isFinite(value) ? fmtPrice.format(value) : "—";
}

function formatAuditSignedOre(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "0,00";
  return (value > 0 ? "+" : "−") + fmtPrice.format(Math.abs(value));
}

// One common, mobile-scrollable table for saved and finished forecasts.
function makeForecastAuditTable(rows, captionText) {
  const wrapper = document.createElement("div");
  wrapper.className = "forecast-audit-table-wrap";
  wrapper.tabIndex = 0;
  wrapper.setAttribute("aria-label", "Timepriser i en tabel, der kan rulles vandret");
  const table = document.createElement("table");
  table.className = "forecast-audit-table";
  const caption = document.createElement("caption");
  caption.textContent = captionText;
  table.append(caption);
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["Kl.", "Oprindelig", "Justering", "Efter", "Officiel", "Fejl"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    header.append(th);
  }
  thead.append(header);
  const tbody = document.createElement("tbody");
  for (const point of rows) {
    const tr = document.createElement("tr");
    const hour = document.createElement("th");
    hour.scope = "row";
    hour.textContent = point.target.slice(11, 16);
    tr.append(hour);
    const values = [
      formatAuditOre(point.originalPriceOre),
      point.adjustmentOre == null ? "—" : formatAuditSignedOre(point.adjustmentOre),
      formatAuditOre(point.forecastPriceOre),
      point.actualPriceOre == null ? "Afventer" : formatAuditOre(point.actualPriceOre),
      point.signedErrorOre == null ? "—" : formatAuditSignedOre(point.signedErrorOre)
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 1 && point.adjustmentOre != null) cell.className = "audit-adjustment";
      if (index === 2) cell.className = "audit-after";
      if (index === 4 && point.signedErrorOre != null) cell.className = "audit-error";
      tr.append(cell);
    });
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function renderForecastAudit() {
  const snapshot = latestForecastSnapshot(forecastSnapshots, settings.priceArea);
  if (!snapshot || !snapshot.points.length) {
    ui.forecastAuditInfo.textContent = "Ingen gemte prognoser endnu for " + settings.priceArea + ".";
    ui.forecastAuditDate.replaceChildren();
    ui.forecastAuditDate.disabled = true;
    ui.forecastAuditTable.replaceChildren();
    ui.forecastAuditStatus.textContent = "Logvisningen opdateres, når dagens prognose er arkiveret.";
    return;
  }

  const dates = [...new Set(snapshot.points.map((point) => String(point.target || "").slice(0, 10)))].filter(Boolean).sort();
  if (!dates.includes(selectedForecastDate)) selectedForecastDate = dates[0];
  ui.forecastAuditDate.disabled = false;
  ui.forecastAuditDate.replaceChildren(...dates.map((day) => {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = fmtDateLong.format(parseDanishTime(day + "T12:00"));
    return option;
  }));
  ui.forecastAuditDate.value = selectedForecastDate;

  const savedAt = new Date(snapshot.collectedAt);
  const savedText = Number.isFinite(savedAt.getTime()) ? fmtHistoryUpdated.format(savedAt) : "ukendt dato";
  ui.forecastAuditInfo.textContent = "Arkiveret " + savedText + " · " + settings.priceArea + ". Den gemte prognose ændres ikke bagudrettet.";
  const knownActuals = new Map();
  for (const item of accuracyObservations) {
    if ((item.area || "DK2") !== settings.priceArea || item.actualSpotExVat == null) continue;
    const actual = Number(item.actualSpotExVat);
    if (Number.isFinite(actual)) knownActuals.set(item.target, actual);
  }

  const rows = snapshot.points
    .filter((point) => point.target.slice(0, 10) === selectedForecastDate)
    .map((point) => {
      const confirmed = officialSpotForAudit.get(point.target);
      const actual = confirmed?.kind === "actual" ? confirmed.spotExVat : knownActuals.get(point.target);
      return pricedForecastAuditRow({ ...point, actualSpotExVat: actual ?? null });
    })
    .filter(Boolean)
    .sort((a, b) => a.target.localeCompare(b.target));
  ui.forecastAuditTable.replaceChildren(makeForecastAuditTable(rows, "Gemte timepriser · øre/kWh"));
  const complete = rows.filter((item) => item.actualPriceOre != null).length;
  const adjusted = rows.filter((item) => item.hasCalibration);
  const changeText = adjusted.length
    ? " · Automatisk justering " + formatAuditSignedOre(mean(adjusted.map((item) => item.adjustmentOre))) + " øre/kWh i gennemsnit."
    : " · Ældre log uden gemt justering.";
  ui.forecastAuditStatus.textContent =
    rows.length + " gemte timer · " + complete + " med officiel pris." + changeText;
}

async function loadForecastSnapshots() {
  try {
    const response = await fetch("data/forecast-log.json?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Kunne ikke hente prognoselog");
    const payload = await response.json();
    if (!Array.isArray(payload.snapshots)) throw new Error("Ugyldige prognosedata");
    forecastSnapshots = payload.snapshots;
  } catch {
    if (!forecastSnapshots.length) ui.forecastAuditStatus.textContent = "Prognoseloggen kunne ikke hentes.";
  }
  renderForecastAudit();
}

function renderDailyAccuracy(rows) {
  if (!rows.length) {
    ui.dailyAccuracyList.replaceChildren();
    return;
  }
  const completeRows = rows.filter((row) => row.complete);
  const rankedRows = completeRows.length ? completeRows : rows;
  const bestValue = Math.min(...rankedRows.map((row) => row.averageOre));
  const worstValue = Math.max(...rankedRows.map((row) => row.averageOre));
  const maxValue = Math.max(...rows.map((row) => row.averageOre), 1);
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const details = document.createElement("details");
    details.className = "daily-accuracy-card";
    const isBest = row.complete && row.averageOre === bestValue;
    const isWorst = row.complete && row.averageOre === worstValue && worstValue !== bestValue;
    if (isBest) details.classList.add("best-day");
    if (isWorst) details.classList.add("worst-day");

    const date = parseDanishTime(`${row.date}T12:00`);
    const summary = document.createElement("summary");
    const header = document.createElement("span");
    header.className = "daily-accuracy-header";
    const title = document.createElement("strong");
    title.textContent = fmtDate.format(date);
    const badges = document.createElement("span");
    badges.className = "daily-accuracy-badges";
    if (isBest) badges.append(makeAccuracyBadge("Tættest", "best"));
    if (isWorst) badges.append(makeAccuracyBadge("Længst fra", "worst"));
    if (!row.complete) badges.append(makeAccuracyBadge("Delvist døgn", "partial"));
    header.append(title, badges);

    const value = document.createElement("strong");
    value.className = "daily-accuracy-value";
    value.textContent = `${fmtPrice.format(row.averageOre)} øre/kWh`;
    const meta = document.createElement("span");
    meta.className = "daily-accuracy-meta";
    meta.textContent = `${row.observations} af 24 timer`;
    const bar = document.createElement("span");
    bar.className = "daily-accuracy-bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(4, row.averageOre / maxValue * 100)}%`;
    bar.append(fill);
    summary.append(header, value, meta, bar);

    const body = document.createElement("div");
    body.className = "daily-accuracy-detail-grid";
    body.append(
      makeAccuracyDetail("Prognosens gennemsnitspris", `${fmtPrice.format(row.forecastAverageOre / 100)} kr./kWh`),
      makeAccuracyDetail("Officiel gennemsnitspris", `${fmtPrice.format(row.actualAverageOre / 100)} kr./kWh`),
      makeAccuracyDetail("Tætteste time", `${row.best.target.slice(11, 16)} · ${fmtPrice.format(row.best.errorOre)} øre/kWh forkert`),
      makeAccuracyDetail("Største fejl", `${row.worst.target.slice(11, 16)} · ${fmtPrice.format(row.worst.errorOre)} øre/kWh forkert`)
    );
    if (row.adjustedHours > 0) {
      const improvement = row.averageImprovementOre;
      const effect = Math.abs(improvement) < 0.005
        ? "Uændret"
        : fmtPrice.format(Math.abs(improvement)) + (improvement > 0 ? " øre mindre fejl" : " øre større fejl");
      body.append(
        makeAccuracyDetail("Gns. automatisk justering (" + row.adjustedHours + " timer)", formatAuditSignedOre(row.averageAdjustmentOre) + " øre/kWh"),
        makeAccuracyDetail("Hjalp justeringen?", effect)
      );
    }
    const note = document.createElement("p");
    note.className = "forecast-audit-note";
    note.textContent = "Time for time i øre/kWh, inkl. moms, tariffer, afgifter, abonnementer og dit personlige kWh-tillæg. Fejl: + betyder prognosen var for høj; − betyder for lav. — betyder ingen registreret automatisk justering (ældre log).";
    details.append(summary, body, note, makeForecastAuditTable(row.items, "Sammenligning time for time · øre/kWh"));
    fragment.append(details);
  }
  ui.dailyAccuracyList.replaceChildren(fragment);
}

function makeAccuracyBadge(text, kind) {
  const badge = document.createElement("span");
  badge.className = `daily-accuracy-badge ${kind}`;
  badge.textContent = text;
  return badge;
}

function makeAccuracyDetail(label, value) {
  const item = document.createElement("span");
  const title = document.createElement("small");
  title.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  item.append(title, content);
  return item;
}

function renderMonthlyAccuracy() {
  const months = availableAccuracyMonths(accuracyObservations);
  if (!months.length) {
    ui.monthlyAccuracyDetails.hidden = true;
    return;
  }
  ui.monthlyAccuracyDetails.hidden = false;
  if (!months.includes(selectedAccuracyMonth)) selectedAccuracyMonth = months[0];
  ui.monthlyAccuracyMonth.replaceChildren(...months.map((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = monthLabel(month);
    return option;
  }));
  ui.monthlyAccuracyMonth.value = selectedAccuracyMonth;
  const result = monthlyAccuracyReport(accuracyObservations, selectedAccuracyMonth);
  ui.monthlyAccuracyIntro.textContent = `DK${settings.priceArea === "DK1" ? "1" : "2"} · ${monthLabel(selectedAccuracyMonth)} · gennemsnitlig absolut forskel mellem prognose og officiel samlet pris inklusive personligt tillæg.`;
  ui.monthlyAccuracyRows.replaceChildren(...result.rows.map((row) => {
    const tr = document.createElement("tr");
    const values = [row.band, row.averageOre === null ? "–" : `${fmtPrice.format(row.averageOre)} øre/kWh`, row.averagePercent === null ? "–" : `${fmtPrice.format(row.averagePercent)} %`];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    return tr;
  }));
  ui.monthlyAccuracyCoverage.textContent = `${result.coveredDays} dage og ${result.observations} sammenlignede prognoser. Procenten beregnes af den officielle samlede sammenligningspris; timer med pris tæt på 0 kr./kWh tæller kun med i øre-målingen.`;
}

async function loadAccuracy() {
  try {
    const response = await fetch(`data/accuracy.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Ingen statistik endnu");
    const payload = await response.json();
    accuracyObservations = Array.isArray(payload.observations) ? payload.observations : [];
    const updated = payload.updatedAt ? new Date(payload.updatedAt) : null;
    ui.accuracyUpdatedAt.textContent = updated && Number.isFinite(updated.getTime())
      ? `Historik senest opdateret: ${fmtHistoryUpdated.format(updated)}`
      : "Historikkens opdateringstidspunkt mangler.";
  } catch {
    accuracyObservations = [];
    ui.accuracyUpdatedAt.textContent = "Historikken kunne ikke hentes.";
  }
  renderAccuracy(selectedAccuracyDays);
  renderMonthlyAccuracy();
  renderForecastAudit();
}

function renderSummary(items, now) {
  const current = items.find((item) => hourKey(item.date) === hourKey(now)) || items[0];
  const future = items.filter((x) => x.date >= floorHour(now));
  const charge = bestChargeWindow(future);
  const mostExpensive = [...future].sort((a, b) => b.total - a.total)[0];
  ui.currentPrice.textContent = `${fmtPrice.format(current.total)} kr./kWh`;
  ui.currentKind.textContent = `${fmtDate.format(current.date)} kl. ${fmtTime.format(current.date)} · alt inklusive · ${current.kind === "actual" ? "officiel spotpris" : "spotprognose"}`;
  ui.bestPrice.textContent = `${fmtPrice.format(charge.average)} kr./kWh`;
  const last = addHours(charge.items.at(-1).date, 1);
  ui.bestTime.textContent = `${fmtDate.format(charge.items[0].date)} kl. ${fmtTime.format(charge.items[0].date)}–${fmtTime.format(last)}`;
  ui.expensivePrice.textContent = `${fmtPrice.format(mostExpensive.total)} kr./kWh`;
  ui.expensiveTime.textContent = `${fmtDate.format(mostExpensive.date)} kl. ${fmtTime.format(mostExpensive.date)}`;
  ui.summary.hidden = false;
  ui.legend.hidden = false;
  ui.daysHelp.hidden = false;
}

function renderDays(items, now) {
  ui.days.replaceChildren();
  const maxTotal = Math.max(...items.map((x) => x.total), 0.01);
  for (let dayIndex = 0; dayIndex < 4; dayIndex++) {
    const block = items.slice(dayIndex * 24, (dayIndex + 1) * 24);
    const marks = classifyDay(block);
    const dayNode = $("dayTemplate").content.cloneNode(true);
    dayNode.querySelector(".day-number").textContent = `Dag ${dayIndex + 1}`;
    dayNode.querySelector(".day-title").textContent = fmtDateLong.format(block[0].date);
    dayNode.querySelector(".day-range").textContent = `${fmtDate.format(block[0].date)} · kl. 00:00–23:59`;
    const chargeEnd = addHours(marks.charge.items.at(-1).date, 1);
    dayNode.querySelector(".day-best-time").textContent = `kl. ${fmtTime.format(marks.charge.items[0].date)}–${fmtTime.format(chargeEnd)}`;
    dayNode.querySelector(".day-best-price").textContent = `${fmtPrice.format(marks.charge.average)} kr./kWh i snit`;
    dayNode.querySelector(".day-expensive-time").textContent = `kl. ${fmtTime.format(marks.mostExpensive.date)}`;
    dayNode.querySelector(".day-expensive-price").textContent = `${fmtPrice.format(marks.mostExpensive.total)} kr./kWh`;
    const list = dayNode.querySelector(".price-list");

    for (const item of block) {
      const rowNode = $("priceTemplate").content.cloneNode(true);
      const row = rowNode.querySelector(".price-row");
      const key = hourKey(item.date);
      row.classList.toggle("forecast-row", item.kind === "forecast");
      row.classList.toggle("cheap", marks.cheap.has(key));
      row.classList.toggle("expensive", marks.expensive.has(key));
      row.classList.toggle("current", key === hourKey(now));
      row.querySelector(".time").textContent = fmtTime.format(item.date);
      row.querySelector(".date-short").textContent = fmtDate.format(item.date);
      row.querySelector(".bar").style.width = `${Math.max(2, item.total / maxTotal * 100)}%`;
      row.querySelector(".total-price").textContent = `${fmtPrice.format(item.total)} kr.`;
      row.querySelector(".kind-badge").textContent = item.kind === "actual" ? "Officiel" : "Prognose";
      list.append(rowNode);
    }
    ui.days.append(dayNode);
  }
}

function setStatus(message, kind = "loading") {
  ui.statusText.textContent = message;
  ui.statusPanel.className = `status-panel ${kind === "loading" ? "" : kind}`.trim();
}

function updateMarkupNotice() {
  if (!hasDocument || !ui.markupNotice) return;
  const needsCheck = settings.supplier.toLocaleLowerCase("da-DK") === DEFAULT_SETTINGS.supplier.toLocaleLowerCase("da-DK")
    && settings.supplierMarkupOre === 0;
  ui.markupNotice.hidden = !needsCheck && !markupRepairApplied;
  ui.markupFixButton.hidden = !needsCheck;
  ui.markupUndoButton.hidden = !markupRepairApplied;
  if (needsCheck) {
    ui.markupNoticeText.textContent =
      "Dit gemte personlige tillæg er 0,00 øre/kWh. Hvis din aftale har 11,00 øre/kWh, kan du gendanne det her uden at ændre andre indstillinger.";
  } else if (markupRepairApplied) {
    ui.markupNoticeText.textContent =
      "Et gammelt standardprofil-tillæg på 0,00 øre/kWh er genoprettet til 11,00 øre/kWh på denne enhed. Du kan altid ændre det under Indstillinger.";
  }
}

function updateGridNotice() {
  if (!hasDocument || !ui.gridNotice) return;
  const oldDefaultProfile = settings.priceArea === "DK2" && settings.gridCompany === "cerius"
    && settings.supplier.toLocaleLowerCase("da-DK") === "modstrøm";
  ui.gridNotice.hidden = !oldDefaultProfile ||
    (typeof localStorage !== "undefined" && localStorage.getItem(GRID_NOTICE_DISMISSED_KEY) === "dismissed");
}

function updateProfileText() {
  if (!hasDocument) return;
  updateMarkupNotice();
  updateGridNotice();
  const gridName = settings.gridCompany === "radius" ? "Radius"
    : settings.gridCompany === "cerius" ? "Cerius" : "eget netselskab";
  ui.profileSummary.textContent = `${settings.priceArea} · ${areaName(settings.priceArea)} · ${gridName} · ${settings.supplier}`;
  const productText = settings.product ? ` (${settings.product})` : "";
  const subscription = settings.supplierSubscriptionMonthly + settings.gridSubscriptionMonthly;
  ui.calculationExplanation.textContent = `Den store pris er din beregnede samlede kWh-pris: ${settings.priceArea}-spotpris, moms, ${settings.supplier}${productText}, nettarif, Energinets tarif, elafgift samt ${fmtPrice.format(subscription)} kr. i månedlige abonnementer fordelt på ${Math.round(settings.annualConsumption).toLocaleString("da-DK")} kWh om året. “Basis” er spot med moms, nettarif, Energinet og elafgift, men uden elselskabets kWh-tillæg og uden abonnementer. “Uden faste” er basis plus elselskabets kWh-tillæg.`;
  ui.accuracyComparisonNote.textContent = `Prognoselog og timepriser beregnes ens, inklusive dit personlige kWh-tillæg på ${fmtPrice.format(settings.supplierMarkupOre)} øre/kWh. Tillægget medregnes kun én gang i hver pris.`;
}

function fillSettingsForm() {
  const form = ui.settingsForm.elements;
  for (const [key, value] of Object.entries(settings)) {
    if (form.namedItem(key)) form.namedItem(key).value = value;
  }
  toggleManualTariffs();
}

function toggleManualTariffs() {
  const manual = ui.settingsForm.elements.gridCompany.value === "manual";
  ui.manualTariffs.hidden = !manual;
  ["gridLow", "gridHigh", "gridPeak"].forEach((name) => {
    ui.settingsForm.elements[name].required = manual;
  });
}

function handleAreaChange() {
  if (ui.settingsForm.elements.priceArea.value === "DK1" &&
      ["cerius", "radius"].includes(ui.settingsForm.elements.gridCompany.value)) {
    ui.settingsForm.elements.gridCompany.value = "manual";
  }
  toggleManualTariffs();
}

function openSettings() {
  fillSettingsForm();
  if (typeof ui.settingsDialog.showModal === "function") ui.settingsDialog.showModal();
  else ui.settingsDialog.setAttribute("open", "");
}

function closeSettings() { ui.settingsDialog.close(); }
function openCalculation() {
  if (typeof ui.calculationDialog.showModal === "function") ui.calculationDialog.showModal();
  else ui.calculationDialog.setAttribute("open", "");
}
function closeCalculation() { ui.calculationDialog.close(); }

function shouldShowReviewReminder(now = new Date(), storedValue = null) {
  return localIso(now).slice(0, 10) >= REVIEW_REMINDER_DATE && storedValue !== "dismissed";
}

function showReviewReminderIfDue() {
  const storedValue = localStorage.getItem(REVIEW_REMINDER_KEY);
  if (!shouldShowReviewReminder(new Date(), storedValue)) return;
  if (typeof ui.reviewReminderDialog.showModal === "function") ui.reviewReminderDialog.showModal();
  else ui.reviewReminderDialog.setAttribute("open", "");
}

function dismissReviewReminder() {
  localStorage.setItem(REVIEW_REMINDER_KEY, "dismissed");
  ui.reviewReminderDialog.close();
}

function formSettings() {
  const data = Object.fromEntries(new FormData(ui.settingsForm).entries());
  return normalizeSettings(data);
}

async function load() {
  ui.refresh.disabled = true;
  updateProfileText();
  setStatus(`Henter de nyeste ${settings.priceArea}-priser…`);
  let data;
  try {
    data = await fetchRecords();
  } catch (error) {
    data = readCache();
    if (!data) {
      setStatus(`Priserne kunne ikke hentes. Kontrollér internetforbindelsen og prøv igen. (${error.message})`, "error");
      ui.refresh.disabled = false;
      return;
    }
  }

  const now = new Date();
  const forecastHours = forecastPayloadToHours(data.days || []);
  const officialHours = aggregateToHours(data.officialRecords || []);
  officialSpotForAudit = officialHours;
  renderForecastAudit();
  const known = mergeKnownHours(forecastHours, officialHours);
  if (!known.size) {
    setStatus("Der blev ikke fundet brugbare prisdata. Prøv igen om lidt.", "error");
    ui.refresh.disabled = false;
    return;
  }
  const calibration = CALIBRATION.calculateCalibration(accuracyObservations, settings.priceArea, localIso(now).slice(0, 10));
  const items = buildHorizon(known, now, settings, calibration.adjustment);
  renderSummary(items, now);
  renderDays(items, now);
  const officialCount = items.filter((x) => x.kind === "actual").length;
  const forecastCount = items.length - officialCount;
  const cacheText = data.fromCache ? " Viser senest gemte data, fordi en ny hentning mislykkedes." : "";
  const sourceText = data.officialSourceOk === false ? " Direkte Energinet-data kunne ikke hentes, så reservekilden bruges." : "";
  const calibrationText = forecastCount && calibration.active
    ? ` Historisk prognosejustering: ${calibration.adjustment >= 0 ? "+" : ""}${fmtPrice.format(calibration.adjustment * 125)} øre/kWh inkl. moms (${calibration.sampleDays} døgn).`
    : "";
  setStatus(`${officialCount} officielle timer og ${forecastCount} prognosetimer.${calibrationText}${sourceText}${cacheText}`, data.fromCache || data.officialSourceOk === false ? "error" : "ok");
  ui.updatedAt.textContent = `Priser hentet ${fmtDate.format(data.savedAt)} kl. ${fmtTime.format(data.savedAt)}`;
  ui.refresh.disabled = false;
}

if (hasDocument) {
  ui.refresh.addEventListener("click", load);
  ui.settingsButton.addEventListener("click", openSettings);
  ui.gridSwitchButton.addEventListener("click", () => {
    if (settings.gridCompany !== "cerius" || settings.priceArea !== "DK2") return;
    // Skift kun netselskab. Bevar elselskab, tillæg, abonnementer og årsforbrug.
    saveSettings({ ...settings, gridCompany: "radius" });
    renderAccuracy(selectedAccuracyDays);
    renderMonthlyAccuracy();
    renderForecastAudit();
    load();
  });
  ui.gridKeepButton.addEventListener("click", () => {
    if (typeof localStorage !== "undefined") localStorage.setItem(GRID_NOTICE_DISMISSED_KEY, "dismissed");
    updateGridNotice();
  });
  ui.markupFixButton.addEventListener("click", () => {
    if (settings.supplierMarkupOre !== 0) return;
    saveSettings({ ...settings, supplierMarkupOre: DEFAULT_SETTINGS.supplierMarkupOre });
    renderAccuracy(selectedAccuracyDays);
    renderMonthlyAccuracy();
    renderForecastAudit();
    load();
  });
  ui.markupUndoButton.addEventListener("click", () => {
    if (!markupRepairApplied) return;
    saveSettings({ ...settings, supplierMarkupOre: 0 });
    renderAccuracy(selectedAccuracyDays);
    renderMonthlyAccuracy();
    renderForecastAudit();
    load();
  });
  $("closeSettingsButton").addEventListener("click", closeSettings);
  $("cancelSettingsButton").addEventListener("click", closeSettings);
  ui.calculationButton.addEventListener("click", openCalculation);
  ui.closeCalculationButton.addEventListener("click", closeCalculation);
  ui.reviewReminderButton.addEventListener("click", dismissReviewReminder);
  $("gridCompanyInput").addEventListener("change", toggleManualTariffs);
  $("priceAreaInput").addEventListener("change", handleAreaChange);
  ui.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ui.settingsForm.reportValidity()) return;
    saveSettings(formSettings());
    closeSettings();
    renderAccuracy(selectedAccuracyDays);
    renderMonthlyAccuracy();
    renderForecastAudit();
    load();
  });
  ui.settingsDialog.addEventListener("click", (event) => {
    if (event.target === ui.settingsDialog) closeSettings();
  });
  ui.calculationDialog.addEventListener("click", (event) => {
    if (event.target === ui.calculationDialog) closeCalculation();
  });
  document.querySelectorAll(".accuracy-period").forEach((button) => {
    button.addEventListener("click", () => renderAccuracy(Number(button.dataset.days)));
  });
  ui.monthlyAccuracyMonth.addEventListener("change", () => {
    selectedAccuracyMonth = ui.monthlyAccuracyMonth.value;
    renderMonthlyAccuracy();
  });
  ui.forecastAuditDate.addEventListener("change", () => {
    selectedForecastDate = ui.forecastAuditDate.value;
    renderForecastAudit();
  });
  let lastPriceRefresh = 0;
  const runPriceLoad = async () => {
    await load();
    lastPriceRefresh = Date.now();
  };
  // Load historical bias before first rendering so the first forecast is calibrated.
  loadAccuracy().then(runPriceLoad);
  loadForecastSnapshots();
  showReviewReminderIfDue();
  const schedulePriceRefresh = () => {
    const hour = new Date().getHours();
    const minutes = hour >= 12 && hour < 16 ? 15 : 60;
    setTimeout(async () => {
      await runPriceLoad();
      schedulePriceRefresh();
    }, minutes * 60 * 1000);
  };
  schedulePriceRefresh();
  setInterval(loadAccuracy, 60 * 60 * 1000);
  setInterval(loadForecastSnapshots, 60 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastPriceRefresh > 5 * 60 * 1000) runPriceLoad();
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// Eksporteres kun for de automatiske, lokale kontroller.
if (typeof module !== "undefined") module.exports = { DEFAULT_SETTINGS, normalizeSettings, shouldRepairLegacyZeroMarkup, aggregateToHours, mergeKnownHours, forecastPayloadToHours, forecastSpot, ceriusTariff, radiusTariff, gridTariff, fixedCostPerKwh, officialBasePrice, variablePrice, totalPrice, comparableAccuracyPrice, pricedAccuracyObservation, startOfDay, calendarHour, buildHorizon, bestChargeWindow, classifyDay, calculateAccuracy, dailyAccuracyReport, monthlyAccuracyReport, availableAccuracyMonths, timeBand, pricedForecastAuditRow, latestForecastSnapshot, shouldShowReviewReminder };
