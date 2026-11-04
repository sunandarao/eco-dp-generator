import { audit } from "@/lib/participants";
import { runRetention } from "@/lib/retention";
import { getAdmin, json, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST() {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  const admin = await getAdmin();
  if (!admin) return json({ error: "unauthorized" }, 401);
  const deleted = await runRetention();
  await audit(admin, "retention_run_manual", JSON.stringify(deleted));
  return json({ ok: true, deleted });
}
