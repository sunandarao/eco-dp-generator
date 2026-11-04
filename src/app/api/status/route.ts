import { config, configStatus } from "@/lib/config";
import { json } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, non-secret configuration status used by the app to show setup warnings honestly. */
export async function GET() {
  const s = configStatus();
  return json({
    generationReady: s.generationReady,
    missing: [
      !s.logo && "logo",
      !s.models && "models",
      !s.externalOk && "ai_provider",
      !s.databaseOk && "database",
    ].filter(Boolean),
    aiProvider: config.aiProvider === "local" ? "local" : config.aiProvider,
    branches: config.branches,
    noticeVersion: config.noticeVersion,
    privacyEmail: config.privacyEmail || null,
    grievanceOfficer: config.grievanceOfficer || null,
    retention: {
      participantDays: config.participantRetentionDays,
      consentDays: config.consentLogRetentionDays,
    },
  });
}
