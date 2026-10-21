import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "lifexi_admin";
const TWO_WEEKS = 60 * 60 * 24 * 14;

type Payload = { u: string; exp: number };

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Falta ADMIN_SESSION_SECRET");
  return value;
}

function sign(input: string) {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

export function encodeSession(username: string) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + TWO_WEEKS * 1000 } satisfies Payload),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined | null) {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Payload;
    if (!data.u || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_WEEKS,
  };
}
