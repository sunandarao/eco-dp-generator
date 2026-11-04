import crypto from "node:crypto";
import { db, type PrivacyRequest } from "@/lib/db";
import { clientIp, getPid, json, rateLimit, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

const TYPES: PrivacyRequest["request_type"][] = ["access", "correction", "erasure", "withdraw_consent", "grievance", "nomination", "other"];

export async function POST(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  if (!rateLimit("pr:" + (await clientIp()), 5, 60 * 60_000)) return json({ error: "rate_limited" }, 429);
  const body = await req.json().catch(() => ({}));
  const type = TYPES.includes(body?.type) ? body.type : null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const contact = typeof body?.contact === "string" ? body.contact.trim().slice(0, 200) : "";
  if (!type || message.length < 5) return json({ error: "invalid_request" }, 400);
  const reference = "PR-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await db().addPrivacyRequest({
    id: crypto.randomUUID(), reference, participant_id: await getPid(), request_type: type,
    contact: contact || null, message, status: "open", created_at: new Date().toISOString(), resolved_at: null,
  });
  return json({ ok: true, reference });
}
