// Downloads the two on-server AI models and verifies their SHA-256 checksums.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const dir = process.env.MODELS_DIR || path.join(process.cwd(), "models");
const models = [
  {
    file: "u2net_human_seg.onnx",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx",
    sha256: "01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c",
  },
  {
    file: "face-rfb-320.onnx",
    url: "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/onnx/version-RFB-320.onnx",
    sha256: "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017",
  },
];
const sum = (b) => crypto.createHash("sha256").update(b).digest("hex");
fs.mkdirSync(dir, { recursive: true });
for (const m of models) {
  const dest = path.join(dir, m.file);
  if (fs.existsSync(dest) && sum(fs.readFileSync(dest)) === m.sha256) {
    console.log("ok  ", m.file);
    continue;
  }
  console.log("get ", m.url);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sum(buf) !== m.sha256) throw new Error(`${m.file}: checksum mismatch`);
  fs.writeFileSync(dest, buf);
  console.log("ok  ", m.file);
}
