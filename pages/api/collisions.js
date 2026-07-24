// pages/api/collisions.js
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const ENV = process.env.VERCEL_ENV === "production" ? "prod" : "dev";

const SATELLITES = [
  { name: "PRSC-EO1",  norad: 62726 },
  { name: "PRSC-EO2",  norad: 67748 },
  { name: "PRSC-EO3",  norad: 68835 },
  { name: "PRSC-S1",   norad: 65055 },
  { name: "HS",        norad: 66054 },
  { name: "PRSS-1",    norad: 43530 },
  { name: "PAKTES-1A", norad: 43529 },
];

const CACHE_TTL_SECONDS     = 4 * 60 * 60;  // 2 hours
const FORCE_COOLDOWN_SECONDS = 30 * 60;     // 30 min cooldown on manual refresh

const TCA_PATTERN   = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
const NORAD_PATTERN = /^\d{4,6}$/;

function parseCached(raw) {
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractCells(rowHtml) {
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const cells = [];
  let m;
  while ((m = cellRegex.exec(rowHtml)) !== null) {
    cells.push(stripTags(m[1]));
  }
  return cells;
}

function parseNameStatus(raw) {
  const match = raw.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
  if (match) return { name: match[1].trim(), status: match[2].trim() };
  return { name: raw.trim(), status: "" };
}

function parseRowCells(cells) {
  const noradIdx = cells.findIndex(c => NORAD_PATTERN.test(c));
  if (noradIdx === -1) return null;

  const catnr  = cells[noradIdx];
  const nameRaw = cells[noradIdx + 1] || "";
  const dse    = cells[noradIdx + 2] || "";
  const rest   = cells.slice(noradIdx + 3);
  const tcaIdx = rest.findIndex(c => TCA_PATTERN.test(c));

  if (tcaIdx !== -1) {
    return {
      type: "object1", catnr, nameRaw, dse,
      tca: rest[tcaIdx], minRange: rest[tcaIdx + 1], relSpeed: rest[tcaIdx + 2],
    };
  }
  return {
    type: "object2", catnr, nameRaw, dse,
    maxProb: rest[rest.length - 2], dilution: rest[rest.length - 1],
  };
}

async function fetchConjunctions(norad) {
  const url = `https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${norad}&ORDER=MINRANGE&MAX=10`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "LEO-Asset-Tracker/1.0 (non-commercial internal orbital monitoring)",
      "Accept":     "text/html,*/*",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`SOCRATES HTTP ${res.status}`);
  const html = await res.text();

  const recordsMatch = html.match(/(\d+)\s+records found/i);
  if (recordsMatch && recordsMatch[1] === "0") return [];

  const rowRegex  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const parsedRows = [];
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const cells  = extractCells(m[1]);
    const parsed = parseRowCells(cells);
    if (parsed) parsedRows.push(parsed);
  }

  const conjunctions = [];
  let pending = null;

  for (const row of parsedRows) {
    if (row.type === "object1") {
      pending = row;
    } else if (row.type === "object2" && pending) {
      const isUsA       = String(pending.catnr) === String(norad);
      const us          = isUsA ? pending : row;
      const other       = isUsA ? row : pending;
      const otherParsed = parseNameStatus(other.nameRaw);

      conjunctions.push({
        otherNorad:   other.catnr,
        otherName:    otherParsed.name,
        otherStatus:  otherParsed.status,
        tca:          pending.tca,
        minRangeKm:   parseFloat(pending.minRange),
        relSpeedKmS:  parseFloat(pending.relSpeed),
        maxProb:      row.maxProb && row.maxProb !== "" ? parseFloat(row.maxProb) : null,
        dilutionKm:   row.dilution && row.dilution !== "" ? parseFloat(row.dilution) : null,
        dse:          parseFloat(us.dse),
      });
      pending = null;
    }
  }

  return conjunctions.filter(c => !Number.isNaN(c.minRangeKm));
}

function riskLevel(minRangeKm) {
  if (minRangeKm < 1) return "critical";
  if (minRangeKm < 3) return "warning";
  return "watch";
}

async function getConjunctionsForSat(norad, force = false) {
  const cacheKey = `${ENV}_conj_${norad}`;

  if (!force) {
    const cached = parseCached(await redis.get(cacheKey));
    if (cached) return { conjunctions: cached.conjunctions, fetchedAt: cached.fetchedAt, fromCache: true };
  }

  try {
    const data      = await fetchConjunctions(norad);
    const fetchedAt = Date.now();
    await redis.set(cacheKey, JSON.stringify({ conjunctions: data, fetchedAt }), { ex: CACHE_TTL_SECONDS });
    return { conjunctions: data, fetchedAt, fromCache: false };
  } catch (err) {
    const cached = parseCached(await redis.get(cacheKey));
    if (cached) return { conjunctions: cached.conjunctions, fetchedAt: cached.fetchedAt, fromCache: true, stale: true };
    throw err;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const force = req.query.force === "true";
  const now   = Date.now();

  if (force) {
    const cooldownKey  = `${ENV}_collisions_last_force_fetch`;
    const lastForceRaw = await redis.get(cooldownKey);
    const lastForce    = lastForceRaw ? parseInt(lastForceRaw, 10) : 0;

    if (lastForce && now - lastForce < FORCE_COOLDOWN_SECONDS * 1000) {
      const waitMinutes = Math.ceil((FORCE_COOLDOWN_SECONDS * 1000 - (now - lastForce)) / 60000);
      return res.status(429).json({
        error: `Collision data was just refreshed. Next manual refresh available in ${waitMinutes} minute(s). Data auto-updates every 2 hours.`,
        cooldown: true,
        waitMinutes,
      });
    }
    await redis.set(cooldownKey, now.toString(), { ex: FORCE_COOLDOWN_SECONDS });
  }

  try {
    const results = await Promise.allSettled(
      SATELLITES.map(async (sat) => {
        const result   = await getConjunctionsForSat(sat.norad, force);
        const withRisk = result.conjunctions.map(c => ({ ...c, risk: riskLevel(c.minRangeKm) }));
        return { ...sat, ...result, conjunctions: withRisk };
      })
    );

    const satellites = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { ...SATELLITES[i], error: r.reason?.message || "Failed to fetch", conjunctions: [] };
    });

    res.status(200).json({ satellites, generatedAt: now, forced: force, env: ENV });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
