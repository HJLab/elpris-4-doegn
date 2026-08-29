"use strict";

const CONFIG = Object.freeze({
  priceArea: "DK2",
  horizonHours: 96,
  historyDays: 56,
  supplierMarkupInclVat: 0.11,
  energinetTariffInclVat: 0.115 * 1.25,
  electricityTaxInclVat: 0.008 * 1.25,
  ceriusInclVat: {
    summer: { low: 0.1442, high: 0.2163, peak: 0.5623 },
    winter: { low: 0.13825, high: 0.414875, peak: 1.2445 }
  }
});

const API_BASE = "https://api.energidataservice.dk/dataset/DayAheadPrices";
const CACHE_KEY = "elpris-dk2-cache-v1";
const fmtPrice = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short" });
const fmtDateLong = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", hour12: false });

const hasDocument = typeof document !== "undefined";
const $ = (id) => hasDocument ? document.getElementById(id) : null;
const ui = hasDocument ? {
  statusPanel: $("statusPanel"), statusText: $("statusText"), refresh: $("refreshButton"),
  summary: $("summary"), legend: $("legend"), days: $("days"), updatedAt: $("updatedAt"),
  currentPrice: $("currentPrice"), currentKind: $("currentKind"),
  bestPrice: $("bestPrice"), bestTime: $("bestTime"),
  chargePrice: $("chargePrice"), chargeTime: $("chargeTime")
} : {};

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
  const now = new Date();
  const start = addDays(floorHour(now), -CONFIG.historyDays);
  const end = addHours(floorHour(now), CONFIG.horizonHours + 24);
  const filter = encodeURIComponent(JSON.stringify({ PriceArea: [CONFIG.priceArea] }));
  const url = `${API_BASE}?start=${localIso(start)}&end=${localIso(end)}&filter=${filter}&sort=TimeDK&limit=0`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Datakilden svarede med fejl ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.records) || !payload.records.length) throw new Error("Datakilden returnerede ingen DK2-priser");
  localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), records: payload.records }));
  return { records: payload.records, savedAt: new Date(), fromCache: false };
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!cached?.records?.length) return null;
    return { records: cached.records, savedAt: new Date(cached.savedAt), fromCache: true };
  } catch { return null; }
}

function aggregateToHours(records) {
  const buckets = new Map();
  for (const record of records) {
    if (record.PriceArea !== CONFIG.priceArea || !Number.isFinite(record.DayAheadPriceDKK)) continue;
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
  for (let daysAgo = 7; daysAgo <= CONFIG.historyDays; daysAgo += 7) {
    const past = addDays(target, -daysAgo);
    const match = knownHours.get(hourKey(past));
    if (match) candidates.push({ value: match.spotExVat, weight: Math.exp(-daysAgo / 35) * 2.2 });
  }
  for (let daysAgo = 1; daysAgo <= 21; daysAgo += 1) {
    const past = addDays(target, -daysAgo);
    const match = knownHours.get(hourKey(past));
    if (match) candidates.push({ value: match.spotExVat, weight: Math.exp(-daysAgo / 12) * 0.55 });
  }
  if (!candidates.length) return 0;
  const weighted = candidates.reduce((sum, x) => sum + x.value * x.weight, 0) /
    candidates.reduce((sum, x) => sum + x.weight, 0);

  const recent = [];
  for (let h = 1; h <= 48; h++) {
    const match = knownHours.get(hourKey(addHours(target, -h)));
    if (match) recent.push(match.spotExVat);
  }
  const recentLevel = mean(recent);
  const blended = recentLevel === null ? weighted : weighted * 0.82 + recentLevel * 0.18;
  return Math.max(-0.5, Math.min(5, blended));
}

function ceriusTariff(date) {
  const summer = date.getMonth() >= 3 && date.getMonth() <= 8;
  const rates = summer ? CONFIG.ceriusInclVat.summer : CONFIG.ceriusInclVat.winter;
  const hour = date.getHours();
  if (hour < 6) return rates.low;
  if (hour >= 17 && hour < 21) return rates.peak;
  return rates.high;
}

function totalPrice(spotExVat, date) {
  const spotInclVat = spotExVat * 1.25;
  return spotInclVat + CONFIG.supplierMarkupInclVat + CONFIG.energinetTariffInclVat +
    CONFIG.electricityTaxInclVat + ceriusTariff(date);
}

function buildHorizon(knownHours, now = new Date()) {
  const start = floorHour(now);
  return Array.from({ length: CONFIG.horizonHours }, (_, index) => {
    const date = addHours(start, index);
    const known = knownHours.get(hourKey(date));
    const spotExVat = known ? known.spotExVat : forecastSpot(date, knownHours);
    return { date, spotExVat, total: totalPrice(spotExVat, date), kind: known ? "actual" : "forecast" };
  });
}

function classifyDay(items) {
  const sorted = [...items].sort((a, b) => a.total - b.total);
  const cheap = new Set(sorted.slice(0, 3).map((x) => hourKey(x.date)));
  const expensive = new Set(sorted.slice(-3).map((x) => hourKey(x.date)));
  return { cheap, expensive };
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

function renderSummary(items, now) {
  const current = items[0];
  const future = items.filter((x) => x.date >= floorHour(now));
  const best = [...future].sort((a, b) => a.total - b.total)[0];
  const charge = bestChargeWindow(future);
  ui.currentPrice.textContent = `${fmtPrice.format(current.total)} kr./kWh`;
  ui.currentKind.textContent = current.kind === "actual" ? "Officiel DK2-pris" : "Beregnet prognose";
  ui.bestPrice.textContent = `${fmtPrice.format(best.total)} kr./kWh`;
  ui.bestTime.textContent = `${fmtDate.format(best.date)} kl. ${fmtTime.format(best.date)}`;
  ui.chargePrice.textContent = `${fmtPrice.format(charge.average)} kr./kWh`;
  const last = addHours(charge.items.at(-1).date, 1);
  ui.chargeTime.textContent = `${fmtDate.format(charge.items[0].date)} kl. ${fmtTime.format(charge.items[0].date)}–${fmtTime.format(last)}`;
  ui.summary.hidden = false;
  ui.legend.hidden = false;
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

async function load() {
  ui.refresh.disabled = true;
  setStatus("Henter de nyeste DK2-priser…");
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
  const known = aggregateToHours(data.records);
  const items = buildHorizon(known, now);
  renderSummary(items, now);
  renderDays(items, now);
  const officialCount = items.filter((x) => x.kind === "actual").length;
  const forecastCount = items.length - officialCount;
  const cacheText = data.fromCache ? " Viser senest gemte data, fordi en ny hentning mislykkedes." : "";
  setStatus(`${officialCount} officielle timer og ${forecastCount} prognosetimer.${cacheText}`, data.fromCache ? "error" : "ok");
  ui.updatedAt.textContent = `Opdateret ${fmtDate.format(data.savedAt)} kl. ${fmtTime.format(data.savedAt)}`;
  ui.refresh.disabled = false;
}

if (hasDocument) {
  ui.refresh.addEventListener("click", load);
  load();
  setInterval(load, 60 * 60 * 1000);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// Eksporteres kun for de automatiske, lokale kontroller.
if (typeof module !== "undefined") module.exports = { aggregateToHours, forecastSpot, ceriusTariff, totalPrice, buildHorizon, bestChargeWindow };
