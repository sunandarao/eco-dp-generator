"use client";
/**
 * ON-DEVICE DP generation (free-hosting mode). Runs entirely in the phone's browser:
 * the photograph is never uploaded anywhere.
 *  - Face DETECTION: MediaPipe BlazeFace (Apache-2.0) – locates faces only; no recognition or embeddings.
 *  - Person SEGMENTATION: MediaPipe selfie_multiclass_256x256 (Apache-2.0).
 * The composition, checks and identity-preserving enhancement mirror the server pipeline (src/lib/ai/pipeline.ts).
 */
import { FaceDetector, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

export const OUT = 1080;
export type RejectCode =
  | "invalid_image" | "too_small" | "no_face" | "multiple_people" | "face_too_small"
  | "too_dark" | "too_bright" | "too_blurry" | "person_unclear" | "too_close";
export class PhotoRejected extends Error {
  constructor(public code: RejectCode) { super(code); }
}
type Box = { x1: number; y1: number; x2: number; y2: number };

const WASM = "/mediapipe/wasm";
const SEG_MODEL = "/models/device/selfie_multiclass_256x256.tflite";
const FACE_MODEL = "/models/device/blaze_face_short_range.tflite";

// Same framings as the server; regenerate cycles through them.
const VARIANTS = [
  { zoom: 3.2, faceY: 0.4 },
  { zoom: 2.8, faceY: 0.41 },
  { zoom: 3.6, faceY: 0.38 },
  { zoom: 3.0, faceY: 0.4 },
];
// Calibration so phone framing matches the server framing (measured on the same photos):
// BlazeFace boxes are ~1.24× wider than the server detector's, near-square, and centred ~15% of a face-width lower.
const FACE_W = 0.81, FACE_ASPECT = 1.48, FACE_UP = 0.15;

// ---------------------------------------------------------------- model loading (once per page) ---
type Models = { fd: FaceDetector; seg: ImageSegmenter };
let ready: Promise<Models> | null = null;

async function fetchBytes(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error("model_download_failed");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length; onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Downloads (first time) and initialises the on-device AI. `onProgress` receives 0..100. */
export function loadModels(onProgress?: (pct: number) => void): Promise<Models> {
  if (!ready) {
    ready = (async () => {
      const total = 9_500_000 + 16_371_837 + 229_746; // approx. wasm + models
      let got = 0;
      const tick = (n: number) => { got += n; onProgress?.(Math.min(99, Math.round((got / total) * 100))); };
      // Pre-fetch the runtime so the download shows progress (the browser then serves it from cache).
      const simd = typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
      const [, segBuf, faceBuf] = await Promise.all([
        fetchBytes(`${WASM}/vision_wasm${simd ? "" : "_nosimd"}_internal.wasm`, tick).catch(() => null),
        fetchBytes(SEG_MODEL, tick),
        fetchBytes(FACE_MODEL, tick),
      ]);
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      const fd = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: faceBuf, delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.6,
      });
      const seg = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: segBuf, delegate: "CPU" }, runningMode: "IMAGE",
        outputConfidenceMasks: true, outputCategoryMask: false,
      });
      onProgress?.(100);
      return { fd, seg };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

// ---------------------------------------------------------------------------------- helpers ---
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return { c, ctx };
}

let logoCache: { key: string; c: HTMLCanvasElement } | null = null;
/** The official logo, scaled proportionally only (high-quality step-down), never altered. */
async function logoAt(width: number): Promise<HTMLCanvasElement> {
  const key = String(width);
  if (logoCache?.key === key) return logoCache.c;
  const img = new Image();
  img.src = "/api/brand-logo";
  await img.decode();
  let src: CanvasImageSource = img, sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw / 2 >= width) { // halve repeatedly for a clean downscale
    const { c, ctx } = canvas(Math.round(sw / 2), Math.round(sh / 2));
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const h = Math.round((width * img.naturalHeight) / img.naturalWidth);
  const { c, ctx } = canvas(width, h);
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, width, h);
  logoCache = { key, c };
  return c;
}

