// pages/api/login.js
import crypto from "crypto";
import { createSessionToken, COOKIE_NAME } from "../../lib/auth";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SHORT_SESSION_SECONDS = 60 * 60 * 12; // 12 hours
const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30; // 30 days

// In-memory, per-instance rate limiting. Resets on cold start, not shared
// across concurrent instances — a real deterrent against casual guessing,
// not against a distributed brute force.
const attempts = new Map();

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) {
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

  const { username, password, rememberMe } = req.body || {};
  const usernameOk = safeCompare(username, validUser);
  const passwordOk = safeCompare(password, validPass);

  if (!usernameOk || !passwordOk) {
    record.count += 1;
    return res.status(401).json({ error: "Invalid username or password" });
  }

  attempts.delete(ip);

const tokenMaxAge = rememberMe ? REMEMBER_ME_SECONDS : SHORT_SESSION_SECONDS;
const token = await createSessionToken(secret, tokenMaxAge);

const cookieParts = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "Secure", "SameSite=Strict"];
if (rememberMe) {
  // Only set Max-Age when "remember me" is checked — omitting it makes
  // this a true session cookie that's cleared when the browser fully closes.
  // The signed token itself still expires after 12h either way, as a backstop.
  cookieParts.push(`Max-Age=${tokenMaxAge}`);
}
res.setHeader("Set-Cookie", cookieParts.join("; "));
return res.status(200).json({ ok: true });
}
