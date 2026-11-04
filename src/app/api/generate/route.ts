import { config, configStatus } from "@/lib/config";
import { db } from "@/lib/db";
import { generateDP, PhotoRejected } from "@/lib/ai/pipeline";
import { recordEvent } from "@/lib/participants";
import { clientIp, getPid, json, rateLimit, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Generates the DP entirely in memory. The uploaded photograph and the result are NEVER written to disk,
 * database or object storage, and are not logged. The JPEG is streamed back to the user's phone only.
 */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  const s = configStatus();
  if (!s.generationReady) return json({ error: "not_configured", missing: { logo: !s.logo, models: !s.models, ai: !s.externalOk, db: !s.databaseOk } }, 503);

  const id = await getPid();
  const p = id ? await db().getParticipant(id) : null;
  if (!p || !p.consent_at || p.consent_version !== config.noticeVersion) return json({ error: "consent_required" }, 403);

  const ip = await clientIp();
  if (!rateLimit("gen:" + p.id, 15, 60 * 60_000) || !rateLimit("genip:" + ip, 60, 60 * 60_000)) return json({ error: "rate_limited" }, 429);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > config.maxUploadBytes + 64 * 1024) return json({ error: "too_large" }, 413);

  let photo: File | null = null, variant = 0;
  try {
    const form = await req.formData();
    const f = form.get("photo");
    photo = f instanceof File ? f : null;
    variant = Math.max(0, Math.min(1000, Number(form.get("variant") || 0) | 0));
  } catch { return json({ error: "invalid_request" }, 400); }
  if (!photo) return json({ error: "invalid_image" }, 400);
  if (photo.size > config.maxUploadBytes) return json({ error: "too_large" }, 413);

  try {
    let buf: Buffer | null = Buffer.from(await photo.arrayBuffer());
    const r = await generateDP(buf, variant);
    buf.fill(0); buf = null; // best-effort wipe of the source photograph from memory
    await recordEvent(p.id, "generated");
    return new Response(new Uint8Array(r.jpeg), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "no-store, private",
        "x-dp-meta": JSON.stringify({ warnings: r.meta.warnings, variant: r.meta.variant }),
      },
    });
  } catch (e) {
    if (e instanceof PhotoRejected) return json({ error: "unsuitable_photo", reason: e.code }, 422);
    const msg = (e as Error).message || "";
    if (msg.startsWith("NOT_CONFIGURED")) return json({ error: "not_configured" }, 503);
    console.error("generate failed:", msg.slice(0, 200)); // never log image data
    return json({ error: "processing_failed" }, 500);
  }
}
