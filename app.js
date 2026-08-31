"use strict";

const CONFIG = Object.freeze({
  horizonHours: 96,
  energinetTariffInclVat: 0.115 * 1.25,
  electricityTaxInclVat: 0.008 * 1.25,
  ceriusInclVat: {
    summer: { low: 0.1442, high: 0.2163, peak: 0.5623 },
    winter: { low: 0.13825, high: 0.414875, peak: 1.2445 }
  }
});

const DEFAULT_SETTINGS = Object.freeze({
  priceArea: "DK2", gridCompany: "cerius", supplier: "Modstrøm", product: "",
  supplierMarkupOre: 11, supplierSubscriptionMonthly: 0,
  annualConsumption: 4000, gridSubscriptionMonthly: 0,
  gridLow: 0.1442, gridHigh: 0.2163, gridPeak: 0.5623
});
const SETTINGS_KEY = "elpris-user-settings-v1";
const fmtPrice = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short" });
const fmtDateLong = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", hour12: false });

const hasDocument = typeof document !== "undefined";
const $ = (id) => hasDocument ? document.getElementById(id) : null;
const ui = hasDocument ? {
  statusPanel: $("statusPanel"), statusText: $("statusText"), refresh: $("refreshButton"),
  summary: $("summary"), legend: $("legend"), daysHelp: $("daysHelp"), days: $("days"), updatedAt: $("updatedAt"),
  currentPrice: $("currentPrice"), currentKind: $("currentKind"),
  bestPrice: $("bestPrice"), bestTime: $("bestTime"),
  expensivePrice: $("expensivePrice"), expensiveTime: $("expensiveTime"),
  accuracyValue: $("accuracyValue"), accuracyCoverage: $("accuracyCoverage"),
  monthlyAccuracyDetails: $("monthlyAccuracyDetails"), monthlyAccuracyMonth: $("accuracyMonth"),
  monthlyAccuracyIntro: $("monthlyAccuracyIntro"), monthlyAccuracyRows: $("monthlyAccuracyRows"), monthlyAccuracyCoverage: $("monthlyAccuracyCoverage"),
  profileSummary: $("profileSummary"), settingsButton: $("settingsButton"),
  settingsDialog: $("settingsDialog"), settingsForm: $("settingsForm"),
  manualTariffs: $("manualTariffs"), calculationExplanation: $("calculationExplanation"),
  calculationButton: $("calculationButton"), calculationDialog: $("calculationDialog"), closeCalculationButton: $("closeCalculationButton")
} : {};

let accuracyObservations = [];
let selectedAccuracyDays = 7;
let selectedAccuracyMonth = "";
let settings = readSettings();

function finiteNumber(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeSettings(value = {}) {
  const area = value.priceArea === "DK1" ? "DK1" : "DK2";
  const gridCompany = value.gridCompany === "manual" ? "manual" : "cerius";
  const supplier = String(value.supplier || DEFAULT_SETTINGS.supplier).slice(0, 60);
  return {
    priceArea: area, gridCompany, supplier,
    product: String(value.product || "").slice(0, 60),
    supplierMarkupOre: finiteNumber(value.supplierMarkupOre, DEFAULT_SETTINGS.supplierMarkupOre, 0, 500),
    supplierSubscriptionMonthly: finiteNumber(value.supplierSubscriptionMonthly, 0, 0, 2000),
    annualConsumption: finiteNumber(value.annualConsumption, DEFAULT_SETTINGS.annualConsumption, 100, 100000),
    gridSubscriptionMonthly: finiteNumber(value.gridSubscriptionMonthly, 0, 0, 2000),
    gridLow: finiteNumber(value.gridLow, DEFAULT_SETTINGS.gridLow, 0, 10),
    gridHigh: finiteNumber(value.gridHigh, DEFAULT_SETTINGS.gridHigh, 0, 10),
    gridPeak: finiteNumber(value.gridPeak, DEFAULT_SETTINGS.gridPeak, 0, 10)
  };
}

function readSettings() {
  if (typeof localStorage === "undefined") return normalizeSettings(DEFAULT_SETTINGS);
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || DEFAULT_SETTINGS); }
  catch { return normalizeSettings(DEFAULT_SETTINGS); }
}

