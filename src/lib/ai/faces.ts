import sharp from "sharp";
import { faceSession, ort } from "./models";

export type Box = { x1: number; y1: number; x2: number; y2: number; score: number };

const W = 320, H = 240;

function iou(a: Box, b: Box) {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const u = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return u > 0 ? inter / u : 0;
}

/** Face DETECTION only (bounding boxes in source-pixel coordinates). No recognition/embeddings. */
export async function detectFaces(rgb: Buffer, width: number, height: number, threshold = 0.75): Promise<Box[]> {
  // Letterbox into 320x240 preserving aspect ratio.
  const scale = Math.min(W / width, H / height);
  const rw = Math.max(1, Math.round(width * scale)), rh = Math.max(1, Math.round(height * scale));
  const ox = Math.floor((W - rw) / 2), oy = Math.floor((H - rh) / 2);
  const small = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .resize(rw, rh, { kernel: "lanczos3" })
    .extend({ left: ox, top: oy, right: W - rw - ox, bottom: H - rh - oy, background: { r: 0, g: 0, b: 0 } })
    .raw().toBuffer();
  const data = new Float32Array(3 * W * H);
  for (let i = 0; i < W * H; i++) {
    data[i] = (small[i * 3] - 127) / 128;
    data[W * H + i] = (small[i * 3 + 1] - 127) / 128;
    data[2 * W * H + i] = (small[i * 3 + 2] - 127) / 128;
  }
  const sess = await faceSession();
  const out = await sess.run({ input: new ort.Tensor("float32", data, [1, 3, H, W]) });
  const scores = out.scores.data as Float32Array;
  const boxes = out.boxes.data as Float32Array;
  const n = scores.length / 2;
  const cand: Box[] = [];
  for (let i = 0; i < n; i++) {
    const s = scores[i * 2 + 1];
    if (s < threshold) continue;
    // normalised (0..1) letterboxed coords -> source pixels
    const bx = (v: number, o: number, sz: number) => (v * sz - o) / scale;
    cand.push({
      x1: Math.max(0, bx(boxes[i * 4], ox, W)), y1: Math.max(0, bx(boxes[i * 4 + 1], oy, H)),
      x2: Math.min(width, bx(boxes[i * 4 + 2], ox, W)), y2: Math.min(height, bx(boxes[i * 4 + 3], oy, H)), score: s,
    });
  }
  cand.sort((a, b) => b.score - a.score);
  const keep: Box[] = [];
  for (const c of cand) if (c.x2 > c.x1 && c.y2 > c.y1 && keep.every((k) => iou(k, c) < 0.3)) keep.push(c);
  return keep;
}