/** Connected regions of the matte: zero those not touching the face; report the largest other region. */
function keepComponentsTouching(matte: Uint8Array, size: number, face: Box) {
  const N = 160, f = size / N;
  const bin = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    bin[y * N + x] = matte[Math.min(size - 1, Math.floor((y + 0.5) * f)) * size + Math.min(size - 1, Math.floor((x + 0.5) * f))] > 64 ? 1 : 0;
  const label = new Int32Array(N * N);
  const keep = new Set<number>(); const areas: number[] = [0];
  let cur = 0; const stack: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (!bin[i] || label[i]) continue;
    cur++; label[i] = cur; stack.push(i);
    let touches = false, area = 0;
    while (stack.length) {
      const p = stack.pop()!; area++;
      const px = p % N, py = (p / N) | 0, sx = (px + 0.5) * f, sy = (py + 0.5) * f;
      if (sx >= face.x1 && sx <= face.x2 && sy >= face.y1 && sy <= face.y2) touches = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const q = ny * N + nx;
        if (bin[q] && !label[q]) { label[q] = cur; stack.push(q); }
      }
    }
    areas.push(area);
    if (touches) keep.add(cur);
  }
  let mainArea = 0, otherMax = 0;
  for (let l = 1; l <= cur; l++) { if (keep.has(l)) mainArea += areas[l]; else otherMax = Math.max(otherMax, areas[l]); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = label[Math.min(N - 1, Math.floor(y / f)) * N + Math.min(N - 1, Math.floor(x / f))];
    if (l && !keep.has(l)) matte[y * size + x] = 0;
  }
  return { mainArea, otherMax };
}

function blurSmall(m: Uint8Array, w: number, h: number) { // 1-2-1 separable blur ≈ sigma 0.6
  const t = new Uint8Array(m.length), o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, l = x > 0 ? m[i - 1] : m[i], r = x < w - 1 ? m[i + 1] : m[i];
    t[i] = (l + 2 * m[i] + r) >> 2;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = y > 0 ? t[i - w] : t[i], d = y < h - 1 ? t[i + w] : t[i];
    o[i] = (u + 2 * t[i] + d) >> 2;
  }
  return o;
}

// ------------------------------------------------------------------------------- the pipeline ---
export type DeviceResult = { blob: Blob; warnings: string[]; ms: number; debug: { faceW: number; frameS: number; cx: number; cy: number } };

