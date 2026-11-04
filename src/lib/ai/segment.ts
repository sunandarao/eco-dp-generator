import sharp from "sharp";
import { segSession, ort } from "./models";

const S = 320;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

/**
 * AI person segmentation (U²-Net human seg). Input: square RGB raw buffer of `size`.
 * Returns an alpha matte (Uint8, size x size, 0..255).
 */
export async function segmentPerson(rgb: Buffer, size: number): Promise<Buffer> {
  const small = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .resize(S, S, { kernel: "lanczos3" }).raw().toBuffer();
  let max = 1;
  for (let i = 0; i < small.length; i++) if (small[i] > max) max = small[i];
  const data = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++)
    for (let c = 0; c < 3; c++) data[c * S * S + i] = (small[i * 3 + c] / max - MEAN[c]) / STD[c];
  const sess = await segSession();
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, S, S]) });
  const pred = out[sess.outputNames[0]].data as Float32Array;
  let mn = Infinity, mx = -Infinity;
  for (const v of pred) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const m = Buffer.alloc(S * S);
  for (let i = 0; i < S * S; i++) m[i] = Math.round(((pred[i] - mn) / (mx - mn || 1)) * 255);
  return sharp(m, { raw: { width: S, height: S, channels: 1 } }).resize(size, size, { kernel: "cubic" }).extractChannel(0).raw().toBuffer();
}

/** Keep only connected regions of the matte that overlap the given face box (removes other people / stray blobs). */
export function keepComponentsTouching(matte: Buffer, size: number, face: { x1: number; y1: number; x2: number; y2: number }) {
  const N = 160, f = size / N; // label at reduced resolution for speed
  const bin = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    bin[y * N + x] = matte[Math.min(size - 1, Math.floor((y + 0.5) * f)) * size + Math.min(size - 1, Math.floor((x + 0.5) * f))] > 64 ? 1 : 0;
  const label = new Int32Array(N * N);
  let cur = 0; const keep = new Set<number>();
  const stack: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (!bin[i] || label[i]) continue;
    cur++; label[i] = cur; stack.push(i);
    let touches = false;
    while (stack.length) {
      const p = stack.pop()!; const px = p % N, py = (p / N) | 0;
      const sx = (px + 0.5) * f, sy = (py + 0.5) * f;
      if (sx >= face.x1 && sx <= face.x2 && sy >= face.y1 && sy <= face.y2) touches = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const q = ny * N + nx;
        if (bin[q] && !label[q]) { label[q] = cur; stack.push(q); }
      }
    }
    if (touches) keep.add(cur);
  }
  let removed = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = label[Math.min(N - 1, Math.floor(y / f)) * N + Math.min(N - 1, Math.floor(x / f))];
    const i = y * size + x;
    if (matte[i] > 0 && (l === 0 ? false : !keep.has(l))) { removed++; matte[i] = 0; }
  }
  return removed;
}
