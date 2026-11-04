import sharp, { type OutputInfo } from "sharp";
import { config, fileExists } from "../config";
import { detectFaces, type Box } from "./faces";
import { segmentPerson, keepComponentsTouching } from "./segment";
import { removeBgMatte } from "./providers";

export const OUT = 1080;

export type RejectCode =
  | "invalid_image" | "too_small" | "no_face" | "multiple_people" | "face_too_small"
  | "too_dark" | "too_bright" | "too_blurry" | "person_unclear";

export class PhotoRejected extends Error {
  constructor(public code: RejectCode, public detail?: string) { super(code); }
}

export type GenerateResult = {
  jpeg: Buffer;
  meta: { faces: number; brightnessGamma: number; watermark: string; warnings: string[]; variant: number; ms: number; provider: string };
};

/** "Regenerate" cycles through these composition variants. None of them alter the face or clothing. */
const VARIANTS = [
  { zoom: 3.2, faceY: 0.4, wm: "right" as const },
  { zoom: 2.8, faceY: 0.41, wm: "left" as const },
  { zoom: 3.6, faceY: 0.38, wm: "right" as const },
  { zoom: 3.0, faceY: 0.4, wm: "left" as const },
];
export const VARIANT_COUNT = VARIANTS.length;

// --- simple concurrency limiter so a burst of uploads cannot exhaust server memory ---
let running = 0; const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= config.maxConcurrentJobs) await new Promise<void>((r) => queue.push(r));
  running++;
  try { return await fn(); } finally { running--; queue.shift()?.(); }
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function faceStats(rgb: Buffer, w: number, f: Box, mask?: Buffer) {
  let sum = 0, n = 0;
  const x1 = Math.round(f.x1), x2 = Math.round(f.x2), y1 = Math.round(f.y1), y2 = Math.round(f.y2);
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
    const i = y * w + x;
    if (mask && mask[i] < 128) continue;
    sum += lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); n++;
  }
  return n ? sum / n / 255 : 0;
}

async function sharpness(rgb: Buffer, w: number, h: number, f: Box) {
  const left = Math.max(0, Math.round(f.x1)), top = Math.max(0, Math.round(f.y1));
  const width = Math.max(8, Math.min(w - left, Math.round(f.x2 - f.x1)));
  const height = Math.max(8, Math.min(h - top, Math.round(f.y2 - f.y1)));
  const g = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .extract({ left, top, width, height }).resize(160, 160, { fit: "fill" }).greyscale().extractChannel(0).raw().toBuffer();
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < 159; y++) for (let x = 1; x < 159; x++) {
    const i = y * 160 + x;
    const l = g[i - 1] + g[i + 1] + g[i - 160] + g[i + 160] - 4 * g[i];
    s += l; s2 += l * l; n++;
  }
  return s2 / n - (s / n) ** 2; // variance of Laplacian
}

// The official logo can be very large (e.g. 7500 px); scale it once and reuse it for every DP.
const wmCache = new Map<string, Promise<{ data: Buffer; w: number; h: number }>>();
function loadWatermark(width: number) {
  const p = fileExists(config.watermarkLogoPath) ? config.watermarkLogoPath : config.logoPath;
  const key = `${p}:${width}:${config.watermarkOpacity}`;
  let hit = wmCache.get(key);
  if (!hit) {
    hit = (async () => {
      // The official logo is only scaled proportionally – never redrawn, recoloured or distorted.
      const { data, info } = await sharp(p, { limitInputPixels: 200_000_000 }).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * config.watermarkOpacity);
      return { data, w: info.width, h: info.height };
    })();
    hit.catch(() => wmCache.delete(key));
    wmCache.set(key, hit);
  }
  return hit;
}

