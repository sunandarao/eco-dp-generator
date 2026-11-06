import fs from "node:fs";
import path from "node:path";

/** Server-only configuration. Never import from client components. */
const root = process.cwd();

function bool(v: string | undefined, d = false) {
  if (v === undefined || v === "") return d;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
function int(v: string | undefined, d: number) {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
}

export const config = {
  isProd: process.env.NODE_ENV === "production",

  // Branding: the OFFICIAL logo file supplied by ECO. Never generated or redrawn.
  logoPath: process.env.ECO_LOGO_PATH || path.join(root, "public/brand/eco-logo.png"),
  // Optional transparent-background watermark variant supplied by ECO brand team.
  watermarkLogoPath: process.env.ECO_WATERMARK_LOGO_PATH || path.join(root, "public/brand/eco-logo-watermark.png"),
  // 1 = the official logo exactly as supplied (original ECO red). Lower values fade it.
  watermarkOpacity: Math.min(1, Math.max(0.04, Number(process.env.WATERMARK_OPACITY || "1"))),

  // AI: "device" = AI runs in the phone's browser, photo never uploaded (free hosting).
  //     "server" = AI runs on this server (needs ~2 GB RAM).
  aiMode: (process.env.AI_MODE === "server" ? "server" : "device") as "device" | "server",
  modelsDir: process.env.MODELS_DIR || path.join(root, "models"),
  aiProvider: (process.env.AI_PROVIDER || "local") as "local" | "removebg",
  externalProviderApproved: bool(process.env.EXTERNAL_AI_PROVIDER_APPROVED),
  removeBgApiKey: process.env.REMOVE_BG_API_KEY || "",
  maxConcurrentJobs: int(process.env.MAX_CONCURRENT_JOBS, 2),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 12) * 1024 * 1024,

  // Database
  supabaseUrl: (process.env.SUPABASE_URL || "").trim(),
  supabaseServiceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  allowFileStore: bool(process.env.ALLOW_FILE_STORE, process.env.NODE_ENV !== "production"),
  fileStorePath: process.env.FILE_STORE_PATH || path.join(root, ".data/store.json"),

  // Retention (days) – values must be approved by ECO Legal.
  participantRetentionDays: int(process.env.PARTICIPANT_RECORD_RETENTION_DAYS, 180),
  consentLogRetentionDays: int(process.env.CONSENT_LOG_RETENTION_DAYS, 365),
  privacyRequestRetentionDays: int(process.env.PRIVACY_REQUEST_RETENTION_DAYS, 365),
  cronSecret: (process.env.CRON_SECRET || "").trim(),

  // Admin
  // trimmed: values pasted into hosting dashboards often carry stray spaces/newlines
  adminUsername: (process.env.ADMIN_USERNAME || "").trim(),
  adminPasswordHash: (process.env.ADMIN_PASSWORD_HASH || "").trim(),
  adminSessionSecret: (process.env.ADMIN_SESSION_SECRET || "").trim(),
  adminIpAllowlist: (process.env.ADMIN_IP_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean),

  // Employee/Chauffeur ID compulsory (so ECO knows who has made a DP). The privacy notice says so when on.
  requireStaffId: bool(process.env.REQUIRE_STAFF_ID),

  // Privacy notice
  // Public address of the app (optional; used for origin checks behind proxies) and hosting disclosure for the notice
  publicUrl: process.env.PUBLIC_URL || "",
  hostingDisclosure: process.env.HOSTING_DISCLOSURE || "",
  noticeVersion: process.env.PRIVACY_NOTICE_VERSION || "2026-11-v2-DRAFT",
  privacyEmail: process.env.PRIVACY_CONTACT_EMAIL || "",
  grievanceOfficer: process.env.GRIEVANCE_OFFICER_NAME || "",
  branches: (process.env.BRANCHES || "Delhi NCR,Gurugram,Noida,Mumbai,Pune,Bengaluru,Hyderabad,Chennai,Kolkata,Ahmedabad,Other")
    .split(",").map((s) => s.trim()).filter(Boolean),
};

export function fileExists(p: string) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** Status of every external dependency, without exposing secrets. */
export function configStatus() {
  const logo = fileExists(config.logoPath);
  const models = config.aiMode === "device"
    ? fileExists(path.join(root, "public/models/device/selfie_multiclass_256x256.tflite")) &&
      fileExists(path.join(root, "public/models/device/blaze_face_short_range.tflite")) &&
      fileExists(path.join(root, "public/mediapipe/wasm/vision_wasm_internal.wasm"))
    : fileExists(path.join(config.modelsDir, "u2net_human_seg.onnx")) &&
      fileExists(path.join(config.modelsDir, "face-rfb-320.onnx"));
  const externalOk = config.aiMode === "device" || config.aiProvider === "local" ||
    (config.externalProviderApproved && (config.aiProvider !== "removebg" || !!config.removeBgApiKey));
  const db = config.supabaseUrl && config.supabaseServiceKey ? "supabase" : config.allowFileStore ? "file (development only)" : "NOT CONFIGURED";
  return {
    logo, watermarkVariant: fileExists(config.watermarkLogoPath), models,
    aiMode: config.aiMode, aiProvider: config.aiProvider, externalProviderApproved: config.externalProviderApproved, externalOk,
    database: db, databaseOk: db !== "NOT CONFIGURED",
    admin: !!(config.adminUsername && config.adminPasswordHash && config.adminSessionSecret.length >= 32),
    privacyContact: !!config.privacyEmail, cron: !!config.cronSecret,
    noticeVersion: config.noticeVersion,
    generationReady: logo && models && externalOk && db !== "NOT CONFIGURED",
  };
}
