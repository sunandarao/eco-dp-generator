import crypto from "node:crypto";
import { config } from "./config";
import { db, CATEGORIES, type Category, type Participant } from "./db";

export const STAFF_ID_RE = /^[A-Za-z0-9][A-Za-z0-9\-\/_.]{0,31}$/;

export function cleanDetails(input: { category?: unknown; branch?: unknown; staffId?: unknown }) {
  const category = CATEGORIES.includes(input.category as Category) ? (input.category as Category) : null;
  const branch = typeof input.branch === "string" && config.branches.includes(input.branch) ? input.branch : null;
  const sid = typeof input.staffId === "string" ? input.staffId.trim().toUpperCase() : "";
  const staff_id = sid && STAFF_ID_RE.test(sid) ? sid : null;
  return { category, branch, staff_id, staffIdInvalid: !!sid && !staff_id };
}

export function newParticipant(id: string): Participant {
  const now = new Date().toISOString();
  return {
    id, staff_id: null, category: null, branch: null, consent_version: null, consent_at: null,
    generated_count: 0, first_generated_at: null, download_count: 0, first_downloaded_at: null,
    whatsapp_confirmed_at: null, created_at: now, updated_at: now,
  };
}

export async function recordEvent(id: string, kind: "generated" | "downloaded" | "whatsapp_confirmed") {
  const p = await db().getParticipant(id);
  if (!p) return null;
  const now = new Date().toISOString();
  if (kind === "generated") { p.generated_count++; p.first_generated_at ??= now; }
  if (kind === "downloaded") { p.download_count++; p.first_downloaded_at ??= now; }
  if (kind === "whatsapp_confirmed") p.whatsapp_confirmed_at ??= now;
  p.updated_at = now;
  await db().upsertParticipant(p);
  return p;
}

export function audit(actor: string, action: string, detail?: string) {
  return db().addAudit({ id: crypto.randomUUID(), actor, action, detail: detail ?? null, created_at: new Date().toISOString() });
}

/**
 * One row per person: records with the same Employee/Chauffeur ID (e.g. one person on two phones, or after
 * clearing the browser) are merged. Records without an ID stay separate.
 */
export function mergeByStaffId(rows: Participant[]): (Participant & { merged: number })[] {
  const min = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
  const map = new Map<string, Participant & { merged: number }>();
  for (const r of [...rows].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
    const key = r.staff_id ? "id:" + r.staff_id : "rec:" + r.id;
    const m = map.get(key);
    if (!m) { map.set(key, { ...r, merged: 1 }); continue; }
    m.merged++;
    m.generated_count += r.generated_count;
    m.download_count += r.download_count;
    m.first_generated_at = min(m.first_generated_at, r.first_generated_at);
    m.first_downloaded_at = min(m.first_downloaded_at, r.first_downloaded_at);
    m.whatsapp_confirmed_at = min(m.whatsapp_confirmed_at, r.whatsapp_confirmed_at);
    m.consent_at = min(m.consent_at, r.consent_at);
    m.created_at = min(m.created_at, r.created_at) ?? m.created_at;
    m.category = r.category ?? m.category;   // latest non-empty wins
    m.branch = r.branch ?? m.branch;
    m.consent_version = r.consent_version ?? m.consent_version;
    m.updated_at = r.updated_at;
  }
  return [...map.values()];
}

export type Stats = ReturnType<typeof computeStats>;
export function computeStats(rows: Participant[]) {
  const gen = rows.filter((p) => p.generated_count > 0);
  const byCat = (c: Category | null) => gen.filter((p) => p.category === c).length;
  const branches = new Map<string, { branch: string; participants: number; generated: number; downloaded: number; confirmed: number }>();
  for (const p of rows) {
    const k = p.branch || "Not specified";
    const b = branches.get(k) ?? { branch: k, participants: 0, generated: 0, downloaded: 0, confirmed: 0 };
    b.participants++;
    if (p.generated_count > 0) b.generated++;
    if (p.download_count > 0) b.downloaded++;
    if (p.whatsapp_confirmed_at) b.confirmed++;
    branches.set(k, b);
  }
  const confirmed = rows.filter((p) => p.whatsapp_confirmed_at).length;
  const downloadedPeople = rows.filter((p) => p.download_count > 0).length;
  return {
    consentedParticipants: rows.length,
    peopleWithDp: gen.length,
    totalGenerations: rows.reduce((s, p) => s + p.generated_count, 0),
    corporate: byCat("corporate"),
    ccr: byCat("ccr_chauffeur"),
    ets: byCat("ets_chauffeur"),
    uncategorised: byCat(null),
    totalDownloads: rows.reduce((s, p) => s + p.download_count, 0),
    peopleDownloaded: downloadedPeople,
    whatsappConfirmed: confirmed,
    pendingConfirmation: gen.filter((p) => !p.whatsapp_confirmed_at).length,
    completionPct: gen.length ? Math.round((confirmed / gen.length) * 1000) / 10 : 0,
    branches: [...branches.values()].sort((a, b) => b.participants - a.participants),
  };
}

const CAT_LABEL: Record<string, string> = { corporate: "Corporate Employee", ccr_chauffeur: "CCR Chauffeur", ets_chauffeur: "ETS Chauffeur" };
export const categoryLabel = (c: string | null) => (c ? CAT_LABEL[c] ?? c : "Not specified");

export function status(p: Participant) {
  if (p.whatsapp_confirmed_at) return "WhatsApp DP updated (confirmed)";
  if (p.download_count > 0) return "Downloaded - confirmation pending";
  if (p.generated_count > 0) return "Generated - not downloaded";
  return "Consented - not generated";
}

/** CSV with protection against spreadsheet formula injection. No photographs, no IP addresses. */
export function toCsv(rows: (Participant & { merged?: number })[]) {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Record ID", "Employee/Chauffeur ID", "Category", "Branch", "Completion status", "Consent notice version",
    "Consent given at", "DPs generated", "First generated at", "Downloads", "First downloaded at", "WhatsApp update confirmed at", "Records merged"];
  const lines = rows.map((p) => [p.id, p.staff_id, categoryLabel(p.category), p.branch, status(p), p.consent_version, p.consent_at,
    p.generated_count, p.first_generated_at, p.download_count, p.first_downloaded_at, p.whatsapp_confirmed_at, p.merged ?? 1].map(esc).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}
