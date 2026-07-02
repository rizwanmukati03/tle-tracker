// pages/api/migrate-archive.js
// ONE-TIME USE — delete this file immediately after running.
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();
const NORADS = [62726, 67748, 68835, 65055, 66054, 43530, 43529];

export default async function handler(req, res) {
  if (req.query.secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const results = [];
  for (const norad of NORADS) {
    const entries = await redis.zrange(
      `dev_tle_archive_${norad}`, "-inf", "+inf",
      { byScore: true, withScores: true }
    );
    let copied = 0;
    for (let i = 0; i < entries.length; i += 2) {
      await redis.zadd(`prod_tle_archive_${norad}`, {
        score: Number(entries[i + 1]),
        member: entries[i],
      });
      copied++;
    }
    const seen = await redis.smembers(`dev_tle_archive_seen_${norad}`);
    if (seen.length > 0) {
      await redis.sadd(`prod_tle_archive_seen_${norad}`, ...seen);
    }
    results.push({ norad, copied, seen: seen.length });
  }
  return res.status(200).json({ done: true, results });
}
