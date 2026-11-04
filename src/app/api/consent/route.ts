import crypto from "node:crypto";
import { config } from "@/lib/config";
import { isLang } from "@/lib/i18n";
import { db } from "@/lib/db";
import { newParticipant } from "@/lib/participants";
import { clientIp, getPid, json, rateLimit, sameOrigin, setPid } from "@/lib/security";

export const runtime = "nodejs";

/** Records affirmative consent to the current privacy notice version. */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  if (!rateLimit("consent:" + (await clientIp()), 20, 10 * 60_000)) return json({ error: "rate_limited" }, 429);
  const body = await req.json().catch(() => ({}));
  if (body?.agree !== true || body?.noticeVersion !== config.noticeVersion) return json({ error: "consent_required" }, 400);
  const lang = isLang(body.lang) ? body.lang : "en";

  let id = await getPid();
  let p = id ? await db().getParticipant(id) : null;
  if (!p) {
    id = crypto.randomUUID();
    p = newParticipant(id);
  }
  const now = new Date().toISOString();
  p.consent_version = config.noticeVersion;
  p.consent_at = now;
  p.updated_at = now;
  await db().upsertParticipant(p);
  await db().addConsentEvent({ id: crypto.randomUUID(), participant_id: p.id, action: "granted", notice_version: config.noticeVersion, lang, created_at: now });
  await setPid(p.id);
  return json({ ok: true });
}
