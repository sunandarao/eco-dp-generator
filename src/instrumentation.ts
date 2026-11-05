/** Runs once when the server starts (Next.js instrumentation hook). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const t = Date.now();
  try {
    const { warmup } = await import("./lib/ai/pipeline");
    await warmup();
    console.log(`AI models and logo ready in ${Date.now() - t} ms`);
  } catch (e) {
    // Never block start-up: /admin shows missing pieces, and generation reports "not configured".
    console.error("Warm-up skipped:", (e as Error).message);
  }
}
