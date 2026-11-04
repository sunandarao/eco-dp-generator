import crypto from "node:crypto";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { categoryLabel, cleanDetails, status } from "@/lib/participants";
import { clearPid, getPid, json, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Right of access: shows the user everything stored about them (no photographs are ever stored). */
export async function GET() {
  const id = await getPid();
  const p = id ? await db().getParticipant(id) : null;
  if (!p) return json({ exists: false });
  return json({
    exists: true,
    consented: !!p.consent_at && p.consent_version === config.noticeVersion,
    record: {
      recordId: p.id, staffId: p.staff_id, category: categoryLabel(p.category), categoryCode: p.category, branch: p.branch,
      consentVersion: p.consent_version, consentAt: p.consent_at, dpsGenerated: p.generated_count,
      downloads: p.download_count, whatsappConfirmedAt: p.whatsapp_confirmed_at, status: status(p), createdAt: p.created_at,
    },
  });
}

/** Optional details (category / branch / staff ID) – can be skipped or corrected (right to correction). */
export async function PATCH(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  const id = await getPid();
  const p = id ? await db().getParticipant(id) : null;
  if (!p) return json({ error: "no_consent" }, 403);
  const body = await req.json().catch(() => ({}));
  const d = cleanDetails(body ?? {});
  if (d.staffIdInvalid) return json({ error: "invalid_staff_id" }, 400);
  p.category = d.category; p.branch = d.branch; p.staff_id = d.staff_id;
  p.updated_at = new Date().toISOString();
  await db().upsertParticipant(p);
  return json({ ok: true });
}

/** Withdraw consent + erase: deletes the participation record. A minimal withdrawal event is kept as evidence. */
export async function DELETE() {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  const id = await getPid();
  if (id) {
    await db().deleteParticipant(id);
    await db().addConsentEvent({ id: crypto.randomUUID(), participant_id: id, action: "withdrawn", notice_version: config.noticeVersion, lang: "-", created_at: new Date().toISOString() });
  }
  await clearPid();
  return json({ ok: true, deleted: !!id });
}
