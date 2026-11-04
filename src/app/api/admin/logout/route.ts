import { clearAdminSession, json, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST() {
  if (!(await sameOrigin())) return json({ error: "forbidden" }, 403);
  await clearAdminSession();
  return json({ ok: true });
}
