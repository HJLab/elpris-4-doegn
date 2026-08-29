import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_PATH = path.join(ROOT, "data", "forecast-log.json");
const ACCURACY_PATH = path.join(ROOT, "data", "accuracy.json");
const FORECAST_URL = "https://elpriser.org/api/forecast?area=DK2&mode=spot_ex";
const PRICE_URL = "https://elpriser.org/api/prices?area=DK2&mode=spot_ex";
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

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} svarede med fejl ${response.status}`);
  return response.json();
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
  const map = new Map();
  const days = Array.isArray(payload.days) ? payload.days : [payload];
  for (const day of days) {
    if (!day?.date || !Array.isArray(day.prices)) continue;
    for (const item of day.prices) {
      const hour = Number(item.hour);
      const price = Number(item.price);
      if (Number.isInteger(hour) && Number.isFinite(price)) {
        map.set(`${day.date}T${String(hour).padStart(2, "0")}:00`, price);
      }
    }
  }
  return map;
}

function scoreSnapshots(snapshots, actualPrices, today) {
  const observations = [];
  for (const snapshot of snapshots) {
    for (const point of snapshot.points || []) {
      if (point.target.slice(0, 10) >= today) continue;
      const actual = actualPrices.get(point.target);
      if (!Number.isFinite(actual)) continue;
      const errorOre = Math.abs(Number(point.forecastSpotExVat) - actual) * 1.25 * 100;
      observations.push({
        issuedAt: snapshot.collectedAt,
        target: point.target,
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
  if (!forceRun && local.hour !== 15) {
    console.log(`Springer over: klokken er ${local.hour} i København.`);
    return;
  }

  const log = await readLog();
  const cutoff = now.getTime() - 100 * 86400000;
  log.snapshots = log.snapshots.filter((item) => new Date(item.collectedAt).getTime() >= cutoff);

  if (!log.snapshots.some((item) => item.collectedDate === local.date)) {
    const forecast = await fetchJson(FORECAST_URL);
    const startKey = `${local.date}T${String(local.hour).padStart(2, "0")}:00`;
    const points = forecastPoints(forecast, startKey, addNaiveHours(startKey, 96));
    if (!points.length) throw new Error("Prognosen indeholdt ingen fremtidige prognosetimer inden for 96 timer.");
    log.snapshots.push({
      collectedDate: local.date,
      collectedAt: now.toISOString(),
      sourceGeneratedAt: forecast.generated || null,
      points
    });
    log.snapshots.sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
    await writeJson(LOG_PATH, log);
    console.log(`Gemte ${points.length} prognosetimer for ${local.date}.`);
  } else {
    console.log(`Prognosen for ${local.date} er allerede gemt.`);
  }

  const completedPoints = log.snapshots.flatMap((item) => item.points || []).filter((item) => item.target.slice(0, 10) < local.date);
  if (!completedPoints.length) {
    await writeJson(ACCURACY_PATH, { updatedAt: now.toISOString(), observations: [] });
    return;
  }

  const firstDate = completedPoints.map((item) => item.target.slice(0, 10)).sort()[0];
  const lastDate = addDateDays(local.date, -1);
  const actualPayload = await fetchJson(`${PRICE_URL}&start=${firstDate}&end=${lastDate}`);
  const observations = scoreSnapshots(log.snapshots, actualPriceMap(actualPayload), local.date);
  await writeJson(ACCURACY_PATH, { updatedAt: now.toISOString(), observations });
  console.log(`Opdaterede træfsikkerheden med ${observations.length} sammenligninger.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { addNaiveHours, forecastPoints, actualPriceMap, scoreSnapshots };
