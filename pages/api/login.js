// pages/api/login.js
import crypto from "crypto";
import { createSessionToken, COOKIE_NAME } from "../../lib/auth";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SHORT_SESSION_SECONDS = 60 * 60 * 12; // 12 hours — backstop expiry even for session cookies
const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

  // The signed token itself always carries a real expiry (used by middleware
  // to reject it once expired), regardless of cookie type below.
  const tokenMaxAge = rememberMe ? REMEMBER_ME_SECONDS : SHORT_SESSION_SECONDS;
  const token = await createSessionToken(secret, tokenMaxAge);

  const cookieParts = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "Secure", "SameSite=Strict"];
  if (rememberMe) {
    // Persistent cookie: survives closing the browser, for up to 30 days.
    cookieParts.push(`Max-Age=${tokenMaxAge}`);
  }
  // If rememberMe is false, no Max-Age is set at all — this makes it a true
  // session cookie, which most browsers clear when the browser fully closes
  // (not just when one tab closes). The 12-hour token expiry is the backstop
  // if someone leaves the browser open without closing it.

  res.setHeader("Set-Cookie", cookieParts.join("; "));
  return res.status(200).json({ ok: true });
}
