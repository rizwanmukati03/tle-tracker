// pages/api/tle.js
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
const CACHE_TTL_MS = 60 * 60 * 1000;        // 1 hour server cache
const FORCE_COOLDOWN_MS = 10 * 60 * 1000;   // 10 min cooldown on force refresh

let lastForceFetch = 0;

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

async function fetchTLE(norad, force = false) {
  const cacheKey = `tle_${norad}`;
  const cached = cache[cacheKey];

  // Return cache if valid and not forced
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const expiresIn = Math.round((CACHE_TTL_MS - (Date.now() - cached.fetchedAt)) / 60000);
    return { ...cached.data, source: cached.source, fetchedAt: cached.fetchedAt, fromCache: true, expiresInMinutes: expiresIn };
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
      // Return stale cache if fetch fails rather than error
      if (cached) {
        return { ...cached.data, source: cached.source, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, expiresInMinutes: 0 };
      }
      throw new Error(`All sources failed. Celestrak: ${e1.message} | n2yo: ${e2.message}`);
    }
  }

  const fetchedAt = Date.now();
  cache[cacheKey] = { data, source, fetchedAt };
  return { ...data, source, fetchedAt, fromCache: false, expiresInMinutes: 60 };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const force = req.query.force === "true";
  const now = Date.now();

  // Enforce 10-minute cooldown on force refresh
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
        const tle = await fetchTLE(sat.norad, force);
        return { ...tle, ...sat };
      })
    );

    const satellites = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { ...SATELLITES[i], error: r.reason?.message || "Failed to fetch" };
    });

    // Cache expiry is based on the oldest satellite cache
    const minExpiry = Math.min(...satellites.filter(s => !s.error).map(s => s.expiresInMinutes || 0));

    res.status(200).json({
      satellites,
      generatedAt: now,
      cacheExpiresInMinutes: minExpiry,
      forced: force,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
