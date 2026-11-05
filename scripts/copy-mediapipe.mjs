// Copies the MediaPipe WebAssembly runtime into public/ so phones load it from this website
// (no third-party CDN). Runs automatically before `next build` and `next dev`.
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules/@mediapipe/tasks-vision/wasm");
const dest = path.join(process.cwd(), "public/mediapipe/wasm");
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log("MediaPipe runtime copied to public/mediapipe/wasm");
