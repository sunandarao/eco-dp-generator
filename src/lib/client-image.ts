/**
 * Runs in the browser. Decodes the chosen photo, applies EXIF orientation, downsizes it to at most
 * 2048 px and re-encodes it as JPEG. Re-encoding drops ALL metadata (including GPS location) before
 * anything leaves the phone, and reduces mobile data usage.
 */
export async function prepareImage(file: File, max = 2048): Promise<Blob> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("invalid_image");
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("invalid_image")); };
      img.src = url;
    });
  }
  const w0 = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h0 = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!w0 || !h0) throw new Error("invalid_image");
  const s = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * s), h = Math.round(h0 * s);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("invalid_image");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("invalid_image");
  return blob;
}
