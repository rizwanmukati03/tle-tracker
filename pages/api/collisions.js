// pages/api/collisions.js
const SATELLITES = [
  { name: "PRSC-EO1", norad: 62726 },
  { name: "PRSC-EO2", norad: 67748 },
  { name: "PRSC-EO3", norad: 68835 },
  { name: "PRSC-S1",  norad: 65055 },
  { name: "HS",       norad: 66054 },
  { name: "PRSS-1",   norad: 43530 },
  { name: "PAKTES-1A", norad: 43529 },
];

const cache = {};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FORCE_COOLDOWN_MS = 10 * 60 * 1000;
let lastForceFetch = 0;

const TCA_PATTERN = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
const NORAD_PATTERN = /^\d{4,6}$/;

async function debugFetch(norad, res) {
  const url = `https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${norad}&ORDER=MINRANGE&MAX=10`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  const tableIdx = text.indexOf("<table");
  const trCount = (text.match(/<tr/gi) || []).length;
  const recordsFoundMatch = text.match(/(\d+)\s+records found/i);
  const summary =
    `TOTAL HTML LENGTH: ${text.length}\n` +
    `<table FOUND AT INDEX: ${tableIdx}\n` +
    `<tr> COUNT: ${trCount}\n` +
    `"records found" TEXT: ${recordsFoundMatch ? recordsFoundMatch[0] : "NOT FOUND"}\n\n`;
  const snippet = tableIdx !== -1 ? text.slice(tableIdx, tableIdx + 4000) : text.slice(0, 4000);
  res.setHeader("Content-Type", "text/plain");
  res.status(200).send(`STATUS: ${r.status}\n\n${summary}--- SNIPPET ---\n${snippet}`);
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
  const noradIdx = cells.findIndex((c) => NORAD_PATTERN.test(c));
  if (noradIdx === -1) return null;

  const catnr = cells[noradIdx];
  const nameRaw = cells[noradIdx + 1] || "";
  const dse = cells[noradIdx + 2] || "";
  const rest = cells.slice(noradIdx + 3);

  const tcaIdx = rest.findIndex((c) => TCA_PATTERN.test(c));

  if (tcaIdx !== -1) {
    return {
      type: "object1",
      catnr,
      nameRaw,
      dse,
      tca: rest[tcaIdx],
      minRange: rest[tcaIdx + 1],
      relSpeed: rest[tcaIdx + 2],
    };
  }

  const maxProb = rest[rest.length - 2];
  const dilution = rest[rest.length - 1];
  return { type: "object2", catnr, nameRaw, dse, maxProb, dilution };
}

async function fetchConjunctions(norad) {
  const url = `https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${norad}&ORDER=MINRANGE&MAX=10`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`SOCRATES HTTP ${res.status}`);
  const html = await res.text();

  const recordsMatch = html.match(/(\d+)\s+records found/i);
  if (recordsMatch && recordsMatch[1] === "0") return [];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const parsedRows = [];
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = extractCells(m[1]);
    const parsed = parseRowCells(cells);
    if (parsed) parsedRows.push(parsed);
  }

  const conjunctions = [];
  let pending = null;

  for (const row of parsedRows) {
    if (row.type === "object1") {
      pending = row;
    } else if (row.type === "object2" && pending) {
      const isUsA = String(pending.catnr) === String(norad);
      const us = isUsA ? pending : row;
      const other = isUsA ? row : pending;
      const otherParsed = parseNameStatus(other.nameRaw);

      conjunctions.push({
        otherNorad: other.catnr,
        otherName: otherParsed.name,
        otherStatus: otherParsed.status,
        tca: pending.tca,
        minRangeKm: parseFloat(pending.minRange),
        relSpeedKmS: parseFloat(pending.relSpeed),
        maxProb: row.maxProb && row.maxProb !== "" ? parseFloat(row.maxProb) : null,
        dilutionKm: row.dilution && row.dilution !== "" ? parseFloat(row.dilution) : null,
        dse: parseFloat(us.dse),
      });
      pending = null;
    }
  }

  return conjunctions.filter((c) => !Number.isNaN(c.minRangeKm));
}

function riskLevel(minRangeKm) {
  if (minRangeKm < 1) return "critical";
  if (minRangeKm < 3) return "warning";
  return "watch";
}

async function getConjunctionsForSat(norad, force = false) {
  const cacheKey = `conj_${norad}`;
  const cached = cache[cacheKey];

  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { conjunctions: cached.data, fetchedAt: cached.fetchedAt, fromCache: true };
  }

  try {
    const data = await fetchConjunctions(norad);
    const fetchedAt = Date.now();
    cache[cacheKey] = { data, fetchedAt };
    return { conjunctions: data, fetchedAt, fromCache: false };
  } catch (err) {
    if (cached) {
      return { conjunctions: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: true };
    }
    throw err;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.query.debug === "true") {
    return debugFetch(req.query.norad || 68835, res);
  }

  const force = req.query.force === "true";
  const now = Date.now();

  if (force && now - lastForceFetch < FORCE_COOLDOWN_MS) {
    const waitMinutes = Math.ceil((FORCE_COOLDOWN_MS - (now - lastForceFetch)) / 60000);
    return res.status(429).json({
      error: `Force refresh cooldown active. Please wait ${waitMinutes} more minute(s).`,
      cooldown: true,
      waitMinutes,
    });
  }
  if (force) lastForceFetch = now;

  try {
    const results = await Promise.allSettled(
      SATELLITES.map(async (sat) => {
        const result = await getConjunctionsForSat(sat.norad, force);
        const withRisk = result.conjunctions.map((c) => ({ ...c, risk: riskLevel(c.minRangeKm) }));
        return { ...sat, ...result, conjunctions: withRisk };
      })
    );

    const satellites = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { ...SATELLITES[i], error: r.reason?.message || "Failed to fetch", conjunctions: [] };
    });

    res.status(200).json({ satellites, generatedAt: now, forced: force });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