function saveSettings(next) {
  settings = normalizeSettings(next);
  if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

function areaName(area) { return area === "DK1" ? "Vestdanmark" : "Østdanmark"; }
function cacheKey(area = settings.priceArea) { return `elpris-${area.toLowerCase()}-cache-v3`; }

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

function hourKey(date) { return localIso(floorHour(date)); }
function addHours(date, hours) { return new Date(date.getTime() + hours * 3600000); }
function addDays(date, days) { return new Date(date.getTime() + days * 86400000); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }

async function fetchRecords() {
  const url = `https://elpriser.org/api/forecast?area=${settings.priceArea}&mode=spot_ex`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Datakilden svarede med fejl ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.days) || !payload.days.length) throw new Error(`Datakilden returnerede ingen ${settings.priceArea}-priser`);
  const saved = { savedAt: new Date().toISOString(), generatedAt: payload.generated, days: payload.days };
  localStorage.setItem(cacheKey(), JSON.stringify(saved));
  return { ...saved, savedAt: new Date(saved.savedAt), fromCache: false };
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()));
    if (!cached?.days?.length) return null;
    return { ...cached, savedAt: new Date(cached.savedAt), fromCache: true };
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
    if (record.PriceArea !== priceArea || !Number.isFinite(record.DayAheadPriceDKK)) continue;
    const date = floorHour(parseDanishTime(record.TimeDK));
    const key = hourKey(date);
    if (!buckets.has(key)) buckets.set(key, { date, values: [] });
    buckets.get(key).values.push(record.DayAheadPriceDKK / 1000);
  }
  const hours = new Map();
  for (const [key, bucket] of buckets) hours.set(key, { date: bucket.date, spotExVat: mean(bucket.values) });
  return hours;
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

function ceriusTariff(date) {
  const summer = date.getMonth() >= 3 && date.getMonth() <= 8;
  const rates = summer ? CONFIG.ceriusInclVat.summer : CONFIG.ceriusInclVat.winter;
  const hour = date.getHours();
  if (hour < 6) return rates.low;
  if (hour >= 17 && hour < 21) return rates.peak;
  return rates.high;
}

