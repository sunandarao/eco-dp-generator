import { db } from "@/lib/db";
import { audit, toCsv } from "@/lib/participants";
import { getAdmin, json } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return json({ error: "unauthorized" }, 401);
  const rows = await db().listParticipants();
  await audit(admin, "csv_export", `${rows.length} rows`);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="eco-dp-participation-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
