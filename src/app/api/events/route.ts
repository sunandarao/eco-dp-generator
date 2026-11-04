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
  if (type !== "downloaded" && type !== "whatsapp_confirmed") return json({ error: "invalid_event" }, 400);
  const p = await recordEvent(id, type);
  if (!p) return json({ error: "no_record" }, 404);
  return json({ ok: true });
}
