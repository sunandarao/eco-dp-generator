/**
 * Runs the real AI pipeline against a folder of test photographs and writes the outputs.
 * Usage: ECO_LOGO_PATH=... npx tsx scripts/test-pipeline.ts <inputDir> <outputDir>
 */
import fs from "node:fs";
import path from "node:path";
import { generateDP, PhotoRejected } from "../src/lib/ai/pipeline";

const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
async function main() {
for (const f of fs.readdirSync(inDir).sort()) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
  const buf = fs.readFileSync(path.join(inDir, f));
  try {
    const r = await generateDP(buf, Number(process.env.VARIANT || 0));
    fs.writeFileSync(path.join(outDir, f.replace(/\.\w+$/, "") + ".out.jpg"), r.jpeg);
    console.log("OK      ", f.padEnd(26), JSON.stringify(r.meta));
  } catch (e) {
    if (e instanceof PhotoRejected) console.log("REJECTED", f.padEnd(26), e.code, e.detail ?? "");
    else console.log("ERROR   ", f.padEnd(26), (e as Error).message);
  }
}
}
main();
