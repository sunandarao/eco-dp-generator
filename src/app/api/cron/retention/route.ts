import crypto from "node:crypto";
import { config } from "@/lib/config";
import { audit } from "@/lib/participants";
import { runRetention } from "@/lib/retention";
import { json } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Call daily from a scheduler with header  Authorization: Bearer <CRON_SECRET> */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${config.cronSecret}`;
  if (!config.cronSecret || auth.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected)))
    return json({ error: "unauthorized" }, 401);
  const deleted = await runRetention();
  await audit("system:cron", "retention_run", JSON.stringify(deleted));
  return json({ ok: true, deleted });
}
