import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_PATH = path.join(ROOT, "data", "forecast-log.json");
const ACCURACY_PATH = path.join(ROOT, "data", "accuracy.json");
const AREAS = ["DK1", "DK2"];
const forecastUrl = (area) => `https://elpriser.org/api/forecast?area=${area}&mode=spot_ex`;
const dayAheadUrl = (area, start, end) => {
  const filter = encodeURIComponent(JSON.stringify({ PriceArea: [area] }));
  return `https://api.energidataservice.dk/dataset/DayAheadPrices?start=${start}&end=${end}&columns=TimeDK,PriceArea,DayAheadPriceDKK&filter=${filter}&sort=TimeDK&limit=0`;
};
const COPENHAGEN = "Europe/Copenhagen";

function copenhagenParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: COPENHAGEN,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function addNaiveHours(localKey, hours) {
  const [datePart, timePart] = localKey.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const hour = Number(timePart.slice(0, 2));
  const result = new Date(Date.UTC(year, month - 1, day, hour + hours));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}T${String(result.getUTCHours()).padStart(2, "0")}:00`;
}

function addDateDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

function shouldRun(localHour, forceRun = false) {
  return forceRun || localHour >= 11;
}

function hasSnapshotsForDate(snapshots, date, areas = AREAS) {
  return areas.every((area) => snapshots.some((item) => item.collectedDate === date && (item.area || "DK2") === area));
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`${url} svarede med fejl ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function readLog() {
  try {
    const payload = JSON.parse(await fs.readFile(LOG_PATH, "utf8"));
    return { version: 1, snapshots: Array.isArray(payload.snapshots) ? payload.snapshots : [] };
  } catch {
    return { version: 1, snapshots: [] };
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function forecastPoints(payload, startKey, endKey) {
  const points = [];
  for (const day of payload.days || []) {
    if (day.type !== "forecast" || !day.date || !Array.isArray(day.prices)) continue;
    for (const item of day.prices) {
      const hour = Number(item.hour);
      const price = Number(item.price);
      if (!Number.isInteger(hour) || !Number.isFinite(price)) continue;
      const target = `${day.date}T${String(hour).padStart(2, "0")}:00`;
      if (target >= startKey && target < endKey) points.push({ target, forecastSpotExVat: price });
    }
  }
  return points.sort((a, b) => a.target.localeCompare(b.target));
}

function actualPriceMap(payload) {
  const buckets = new Map();
  if (Array.isArray(payload.records)) {
    for (const record of payload.records) {
      const price = Number(record.DayAheadPriceDKK);
      if (!record.TimeDK || !Number.isFinite(price)) continue;
      const target = `${record.TimeDK.slice(0, 13)}:00`;
      if (!buckets.has(target)) buckets.set(target, []);
      buckets.get(target).push(price / 1000);
    }
  } else {
    const days = Array.isArray(payload.days) ? payload.days : [payload];
    for (const day of days) {
      if (!day?.date || !Array.isArray(day.prices)) continue;
      for (const item of day.prices) {
        const hour = Number(item.hour);
        const price = Number(item.price);
        if (Number.isInteger(hour) && Number.isFinite(price)) {
          const target = `${day.date}T${String(hour).padStart(2, "0")}:00`;
          if (!buckets.has(target)) buckets.set(target, []);
          buckets.get(target).push(price);
        }
      }
    }
  }
  const map = new Map();
  for (const [target, values] of buckets) map.set(target, values.reduce((sum, value) => sum + value, 0) / values.length);
  return map;
}

function scoreSnapshots(snapshots, actualPrices, area = "DK2") {
  const observations = [];
  for (const snapshot of snapshots) {
    if ((snapshot.area || "DK2") !== area) continue;
    for (const point of snapshot.points || []) {
      const actual = actualPrices.get(point.target);
      if (!Number.isFinite(actual)) continue;
      const errorOre = Math.abs(Number(point.forecastSpotExVat) - actual) * 100;
      observations.push({
        area,
        issuedAt: snapshot.collectedAt,
        target: point.target,
        forecastSpotExVat: Number(point.forecastSpotExVat),
        actualSpotExVat: actual,
        errorOre: Math.round(errorOre * 100) / 100
      });
    }
  }
  return observations.sort((a, b) => a.target.localeCompare(b.target) || a.issuedAt.localeCompare(b.issuedAt));
}

async function main() {
  const now = new Date();
  const local = copenhagenParts(now);
  const forceRun = process.env.FORCE_RUN === "true";

  const log = await readLog();
  const cutoff = now.getTime() - 100 * 86400000;
  log.snapshots = log.snapshots.filter((item) => new Date(item.collectedAt).getTime() >= cutoff);

  const forecasts = new Map();
  for (const area of AREAS) forecasts.set(area, await fetchJson(forecastUrl(area)));

  const allPoints = log.snapshots.flatMap((item) => item.points || []);
  if (allPoints.length) {
    const firstDate = allPoints.map((item) => item.target.slice(0, 10)).sort()[0];
    const endDate = addDateDays(local.date, 2);
    const observations = [];
    for (const area of AREAS) {
      const actualPayload = await fetchJson(dayAheadUrl(area, firstDate, endDate));
      observations.push(...scoreSnapshots(log.snapshots, actualPriceMap(actualPayload), area));
    }
    observations.sort((a, b) => a.target.localeCompare(b.target) || a.area.localeCompare(b.area) || a.issuedAt.localeCompare(b.issuedAt));
    await writeJson(ACCURACY_PATH, { updatedAt: now.toISOString(), metric: "spot_ex_vat_mae", observations });
    console.log(`Opdaterede træfsikkerheden med ${observations.length} sammenligninger.`);
  } else {
    await writeJson(ACCURACY_PATH, { updatedAt: now.toISOString(), metric: "spot_ex_vat_mae", observations: [] });
  }

  if (!shouldRun(local.hour, forceRun)) {
    console.log(`Ingen ny prognosesnapshot endnu: klokken er ${local.hour} i København.`);
    return;
  }

  if (!forceRun && hasSnapshotsForDate(log.snapshots, local.date)) {
    console.log(`Dagens prognose for ${local.date} er allerede gemt for DK1 og DK2.`);
    return;
  }

  for (const area of AREAS) {
    if (!log.snapshots.some((item) => item.collectedDate === local.date && (item.area || "DK2") === area)) {
      const forecast = forecasts.get(area);
      const startKey = `${local.date}T${String(local.hour).padStart(2, "0")}:00`;
      const points = forecastPoints(forecast, startKey, addNaiveHours(startKey, 96));
      if (!points.length) throw new Error(`${area}-prognosen indeholdt ingen fremtidige prognosetimer inden for 96 timer.`);
      log.snapshots.push({ area, collectedDate: local.date, collectedAt: now.toISOString(), sourceGeneratedAt: forecast.generated || null, points });
      console.log(`Gemte ${points.length} ${area}-prognosetimer for ${local.date}.`);
    }
  }
  log.snapshots.sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  await writeJson(LOG_PATH, log);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { addNaiveHours, forecastPoints, actualPriceMap, scoreSnapshots, shouldRun, hasSnapshotsForDate };
