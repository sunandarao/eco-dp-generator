import sharp from "sharp";
import { config } from "../config";

/**
 * OPTIONAL external AI matting provider (remove.bg). DISABLED unless ECO IT/Legal/InfoSec have approved the
 * provider and EXTERNAL_AI_PROVIDER_APPROVED=true is set. Only the cropped head-and-shoulders image is sent.
 * NOTE: not exercised in development testing (no API key available) – must be tested before enabling.
 */
export async function removeBgMatte(rgb: Buffer, size: number): Promise<Buffer> {
  if (!config.externalProviderApproved) throw new Error("NOT_CONFIGURED: external AI provider not approved");
  if (!config.removeBgApiKey) throw new Error("NOT_CONFIGURED: REMOVE_BG_API_KEY missing");
  const jpeg = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "photo.jpg");
  form.append("size", "auto"); form.append("type", "person"); form.append("format", "png");
  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST", headers: { "X-Api-Key": config.removeBgApiKey }, body: form, signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`AI provider error ${res.status}`);
  const png = Buffer.from(await res.arrayBuffer());
  return sharp(png).resize(size, size, { fit: "fill" }).ensureAlpha().extractChannel(3).raw().toBuffer();
}
