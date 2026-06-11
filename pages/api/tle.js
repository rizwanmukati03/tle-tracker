// pages/api/tle.js
// Server-side proxy — fetches from Celestrak with browser-like headers
// Celestrak blocks raw server requests but accepts requests with proper User-Agent

const SATELLITES = [
  { name: "PRSC-EO1", norad: 62726 },
  { name: "PRSC-EO2", norad: 67748 },
  { name: "PRSC-EO3", norad: 68835 },
];

// Simple in-memory cache (per serverless instance)
// For production: replace with Vercel KV or Upstash Redis
const cache = {};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchFromCelestrak(norad) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=TLE`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://celestrak.org/",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Celestrak HTTP ${res.status}`);
  const text = await res.text();
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) throw new Error("Unexpected Celestrak response");
  return { name: lines[0], line1: lines[1], line2: lines[2] };
}

async function fetchFromN2YO(norad) {
  const url = `https://www.n2yo.com/satellite/?s=${norad}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      Accept: "text/html,*/*",
      Referer: "https://www.n2yo.com/",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`n2yo HTTP ${res.status}`);
  const html = await res.text();

  // Extract TLE from <pre> or <code> blocks
  const matches = [...html.matchAll(/<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)];
  for (const match of matches) {
    const lines = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2 && lines[0].startsWith("1 ") && lines[1].startsWith("2 ")) {
      return { name: `NORAD-${norad}`, line1: lines[0], line2: lines[1] };
    }
  }
  throw new Error("TLE not found in n2yo page");
}

async function fetchTLE(norad) {
  const cacheKey = `tle_${norad}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached.data, source: cached.source, fetchedAt: cached.fetchedAt, fromCache: true };
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
      throw new Error(`All sources failed. Celestrak: ${e1.message} | n2yo: ${e2.message}`);
    }
  }

  const fetchedAt = Date.now();
  cache[cacheKey] = { data, source, fetchedAt };
  return { ...data, source, fetchedAt, fromCache: false };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const results = await Promise.allSettled(
      SATELLITES.map(async (sat) => {
        const tle = await fetchTLE(sat.norad);
        return { ...sat, ...tle };
      })
    );

    const satellites = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        ...SATELLITES[i],
        error: r.reason?.message || "Failed to fetch",
      };
    });

    res.status(200).json({ satellites, generatedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
