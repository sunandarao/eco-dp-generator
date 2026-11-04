// onnxruntime-node 1.20 ships without its .d.ts; its API is the onnxruntime-common API.
declare module "onnxruntime-node" {
  export * from "onnxruntime-common";
}
