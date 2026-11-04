import crypto from "node:crypto";
import { config } from "@/lib/config";
import { audit } from "@/lib/participants";
import { adminConfigured, clientIp, createAdminSession, json, rateLimit, sameOrigin, verifyPassword } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  if (!adminConfigured()) return json({ error: "admin_not_configured" }, 503);
  const ip = await clientIp();
  if (config.adminIpAllowlist.length && !config.adminIpAllowlist.includes(ip)) return json({ error: "forbidden" }, 403);
  if (!rateLimit("login:" + ip, 5, 15 * 60_000)) return json({ error: "rate_limited" }, 429);
  const body = await req.json().catch(() => ({}));
  const user = typeof body?.username === "string" ? body.username : "";
  const pw = typeof body?.password === "string" ? body.password : "";
  const ub = Buffer.from(user), eb = Buffer.from(config.adminUsername);
  const userOk = ub.length === eb.length && crypto.timingSafeEqual(ub, eb);
  const pwOk = verifyPassword(pw, config.adminPasswordHash); // always evaluated (timing)
  if (!userOk || !pwOk) {
    await audit("anonymous", "admin_login_failed").catch(() => {});
    return json({ error: "invalid_credentials" }, 401);
  }
  await createAdminSession(user);
  await audit(user, "admin_login").catch(() => {});
  return json({ ok: true });
}
