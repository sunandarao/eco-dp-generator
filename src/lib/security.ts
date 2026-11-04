import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { config } from "./config";

// ---------- rate limiting (in-memory, per instance; use a shared store if running several instances) ----------
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n++;
  if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.n <= limit;
}
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

// ---------- participant (pseudonymous) cookie ----------
export const PID_COOKIE = "eco_pid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function getPid() {
  const v = (await cookies()).get(PID_COOKIE)?.value;
  return v && UUID_RE.test(v) ? v : null;
}
export async function setPid(id: string) {
  (await cookies()).set(PID_COOKIE, id, {
    httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", maxAge: 60 * 60 * 24 * 180,
  });
}
export async function clearPid() {
  (await cookies()).delete(PID_COOKIE);
}

// ---------- admin auth ----------
export const ADMIN_COOKIE = "eco_admin";
const SESSION_MS = 8 * 60 * 60 * 1000;

/** Format: scrypt:<saltB64>:<hashB64> (no "$", which .env loaders would expand)  (generate with `npm run hash-password`) */
export function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split(":");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(pw, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
function sign(payload: string) {
  return crypto.createHmac("sha256", config.adminSessionSecret).update(payload).digest("base64url");
}
export function adminConfigured() {
  return !!(config.adminUsername && config.adminPasswordHash && config.adminSessionSecret.length >= 32);
}
export async function createAdminSession(user: string) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_MS, n: crypto.randomUUID() })).toString("base64url");
  (await cookies()).set(ADMIN_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "strict", secure: config.isProd, path: "/", maxAge: SESSION_MS / 1000,
  });
}
export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}
export async function getAdmin(): Promise<string | null> {
  if (!adminConfigured()) return null;
  if (config.adminIpAllowlist.length && !config.adminIpAllowlist.includes(await clientIp())) return null;
  const v = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!v) return null;
  const [payload, sig] = v.split(".");
  if (!payload || !sig) return null;
  const exp = sign(payload);
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    return d.exp > Date.now() ? String(d.u) : null;
  } catch {
    return null;
  }
}

/** Same-origin check for state-changing requests (CSRF defence in addition to SameSite cookies). */
export async function sameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return h.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === (h.get("x-forwarded-host") || h.get("host"));
  } catch {
    return false;
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
