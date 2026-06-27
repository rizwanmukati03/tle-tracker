// pages/api/tle.js
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const SATELLITES = [
  { name: "PRSC-EO1", norad: 62726 },
  { name: "PRSC-EO2", norad: 67748 },
  { name: "PRSC-EO3", norad: 68835 },
  { name: "PRSC-S1",  norad: 65055 },
  { name: "HS",       norad: 66054 },
  { name: "PRSS-1",   norad: 43530 },
  { name: "PAKTES-1A", norad: 43529 },
];

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const FORCE_COOLDOWN_SECONDS = 10 * 60;

function parseCached(raw) {
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function parseEpochMs(line1) {
  try {
    const epochStr = line1.substring(18, 32).trim();
    if (!epochStr) return null;
    const year2 = parseInt(epochStr.substring(0, 2), 10);
    const day = parseFloat(epochStr.substring(2));
    const year = year2 >= 57 ? 1900 + year2 : 2000 + year2;
    const date = new Date(Date.UTC(year, 0, 1));
    date.setUTCDate(date.getUTCDate() + Math.floor(day) - 1);
    const frac = day - Math.floor(day);
    date.setUTCMilliseconds(frac * 86400000);
    return date.getTime();
  } catch {
    return null;
  }
}

async function fetchFromCelestrak(norad) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=TLE`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://celestrak.org/",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Celestrak HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error("Unexpected Celestrak response");
  return { name: lines[0], line1: lines[1], line2: lines[2] };
}

async function fetchFromN2YO(norad) {
  const url = `https://www.n2yo.com/satellite/?s=${norad}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/html,*/*",
      Referer: "https://www.n2yo.com/",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`n2yo HTTP ${res.status}`);
  const html = await res.text();
  const matches = [...html.matchAll(/<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)];
  for (const match of matches) {
    const lines = match[1]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2 && lines[0].startsWith("1 ") && lines[1].startsWith("2 ")) {
      return { name: `NORAD-${norad}`, line1: lines[0], line2: lines[1] };
    }
  }
  throw new Error("TLE not found in n2yo page");
}

// Archive a TLE only if genuinely different from the last kept entry.
// Returns true if this was a real change (or the first-ever entry),
// false if it was identical to what we already had.
async function maybeArchive(norad, payload) {
  const archiveKey = `tle_archive_${norad}`;
  const latest = await redis.zrange(archiveKey, 0, 0, { rev: true });

  if (latest && latest.length > 0) {
    const lastEntry = typeof latest[0] === "string" ? JSON.parse(latest[0]) : latest[0];
    if (lastEntry.line1 === payload.line1 && lastEntry.line2 === payload.line2) {
      return false;
    }
  }

  const score = payload.epochMs != null ? payload.epochMs : payload.fetchedAt;
  await redis.zadd(archiveKey, { score, member: JSON.stringify(payload) });
  return true;
}

async function fetchTLE(norad, force = false) {
  const cacheKey = `tle_${norad}`;

  if (!force) {
    const cached = parseCached(await redis.get(cacheKey));
    if (cached) return { ...cached, fromCache: true };
  }

  let data, source;
  try {
    data = await fetchFromCelestrak(norad);
    source = "Celestrak";
  } catch (e1) {
    try {
      data = await fetchFromN2YO(norad);
      source = "n2yo";
    } catch (e2) {
      const cached = parseCached(await redis.get(cacheKey));
      if (cached) return { ...cached, fromCache: true, stale: true };
      throw new Error(`All sources failed. Celestrak: ${e1.message} | n2yo: ${e2.message}`);
    }
  }

  const fetchedAt = Date.now();
  const epochMs = parseEpochMs(data.line1);
  const payload = { ...data, source, fetchedAt, epochMs };
  await redis.set(cacheKey, JSON.stringify(payload), { ex: CACHE_TTL_SECONDS });
  const changed = await maybeArchive(norad, payload);
  return { ...payload, fromCache: false, tleChanged: changed };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const force = req.query.force === "true";
  const now = Date.now();

  if (force) {
    const cooldownKey = "tle_last_force_fetch";
    const lastForceRaw = await redis.get(cooldownKey);
    const lastForce = lastForceRaw ? parseInt(lastForceRaw, 10) : 0;

    if (lastForce && now - lastForce < FORCE_COOLDOWN_SECONDS * 1000) {
      const waitMinutes = Math.ceil((FORCE_COOLDOWN_SECONDS * 1000 - (now - lastForce)) / 60000);
      return res.status(429).json({
        error: `Force refresh cooldown active. Please wait ${waitMinutes} more minute(s).`,
        cooldown: true,
        waitMinutes,
      });
    }
    await redis.set(cooldownKey, now.toString(), { ex: FORCE_COOLDOWN_SECONDS });
  }

  try {
    const results = await Promise.allSettled(
      SATELLITES.map(async (sat) => {
        const tle = await fetchTLE(sat.norad, force);
        return { ...tle, ...sat };
      })
    );

    const satellites = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { ...SATELLITES[i], error: r.reason?.message || "Failed to fetch" };
    });

    res.status(200).json({ satellites, generatedAt: now, forced: force });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
