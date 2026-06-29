// pages/api/archive.js
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Keep dev (Preview) and production data completely separate.
const ENV = process.env.VERCEL_ENV === "production" ? "prod" : "dev";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { norad, from, to, limit } = req.query;

  if (!norad) {
    return res.status(400).json({ error: "norad query parameter is required" });
  }

  const key = `${ENV}_tle_archive_${norad}`;
  const minScore = from ? Number(from) : "-inf";
  const maxScore = to ? Number(to) : "+inf";
  const count = limit ? Math.min(parseInt(limit, 10), 5000) : 50;

  try {
    const raw = await redis.zrange(key, maxScore, minScore, {
      byScore: true,
      rev: true,
      withScores: true,
      offset: 0,
      count,
    });

    const entries = [];
    for (let i = 0; i < raw.length; i += 2) {
      const member = raw[i];
      const score = raw[i + 1];
      const parsed = typeof member === "string" ? JSON.parse(member) : member;
      entries.push({ ...parsed, epochMs: Number(score) });
    }

    res.status(200).json({ norad: Number(norad), count: entries.length, entries, env: ENV });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
