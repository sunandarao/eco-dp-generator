import { config } from "./config";
import { db } from "./db";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** Automatic deletion of non-image operational records past their approved retention periods. */
export function runRetention() {
  return db().purge({
    participantsBefore: daysAgo(config.participantRetentionDays),
    consentBefore: daysAgo(config.consentLogRetentionDays),
    requestsBefore: daysAgo(config.privacyRequestRetentionDays),
    auditBefore: daysAgo(Math.max(config.consentLogRetentionDays, 365)),
  });
}