function gridTariff(date, activeSettings = settings) {
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

function totalPrice(spotExVat, date, activeSettings = settings) {
  const spotInclVat = spotExVat * 1.25;
  return spotInclVat + activeSettings.supplierMarkupOre / 100 + CONFIG.energinetTariffInclVat +
    CONFIG.electricityTaxInclVat + gridTariff(date, activeSettings) + fixedCostPerKwh(activeSettings);
}

function buildHorizon(knownHours, now = new Date(), activeSettings = settings) {
  const start = floorHour(now);
  return Array.from({ length: CONFIG.horizonHours }, (_, index) => {
    const date = addHours(start, index);
    const known = knownHours.get(hourKey(date));
    const spotExVat = known ? known.spotExVat : forecastSpot(date, knownHours);
    return { date, spotExVat, total: totalPrice(spotExVat, date, activeSettings), kind: known?.kind || "forecast" };
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

function calculateAccuracy(observations, days, now = new Date(), priceArea = settings.priceArea) {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  const usable = observations.filter((item) => {
    const errorOre = Number(item.errorOre);
    if (!Number.isFinite(errorOre) || !item.target) return false;
    if ((item.area || "DK2") !== priceArea) return false;
    return parseDanishTime(item.target) >= cutoff;
  });
  const averageOre = usable.length ? mean(usable.map((item) => Number(item.errorOre))) : null;
  const coveredDays = new Set(usable.map((item) => item.target.slice(0, 10))).size;
  return { averageOre, coveredDays, observations: usable.length };
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

function monthlyAccuracyReport(observations, month, priceArea = settings.priceArea) {
  const bands = ["00:00–06:00", "06:00–12:00", "12:00–18:00", "18:00–24:00"];
  const groups = new Map(bands.map((band) => [band, []]));
  const usable = observations.filter((item) => {
    if ((item.area || "DK2") !== priceArea || monthKey(item.target) !== month) return false;
    return Number.isFinite(Number(item.errorOre)) && Number.isFinite(Number(item.forecastSpotExVat)) && Number.isFinite(Number(item.actualSpotExVat));
  });
  for (const item of usable) groups.get(timeBand(item.target)).push(item);
  const rows = bands.map((band) => {
    const items = groups.get(band);
    const averageOre = items.length ? mean(items.map((item) => Number(item.errorOre))) : null;
    const percentageValues = items
      .filter((item) => Math.abs(Number(item.actualSpotExVat)) >= 0.01)
      .map((item) => Math.abs(Number(item.forecastSpotExVat) - Number(item.actualSpotExVat)) / Math.abs(Number(item.actualSpotExVat)) * 100);
    return { band, averageOre, averagePercent: percentageValues.length ? mean(percentageValues) : null, observations: items.length };
  });
  return { rows, observations: usable.length, coveredDays: new Set(usable.map((item) => item.target.slice(0, 10))).size };
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
  const result = calculateAccuracy(accuracyObservations, days);
  document.querySelectorAll(".accuracy-period").forEach((button) => {
    const active = Number(button.dataset.days) === days;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (result.averageOre === null) {
    ui.accuracyValue.textContent = "Indsamler data…";
    ui.accuracyCoverage.textContent = "Der er endnu ingen afsluttede prognoser i den valgte periode.";
    return;
  }
  ui.accuracyValue.textContent = `${fmtPrice.format(result.averageOre)} øre/kWh forkert`;
  ui.accuracyCoverage.textContent = `${result.coveredDays} af ${days} dage med data · ${result.observations} sammenlignede timepriser`;
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
  ui.monthlyAccuracyIntro.textContent = `DK${settings.priceArea === "DK1" ? "1" : "2"} · ${monthLabel(selectedAccuracyMonth)} · gennemsnitlig absolut forskel mellem prognose og officiel spotpris.`;
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
  ui.monthlyAccuracyCoverage.textContent = `${result.coveredDays} dage og ${result.observations} sammenlignede prognoser. Procenten beregnes i forhold til den officielle spotpris; timer med spotpris tæt på 0 kr./kWh tæller kun med i øre-målingen.`;
}

async function loadAccuracy() {
  try {
    const response = await fetch("data/accuracy.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Ingen statistik endnu");
    const payload = await response.json();
    accuracyObservations = Array.isArray(payload.observations) ? payload.observations : [];
  } catch {
    accuracyObservations = [];
  }
  renderAccuracy(selectedAccuracyDays);
  renderMonthlyAccuracy();
}

function renderSummary(items, now) {
  const current = items[0];
  const future = items.filter((x) => x.date >= floorHour(now));
  const charge = bestChargeWindow(future);
  const mostExpensive = [...future].sort((a, b) => b.total - a.total)[0];
  ui.currentPrice.textContent = `${fmtPrice.format(current.total)} kr./kWh`;
  ui.currentKind.textContent = `${fmtDate.format(current.date)} kl. ${fmtTime.format(current.date)} · ${current.kind === "actual" ? "officiel" : "prognose"}`;
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
    dayNode.querySelector(".day-number").textContent = `Døgn ${dayIndex + 1}`;
    dayNode.querySelector(".day-title").textContent = fmtDateLong.format(block[0].date);
    const end = addHours(block.at(-1).date, 1);
    dayNode.querySelector(".day-range").textContent = `${fmtDate.format(block[0].date)} kl. ${fmtTime.format(block[0].date)} – ${fmtDate.format(end)} kl. ${fmtTime.format(end)}`;
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
      row.querySelector(".spot-price").textContent = `spot ${fmtPrice.format(item.spotExVat)} kr.`;
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

function updateProfileText() {
  if (!hasDocument) return;
  const gridName = settings.gridCompany === "cerius" ? "Cerius" : "eget netselskab";
  ui.profileSummary.textContent = `${settings.priceArea} · ${areaName(settings.priceArea)} · ${gridName} · ${settings.supplier}`;
  const productText = settings.product ? ` (${settings.product})` : "";
  const subscription = settings.supplierSubscriptionMonthly + settings.gridSubscriptionMonthly;
  ui.calculationExplanation.textContent = `Den viste pris indeholder ${settings.priceArea}-spotpris, moms, ${settings.supplier}${productText}, nettarif, Energinets tarif, elafgift og ${fmtPrice.format(subscription)} kr. i samlede månedlige abonnementer fordelt på ${Math.round(settings.annualConsumption).toLocaleString("da-DK")} kWh om året.`;
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
  if (ui.settingsForm.elements.priceArea.value === "DK1" && ui.settingsForm.elements.gridCompany.value === "cerius") {
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
  const known = forecastPayloadToHours(data.days);
  const items = buildHorizon(known, now);
  renderSummary(items, now);
  renderDays(items, now);
  const officialCount = items.filter((x) => x.kind === "actual").length;
  const forecastCount = items.length - officialCount;
  const cacheText = data.fromCache ? " Viser senest gemte data, fordi en ny hentning mislykkedes." : "";
  setStatus(`${officialCount} officielle timer og ${forecastCount} prognosetimer.${cacheText}`, data.fromCache ? "error" : "ok");
  const sourceTime = data.generatedAt ? new Date(data.generatedAt) : data.savedAt;
  ui.updatedAt.textContent = `Prognose opdateret ${fmtDate.format(sourceTime)} kl. ${fmtTime.format(sourceTime)}`;
  ui.refresh.disabled = false;
}

if (hasDocument) {
  ui.refresh.addEventListener("click", load);
  ui.settingsButton.addEventListener("click", openSettings);
  $("closeSettingsButton").addEventListener("click", closeSettings);
  $("cancelSettingsButton").addEventListener("click", closeSettings);
  ui.calculationButton.addEventListener("click", openCalculation);
  ui.closeCalculationButton.addEventListener("click", closeCalculation);
  $("gridCompanyInput").addEventListener("change", toggleManualTariffs);
  $("priceAreaInput").addEventListener("change", handleAreaChange);
  ui.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!ui.settingsForm.reportValidity()) return;
    saveSettings(formSettings());
    closeSettings();
    renderAccuracy(selectedAccuracyDays);
    renderMonthlyAccuracy();
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
  load();
  loadAccuracy();
  setInterval(load, 60 * 60 * 1000);
  setInterval(loadAccuracy, 6 * 60 * 60 * 1000);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// Eksporteres kun for de automatiske, lokale kontroller.
if (typeof module !== "undefined") module.exports = { DEFAULT_SETTINGS, normalizeSettings, aggregateToHours, forecastPayloadToHours, forecastSpot, ceriusTariff, gridTariff, fixedCostPerKwh, totalPrice, buildHorizon, bestChargeWindow, classifyDay, calculateAccuracy, monthlyAccuracyReport, availableAccuracyMonths, timeBand };
