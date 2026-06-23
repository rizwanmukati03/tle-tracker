// pages/api/logout.js
import { COOKIE_NAME } from "../../lib/auth";

export default function handler(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
  res.status(200).json({ ok: true });
}
