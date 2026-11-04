import fs from "node:fs";
import { config, fileExists } from "@/lib/config";

export const runtime = "nodejs";

/** Serves the official ECO logo file exactly as supplied (same file used for the DP watermark). */
export async function GET() {
  if (!fileExists(config.logoPath)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(config.logoPath)), {
    headers: { "content-type": config.logoPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "public, max-age=3600" },
  });
}
