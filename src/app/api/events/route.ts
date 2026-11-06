import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/participants";
import { getPid, json, rateLimit, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

/** Download and WhatsApp-update confirmation are tracked as SEPARATE events. */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  const id = await getPid();
  if (!id) return json({ error: "no_consent" }, 403);
  if (!rateLimit("evt:" + id, 60, 60 * 60_000)) return json({ error: "rate_limited" }, 429);
  const body = await req.json().catch(() => ({}));
  const type = body?.type;
  if (type !== "downloaded" && type !== "whatsapp_confirmed" && type !== "generated") return json({ error: "invalid_event" }, 400);
  if (type === "generated") {
    // In device mode the DP is made on the phone; it is recorded only for a participant with current consent.
    if (config.aiMode !== "device") return json({ error: "invalid_event" }, 400);
    const p = await db().getParticipant(id);
    if (!p?.consent_at || p.consent_version !== config.noticeVersion) return json({ error: "consent_required" }, 403);
    if (config.requireStaffId && !p.staff_id) return json({ error: "details_required" }, 403);
  }
  const p = await recordEvent(id, type);
  if (!p) return json({ error: "no_record" }, 404);
  return json({ ok: true });
}
