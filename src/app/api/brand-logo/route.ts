import fs from "node:fs";
import path from "node:path";
import { config, fileExists } from "@/lib/config";

export const runtime = "nodejs";

let cached: Promise<Buffer> | null = null;

/**
 * Serves the official ECO logo for the page header. The original file can be very large, so it is scaled
 * proportionally to 256 px wide (nothing else is changed) and cached, keeping the page light on mobile data.
 */
export async function GET() {
  if (!fileExists(config.logoPath)) return new Response("Not found", { status: 404 });
  // Prefer the copy made at build time (scripts/prepare-logo.mjs): no large image decode on the server.
  const prebuilt = path.join(process.cwd(), "public/brand/eco-logo-256.png");
  cached ??= fileExists(prebuilt)
    ? Promise.resolve(fs.readFileSync(prebuilt))
    : import("sharp").then(({ default: sharp }) =>
        sharp(config.logoPath, { limitInputPixels: 200_000_000 }).resize({ width: 256 }).png().toBuffer());
  try {
    return new Response(new Uint8Array(await cached), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
    });
  } catch {
    cached = null;
    return new Response("Logo could not be read", { status: 500 });
  }
}
