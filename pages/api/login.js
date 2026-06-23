// pages/api/login.js
import crypto from "crypto";
import { createSessionToken, COOKIE_NAME } from "../../lib/auth";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

// NOTE: this is an in-memory Map, scoped to a single serverless instance.
// It resets on cold start and isn't shared across concurrent instances.
// It will slow down a casual brute-force attempt from one IP, but it is
// NOT a substitute for a real rate limiter (e.g. Vercel KV / Upstash)
// against a distributed attack. Flagging this rather than overselling it.
const attempts = new Map();

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// Timing-safe string comparison so failed-login response time can't be used
// to infer how many characters matched.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length so a length mismatch doesn't
    // return measurably faster than a length match.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  const now = Date.now();
  let record = attempts.get(ip);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    record = { count: 0, firstAttempt: now };
    attempts.set(ip, record);
  }

  if (record.count >= MAX_ATTEMPTS) {
    const waitMin = Math.ceil((WINDOW_MS - (now - record.firstAttempt)) / 60000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${waitMin} minute(s).` });
  }

  const validUser = process.env.AUTH_USER;
  const validPass = process.env.AUTH_PASS;
  const secret = process.env.SESSION_SECRET;

  if (!validUser || !validPass || !secret) {
    console.error("Missing AUTH_USER / AUTH_PASS / SESSION_SECRET environment variables");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const { username, password } = req.body || {};
  const usernameOk = safeCompare(username, validUser);
  const passwordOk = safeCompare(password, validPass);

  if (!usernameOk || !passwordOk) {
    record.count += 1;
    return res.status(401).json({ error: "Invalid username or password" });
  }

  attempts.delete(ip);

  const token = await createSessionToken(secret, SESSION_MAX_AGE_SECONDS);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
  return res.status(200).json({ ok: true });
}
