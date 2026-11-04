import path from "node:path";
import * as ort from "onnxruntime-node";
import { config } from "../config";

/**
 * On-server AI models (run inside ECO's own hosting – photographs are NOT sent to any third party):
 *  - u2net_human_seg.onnx : U²-Net human segmentation (Apache-2.0) – separates the person from the background.
 *  - face-rfb-320.onnx    : Ultra-Light-Fast face DETECTOR (MIT) – only locates faces (count / position / size)
 *                           for composition and suitability checks. It does NOT create face templates,
 *                           embeddings or perform recognition / identity matching.
 */
let segP: Promise<ort.InferenceSession> | null = null;
let faceP: Promise<ort.InferenceSession> | null = null;
const opts: ort.InferenceSession.SessionOptions = { logSeverityLevel: 3, graphOptimizationLevel: "all" };

export function segSession() {
  segP ??= ort.InferenceSession.create(path.join(config.modelsDir, "u2net_human_seg.onnx"), opts);
  return segP;
}
export function faceSession() {
  faceP ??= ort.InferenceSession.create(path.join(config.modelsDir, "face-rfb-320.onnx"), opts);
  return faceP;
}
export { ort };
