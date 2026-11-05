// Downloads the AI models and verifies their SHA-256 checksums.
//   node scripts/fetch-models.mjs            -> server + on-device models
//   node scripts/fetch-models.mjs --device   -> only the on-device (phone) models (free hosting mode)
//   node scripts/fetch-models.mjs --server   -> only the server models
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const serverDir = process.env.MODELS_DIR || path.join(root, "models");
const deviceDir = path.join(root, "public/models/device");
const only = process.argv.includes("--device") ? "device" : process.argv.includes("--server") ? "server" : "all";

const models = [
  {
    kind: "server", dir: serverDir, file: "u2net_human_seg.onnx",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx",
    sha256: "01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c",
  },
  {
    kind: "server", dir: serverDir, file: "face-rfb-320.onnx",
    url: "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/onnx/version-RFB-320.onnx",
    sha256: "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017",
  },
  // On-device models (Google MediaPipe, Apache-2.0) – served from this website to the phone
  {
    kind: "device", dir: deviceDir, file: "selfie_multiclass_256x256.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    sha256: "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0",
  },
  {
    kind: "device", dir: deviceDir, file: "blaze_face_short_range.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
    sha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
  },
];

const sum = (b) => crypto.createHash("sha256").update(b).digest("hex");
for (const m of models) {
  if (only !== "all" && m.kind !== only) continue;
  fs.mkdirSync(m.dir, { recursive: true });
  const dest = path.join(m.dir, m.file);
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