export async function generateOnDevice(photo: Blob, variantIndex = 0): Promise<DeviceResult> {
  const t0 = performance.now();
  const { fd, seg } = await loadModels();
  const v = VARIANTS[((variantIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];

  // 1. Decode (the photo was already resized and stripped of metadata by prepareImage)
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(photo); } catch { throw new PhotoRejected("invalid_image"); }
  const W = bmp.width, H = bmp.height;
  if (Math.min(W, H) < 300) throw new PhotoRejected("too_small");
  const src = canvas(W, H);
  src.ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = src.ctx.getImageData(0, 0, W, H).data;

  // 2. Face detection (location only) and suitability checks
  const dets = fd.detect(src.c).detections
    .map((d) => d.boundingBox!)
    .filter(Boolean)
    .map((b) => {
      const w = b.width * FACE_W, h = w * FACE_ASPECT;
      const cx = b.originX + b.width / 2, cy = b.originY + b.height / 2 - FACE_UP * w;
      return { x1: Math.max(0, cx - w / 2), y1: Math.max(0, cy - h / 2), x2: Math.min(W, cx + w / 2), y2: Math.min(H, cy + h / 2) };
    });
  if (!dets.length) throw new PhotoRejected("no_face");
  const area = (b: Box) => (b.x2 - b.x1) * (b.y2 - b.y1);
  dets.sort((a, b) => area(b) - area(a));
  const main = dets[0];
  if (dets.filter((d) => area(d) >= 0.2 * area(main)).length > 1) throw new PhotoRejected("multiple_people");
  const fw = main.x2 - main.x1, fh = main.y2 - main.y1;
  if (fw < 60 || fh < 60) throw new PhotoRejected("face_too_small");
  // Face fills most of the photo's width: a head-and-shoulders DP can't be made without cutting the sides.
  if (W < 1.7 * fw) throw new PhotoRejected("too_close");

  let sum = 0, n = 0;
  for (let y = Math.round(main.y1); y < Math.round(main.y2); y++) for (let x = Math.round(main.x1); x < Math.round(main.x2); x++) {
    const i = (y * W + x) * 4; sum += lum(rgba[i], rgba[i + 1], rgba[i + 2]); n++;
  }
  const fl = n ? sum / n / 255 : 0;
  if (fl < 0.1) throw new PhotoRejected("too_dark");
  if (fl > 0.94) throw new PhotoRejected("too_bright");
  { // blur: variance of the Laplacian on the face scaled to 160×160
    const g = canvas(160, 160);
    g.ctx.drawImage(src.c, main.x1, main.y1, fw, fh, 0, 0, 160, 160);
    const d = g.ctx.getImageData(0, 0, 160, 160).data;
    const gr = new Float32Array(160 * 160);
    for (let i = 0; i < gr.length; i++) gr[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let s = 0, s2 = 0, k = 0;
    for (let y = 1; y < 159; y++) for (let x = 1; x < 159; x++) {
      const i = y * 160 + x, l = gr[i - 1] + gr[i + 1] + gr[i - 160] + gr[i + 160] - 4 * gr[i];
      s += l; s2 += l * l; k++;
    }
    if (s2 / k - (s / k) ** 2 < 12) throw new PhotoRejected("too_blurry");
  }
  const warnings: string[] = [];
  if (fw < 140) warnings.push("low_resolution");

  // 3–4. Frame (head-and-shoulders) and segment the person
  const fcx = (main.x1 + main.x2) / 2, fcy = (main.y1 + main.y2) / 2;
  const frame = (zoom: number, fx: number, faceY: number, noTopPad = false) => {
    let S = Math.round(Math.max(zoom * fw, 2.3 * fw));
    // The photo (nearly) fills the full WIDTH: at most ~8% white space at each side, so shoulders are not
    // visibly cut off (real-phone feedback). Narrow photos get centred on the photo, not the face.
    const MAX_S = Math.round(W * 1.18);
    if (S > MAX_S) S = MAX_S;
    let left = Math.round(fcx - fx * S);
    if (S <= W) left = Math.min(Math.max(0, left), W - S);
    else left = Math.round(Math.min(Math.max(left, W - S), 0)); // keep the padding within ±(S-W) and split it
    // Never white space BELOW (the body runs off the bottom edge); white space may be added ABOVE the head.
    let top = Math.round(fcy - faceY * S);
    if (noTopPad) top = Math.max(0, top); // the photo cuts the hair: keep its top edge at the top of the DP
    if (top + S > H) top = H - S;
    const k = OUT / S;
    const out = canvas(OUT, OUT);
    out.ctx.fillStyle = "#fff"; out.ctx.fillRect(0, 0, OUT, OUT);
    // photo area inside the frame
    const sx0 = Math.max(0, left), sy0 = Math.max(0, top), sx1 = Math.min(W, left + S), sy1 = Math.min(H, top + S);
    const ix0 = Math.round((sx0 - left) * k), iy0 = Math.round((sy0 - top) * k);
    const ix1 = Math.round((sx1 - left) * k), iy1 = Math.round((sy1 - top) * k);
    const iw = ix1 - ix0, ih = iy1 - iy0;
    out.ctx.imageSmoothingQuality = "high";
    out.ctx.drawImage(src.c, sx0, sy0, sx1 - sx0, sy1 - sy0, ix0, iy0, iw, ih);
    const face: Box = { x1: (main.x1 - left) * k, y1: (main.y1 - top) * k, x2: (main.x2 - left) * k, y2: (main.y2 - top) * k };

    // segment the photo area only (square, edges replicated), so added white space can't confuse the model
    const sq = Math.max(iw, ih);
    const r = canvas(sq, sq);
    r.ctx.drawImage(out.c, ix0, iy0, iw, ih, 0, 0, iw, ih);
    if (sq > iw) r.ctx.drawImage(out.c, ix1 - 1, iy0, 1, ih, iw, 0, sq - iw, ih);
    if (sq > ih) r.ctx.drawImage(r.c, 0, ih - 1, sq, 1, 0, ih, sq, sq - ih);
    let mask: Float32Array | null = null, mw = 0, mh = 0;
    seg.segment(r.c, (res) => {
      const bg = res.confidenceMasks?.[0]; // category 0 = background
      if (bg) { mask = new Float32Array(bg.getAsFloat32Array()); mw = bg.width; mh = bg.height; }
    });
    if (!mask) throw new PhotoRejected("person_unclear");
    const mk: Float32Array = mask;
    let matte = new Uint8Array(OUT * OUT);
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
      // bilinear sample of (1 - background)
      const u = ((x - ix0 + 0.5) / sq) * mw - 0.5, w = ((y - iy0 + 0.5) / sq) * mh - 0.5;
      const xa = Math.max(0, Math.min(mw - 1, Math.floor(u))), ya = Math.max(0, Math.min(mh - 1, Math.floor(w)));
      const xb = Math.min(mw - 1, xa + 1), yb = Math.min(mh - 1, ya + 1), ax = Math.min(1, Math.max(0, u - xa)), ay = Math.min(1, Math.max(0, w - ya));
      const bgv = (mk[ya * mw + xa] * (1 - ax) + mk[ya * mw + xb] * ax) * (1 - ay) + (mk[yb * mw + xa] * (1 - ax) + mk[yb * mw + xb] * ax) * ay;
      matte[y * OUT + x] = Math.round((1 - bgv) * 255);
    }
    const comp = keepComponentsTouching(matte, OUT, face);
    // The phone model is less certain on plain walls: treat <35% person-confidence as background.
    for (let i = 0; i < matte.length; i++) matte[i] = Math.max(0, Math.min(255, Math.round(((matte[i] - 90) / (175 - 90)) * 255)));
    // Did the original photo cut through the top of the head? (checked before edges are faded)
    // Then white space above would show a flat-topped head.
    let hits = 0;
    for (let x = ix0; x < ix1; x += 2) if (matte[Math.min(OUT - 1, iy0 + 1) * OUT + x] > 128) hits++;
    const topCut = top <= 0 && hits > 6; // only where the photo's real top edge is in the DP
    const FE = 36; // fade a photo edge that falls inside the DP
    if (ix0 > 0 || iy0 > 0 || ix1 < OUT) {
      for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
        let d = FE;
        if (ix0 > 0) d = Math.min(d, x - ix0);
        if (ix1 < OUT) d = Math.min(d, ix1 - 1 - x);
        if (iy0 > 0) d = Math.min(d, y - iy0);
        if (d < FE) matte[y * OUT + x] = Math.round(matte[y * OUT + x] * (d / FE));
      }
    }
    matte = blurSmall(matte, OUT, OUT);
    let cover = 0, cn = 0;
    for (let y = Math.max(0, Math.round(face.y1)); y < Math.min(OUT, Math.round(face.y2)); y++)
      for (let x = Math.max(0, Math.round(face.x1)); x < Math.min(OUT, Math.round(face.x2)); x++) { cover += matte[y * OUT + x]; cn++; }
    if (!cn || cover / cn / 255 < 0.6) throw new PhotoRejected("person_unclear");
    return { out, matte, face, comp, S, topCut };
  };

  // Logo top-right (the person's left), fixed spot inside WhatsApp's round crop, clear of the head.
  const R = OUT / 2 - 14, LP = Math.ceil(OUT / 2 - R / Math.SQRT2), GAP = 40;
  const clearOf = (m: Uint8Array, x: number, y: number, w: number, h: number, gap = GAP) => {
    for (let yy = Math.max(0, y - gap); yy < Math.min(OUT, y + h + gap); yy += 2)
      for (let xx = Math.max(0, x - gap); xx < Math.min(OUT, x + w + gap); xx += 2)
        if (m[yy * OUT + xx] > 24) return false;
    return true;
  };
  let logo = await logoAt(170);
  const ly = LP; // fixed spot inside WhatsApp's round crop (a corner logo would be hidden by the circle)
  const lx = (lg: HTMLCanvasElement) => OUT - LP - lg.width;
  const logoClear = (fr: { matte: Uint8Array }, lg: HTMLCanvasElement) => clearOf(fr.matte, lx(lg), ly, lg.width, lg.height);
  // the shoulders must stay in the picture (no "floating head")
  const shouldersOk = (fr: { face: Box }) => fr.face.y2 <= 0.8 * OUT;

  // Attempts, least change first: standard layout → a little wider → person moved down a little (white above).
  const attempts = [
    { z: 1.3, fx: 0.42, dy: 0 }, { z: 1.5, fx: 0.41, dy: 0 },
    { z: 1.5, fx: 0.41, dy: 0.05 }, { z: 1.5, fx: 0.41, dy: 0.1 }, { z: 1.5, fx: 0.41, dy: 0.15 },
  ];
  let f = frame(v.zoom * attempts[0].z, attempts[0].fx, v.faceY);
  // another sizeable person who wasn't detected as a face (e.g. turned away)
  if (f.comp.otherMax > 0.35 * f.comp.mainArea) throw new PhotoRejected("multiple_people");
  if (f.topCut) {
    // The original photo cuts through the top of the head: no white space above (it would show a flat head).
    f = frame(v.zoom * attempts[0].z, attempts[0].fx, v.faceY, true);
  } else if (!logoClear(f, logo)) {
    for (const at of attempts.slice(1)) {
      const c = frame(v.zoom * at.z, at.fx, v.faceY + at.dy);
      if (c.topCut || !shouldersOk(c)) break;   // moving further down would cut the head or lose the shoulders
      f = c;
      if (logoClear(c, logo)) break;
    }
  }
  if (!logoClear(f, logo)) {
    // slightly smaller logo at the same spot
    for (const size of [150, 130]) {
      const cand = await logoAt(size);
      logo = cand;
      if (logoClear(f, cand)) break;
    }
    // The logo must never touch the head: keep at least a small gap, otherwise ask for a retake.
    if (!clearOf(f.matte, lx(logo), ly, logo.width, logo.height, 14)) throw new PhotoRejected("too_close");
  }

  // 5. Identity-preserving enhancement: one global tone curve, colour ratios (skin tone) preserved.
  const px = f.out.ctx.getImageData(0, 0, OUT, OUT);
  const d = px.data;
  let ls = 0, ln = 0;
  for (let y = Math.max(0, Math.round(f.face.y1)); y < Math.min(OUT, Math.round(f.face.y2)); y++)
    for (let x = Math.max(0, Math.round(f.face.x1)); x < Math.min(OUT, Math.round(f.face.x2)); x++) {
      const i = y * OUT + x;
      if (f.matte[i] < 128) continue;
      ls += lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); ln++;
    }
  const L = ln ? ls / ln / 255 : 0.5;
  const target = L + (0.58 - L) * 0.75;
  const gamma = Math.min(1.4, Math.max(0.5, Math.log(target) / Math.log(Math.max(0.02, L))));
  if (gamma < 0.72) warnings.push("dark_photo");
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let y = Math.pow(i / 255, gamma);
    y = y + 0.06 * (y - 0.5) * (1 - Math.abs(2 * y - 1));
    lut[i] = Math.max(0, Math.min(1, y)) * 255;
  }
  for (let i = 0; i < OUT * OUT; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const l = lum(r, g, b), lo = lut[Math.round(l)], k = l > 0.5 ? lo / l : 1;
    const sat = k > 1 ? Math.max(0.6, 1 / Math.sqrt(k)) : 1;
    d[i * 4] = lo + (r * k - lo) * sat; d[i * 4 + 1] = lo + (g * k - lo) * sat; d[i * 4 + 2] = lo + (b * k - lo) * sat;
    d[i * 4 + 3] = f.matte[i];
  }
  // mild sharpening (unsharp mask via a blurred copy)
  const person = canvas(OUT, OUT);
  person.ctx.putImageData(px, 0, 0);
  const soft = canvas(OUT, OUT);
  soft.ctx.filter = "blur(0.8px)";
  soft.ctx.drawImage(person.c, 0, 0);
  const sd = soft.ctx.getImageData(0, 0, OUT, OUT).data;
  if (soft.ctx.filter === "blur(0.8px)") { // filter supported (Chrome/Android); otherwise skip sharpening
    for (let i = 0; i < OUT * OUT * 4; i++) {
      if ((i & 3) === 3) continue;
      d[i] = d[i] + 0.5 * (d[i] - sd[i]);
    }
    person.ctx.putImageData(px, 0, 0);
  }

  // 6. Compose: white → official logo → person on top (logo can never cover the face or body)
  const final = canvas(OUT, OUT);
  final.ctx.fillStyle = "#fff"; final.ctx.fillRect(0, 0, OUT, OUT);
  final.ctx.drawImage(logo, lx(logo), ly);
  final.ctx.drawImage(person.c, 0, 0);
  const blob = await new Promise<Blob | null>((r) => final.c.toBlob(r, "image/jpeg", 0.92));
  if (!blob) throw new Error("encode_failed");
  return { blob, warnings, ms: Math.round(performance.now() - t0), debug: { faceW: Math.round(fw), frameS: f.S, cx: Math.round(fcx), cy: Math.round(fcy) } };
}
