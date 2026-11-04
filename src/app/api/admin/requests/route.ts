import { db } from "@/lib/db";
import { audit } from "@/lib/participants";
import { getAdmin, json, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

/** Update the status of a privacy request; "erase_record" also deletes the linked participation record. */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  const admin = await getAdmin();
  if (!admin) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  const reqs = await db().listPrivacyRequests();
  const r = reqs.find((x) => x.id === id);
  if (!r) return json({ error: "not_found" }, 404);
  if (action === "erase_record") {
    if (r.participant_id) await db().deleteParticipant(r.participant_id);
    await db().updatePrivacyRequest(id, "closed");
    await audit(admin, "privacy_erasure", r.reference);
  } else if (action === "open" || action === "in_progress" || action === "closed") {
    await db().updatePrivacyRequest(id, action);
    await audit(admin, "privacy_request_status", `${r.reference} -> ${action}`);
  } else return json({ error: "invalid_action" }, 400);
  return json({ ok: true });
}
