// Makes a 256 px proportional copy of the official logo at build time (the original can be ~7500 px),
// so the running website never has to decode the huge file. The copy is only scaled, never altered.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.env.ECO_LOGO_PATH || path.join(process.cwd(), "public/brand/eco-logo.png");
const out = path.join(process.cwd(), "public/brand/eco-logo-256.png");
if (!fs.existsSync(src)) {
  console.log("Official logo not found – skipping (the app will show 'Setup pending').");
} else {
  await sharp(src, { limitInputPixels: 200_000_000 }).resize({ width: 256 }).png().toFile(out);
  console.log("Logo copy written:", path.relative(process.cwd(), out));
}
