// lib/auth.js
// Session tokens are signed with HMAC-SHA256 using Web Crypto API (crypto.subtle),
// which is available natively in both the Edge runtime (middleware) and Node 18+
// (API routes) — so the same code verifies the token in both places with no
// runtime-specific branching and no extra dependencies.

export const COOKIE_NAME = "leo_session";

function base64urlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Creates a signed session token. Token format: base64url(payload).base64url(signature)
 * The payload only ever contains an expiry timestamp — no username/password,
 * so the cookie itself leaks nothing even if someone copies it from devtools.
 */
export async function createSessionToken(secret, maxAgeSeconds = 60 * 60 * 12) {
  const payload = JSON.stringify({ exp: Date.now() + maxAgeSeconds * 1000 });
  const enc = new TextEncoder();
  const payloadB64 = base64urlEncode(enc.encode(payload));
  const key = await getKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = base64urlEncode(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies a session token's signature and expiry. Returns true/false only —
 * never throws, so callers can use it directly in an if-check.
 */
export async function verifySessionToken(secret, token) {
  if (!secret || !token || !token.includes(".")) return false;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return false;
  try {
    const key = await getKey(secret);
    const enc = new TextEncoder();
    const sigBytes = base64urlDecode(sigB64);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!valid) return false;

    const payloadBytes = base64urlDecode(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload.exp || Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

