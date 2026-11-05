const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the on-device AI (WebAssembly) run; no other eval is allowed
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Native modules run only on the server and must not be bundled.
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  outputFileTracingIncludes: { "/api/generate": ["./models/**"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      // on-device AI files: downloaded once, then cached by the phone
      { source: "/models/device/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }] },
      { source: "/mediapipe/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