export async function generateDP(input: Buffer, variantIndex = 0): Promise<GenerateResult> {
  if (!fileExists(config.logoPath)) throw new Error("NOT_CONFIGURED: official ECO logo file missing");
  return slot(async () => {
    const t0 = Date.now();
    const v = VARIANTS[((variantIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];

    // 1. Decode (EXIF orientation applied; metadata incl. GPS discarded; never written to disk)
    let src: { data: Buffer; info: OutputInfo };
    try {
      src = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
        .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha()
        .raw().toBuffer({ resolveWithObject: true });
    } catch { throw new PhotoRejected("invalid_image"); }
    const { width: W, height: H } = src.info;
    const rgb = src.data;
    if (Math.min(W, H) < 300) throw new PhotoRejected("too_small");

    // 2. Face detection (location only) – suitability checks
    const faces = await detectFaces(rgb, W, H);
    if (!faces.length) throw new PhotoRejected("no_face");
    const area = (b: Box) => (b.x2 - b.x1) * (b.y2 - b.y1);
    faces.sort((a, b) => area(b) - area(a));
    const main = faces[0];
    const significant = faces.filter((f) => area(f) >= 0.2 * area(main));
    if (significant.length > 1) throw new PhotoRejected("multiple_people", String(significant.length));
    const fw = main.x2 - main.x1, fh = main.y2 - main.y1;
    if (fw < 60 || fh < 60) throw new PhotoRejected("face_too_small");
    const fl = faceStats(rgb, W, main);
    if (fl < 0.1) throw new PhotoRejected("too_dark");
    if (fl > 0.94) throw new PhotoRejected("too_bright");
    const sh = await sharpness(rgb, W, H, main);
    if (sh < 12) throw new PhotoRejected("too_blurry", sh.toFixed(1));

    const warnings: string[] = [];
    if (fw < 140) warnings.push("low_resolution");

    // 3. Head-and-shoulders square composition centred on the face
    const fcx = (main.x1 + main.x2) / 2, fcy = (main.y1 + main.y2) / 2;
    let S = Math.min(v.zoom * fw, W, H);
    if (S < 2.3 * fw) S = 2.3 * fw; // allow white padding rather than cropping the head
    S = Math.round(S);
    let left = Math.round(fcx - S / 2), top = Math.round(fcy - v.faceY * S);
    if (S <= W) left = Math.min(Math.max(0, left), W - S);
    if (S <= H) top = Math.min(Math.max(0, top), H - S);
    const padL = Math.max(0, -left), padT = Math.max(0, -top), padR = Math.max(0, left + S - W), padB = Math.max(0, top + S - H);
    const padded = (padL || padT || padR || padB)
      ? await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
        .extend({ left: padL, top: padT, right: padR, bottom: padB, background: "#ffffff" }).raw().toBuffer()
      : rgb;
    const crop = await sharp(padded, { raw: { width: W + padL + padR, height: H + padT + padB, channels: 3 } })
      .extract({ left: left + padL, top: top + padT, width: S, height: S })
      .resize(OUT, OUT, { kernel: "lanczos3" }).raw().toBuffer();
    const k = OUT / S;
    const face: Box = { x1: (main.x1 - left) * k, y1: (main.y1 - top) * k, x2: (main.x2 - left) * k, y2: (main.y2 - top) * k, score: main.score };

    // 4. AI background removal (person matting)
    let matte: Buffer;
    if (config.aiProvider === "removebg") {
      matte = await removeBgMatte(crop, OUT);
    } else {
      matte = await segmentPerson(crop, OUT);
    }
    keepComponentsTouching(matte, OUT, face);
    // padded (non-photo) areas can never be "person"
    for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
      const sx = x / k + left, sy = y / k + top;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) matte[y * OUT + x] = 0;
    }
    // tighten matte edges
    for (let i = 0; i < matte.length; i++) matte[i] = Math.max(0, Math.min(255, Math.round(((matte[i] - 18) / (235 - 18)) * 255)));
    const smooth = await sharp(matte, { raw: { width: OUT, height: OUT, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer();

    let faceCover = 0, fn = 0;
    for (let y = Math.round(face.y1); y < Math.round(face.y2); y++) for (let x = Math.round(face.x1); x < Math.round(face.x2); x++) {
      if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
      faceCover += smooth[y * OUT + x]; fn++;
    }
    if (!fn || faceCover / fn / 255 < 0.6) throw new PhotoRejected("person_unclear");

    // 5. Identity-preserving enhancement: ONE global tone curve on luminance; colour ratios (skin tone) preserved.
    //    No face reshaping, no skin smoothing, no generative re-drawing.
    const L = faceStats(crop, OUT, face, smooth);
    const target = L + (0.58 - L) * 0.75;
    const gamma = Math.min(1.4, Math.max(0.5, Math.log(target) / Math.log(Math.max(0.02, L))));
    if (gamma < 0.72) warnings.push("dark_photo");
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 255; let y = Math.pow(x, gamma);
      y = y + 0.06 * (y - 0.5) * (1 - Math.abs(2 * y - 1)); // very gentle mid-tone contrast
      lut[i] = Math.max(0, Math.min(1, y)) * 255;
    }
    const enh = Buffer.alloc(crop.length);
    for (let i = 0; i < OUT * OUT; i++) {
      const r = crop[i * 3], g = crop[i * 3 + 1], b = crop[i * 3 + 2];
      const l = lum(r, g, b);
      const lo = lut[Math.round(l)];
      const f = l > 0.5 ? lo / l : 1;
      // Luminance-ratio scaling keeps hue (skin tone); when brightening, chroma is damped so the
      // result does not look over-saturated. Same global curve for the whole photo – no local retouching.
      const sat = f > 1 ? Math.max(0.6, 1 / Math.sqrt(f)) : 1;
      enh[i * 3] = Math.max(0, Math.min(255, lo + (r * f - lo) * sat));
      enh[i * 3 + 1] = Math.max(0, Math.min(255, lo + (g * f - lo) * sat));
      enh[i * 3 + 2] = Math.max(0, Math.min(255, lo + (b * f - lo) * sat));
    }
    const sharpened = await sharp(enh, { raw: { width: OUT, height: OUT, channels: 3 } })
      .sharpen({ sigma: 0.7, m1: 0.6, m2: 1.2 }).raw().toBuffer();
    const person = Buffer.alloc(OUT * OUT * 4);
    for (let i = 0; i < OUT * OUT; i++) {
      person[i * 4] = sharpened[i * 3]; person[i * 4 + 1] = sharpened[i * 3 + 1]; person[i * 4 + 2] = sharpened[i * 3 + 2];
      person[i * 4 + 3] = smooth[i];
    }

    // 6. Watermark placement: behind the person, inside WhatsApp's circular crop, choosing the most visible spot.
    const wm = await loadWatermark(200);
    const R = OUT / 2 - 20, C = OUT / 2;
    const inCircle = (x: number, y: number) => (x - C) ** 2 + (y - C) ** 2 <= R * R;
    const visibility = (x: number, y: number) => {
      let occ = 0, n = 0;
      for (let yy = y; yy < y + wm.h; yy += 3) for (let xx = x; xx < x + wm.w; xx += 3) { occ += smooth[yy * OUT + xx]; n++; }
      return 1 - occ / n / 255;
    };
    // Prefer upper area on the variant's side; the logo must stay clearly visible and inside the circular DP crop.
    let chosen = { x: 0, y: 0, vis: -1, score: -Infinity };
    for (let y = 40; y + wm.h < OUT - 40; y += 20) for (let x = 40; x + wm.w < OUT - 40; x += 20) {
      if (!inCircle(x, y) || !inCircle(x + wm.w, y) || !inCircle(x, y + wm.h) || !inCircle(x + wm.w, y + wm.h)) continue;
      const vis = visibility(x, y);
      const sidePref = (v.wm === "right" ? x > C : x + wm.w < C) ? 0.03 : 0;
      const score = Math.min(vis, 0.98) + sidePref - (y / OUT) * 0.04;
      if (score > chosen.score) chosen = { x, y, vis, score };
    }
    const wmName = `${chosen.y < C ? "upper" : "lower"}-${chosen.x + wm.w / 2 < C ? "left" : "right"} (${Math.round(chosen.vis * 100)}% visible)`;

    const jpeg = await sharp({ create: { width: OUT, height: OUT, channels: 3, background: "#ffffff" } })
      .composite([
        { input: wm.data, raw: { width: wm.w, height: wm.h, channels: 4 }, left: chosen.x, top: chosen.y },
        { input: person, raw: { width: OUT, height: OUT, channels: 4 }, left: 0, top: 0 },
      ])
      .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return {
      jpeg,
      meta: { faces: faces.length, brightnessGamma: Number(gamma.toFixed(3)), watermark: wmName, warnings, variant: variantIndex, ms: Date.now() - t0, provider: config.aiProvider },
    };
  });
}
