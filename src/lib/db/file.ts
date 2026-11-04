import fs from "node:fs";
import path from "node:path";
import type { Store, Participant, ConsentEvent, PrivacyRequest, AuditEntry } from "./types";

type Data = { participants: Participant[]; consent: ConsentEvent[]; requests: PrivacyRequest[]; audit: AuditEntry[] };

/** DEVELOPMENT-ONLY JSON store (single instance). Production must use Supabase/Postgres. */
export class FileStore implements Store {
  constructor(private file: string) {}
  private chain: Promise<unknown> = Promise.resolve();
  private read(): Data {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); }
    catch { return { participants: [], consent: [], requests: [], audit: [] }; }
  }
  private write(d: Data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  private tx<T>(fn: (d: Data) => T): Promise<T> {
    const p = this.chain.then(() => { const d = this.read(); const r = fn(d); this.write(d); return r; });
    this.chain = p.catch(() => undefined);
    return p;
  }
  async getParticipant(id: string) { return this.read().participants.find((p) => p.id === id) ?? null; }
  upsertParticipant(p: Participant) { return this.tx((d) => { d.participants = d.participants.filter((x) => x.id !== p.id); d.participants.push(p); }); }
  deleteParticipant(id: string) { return this.tx((d) => { d.participants = d.participants.filter((x) => x.id !== id); }); }
  async listParticipants() { return this.read().participants; }
  addConsentEvent(e: ConsentEvent) { return this.tx((d) => { d.consent.push(e); }); }
  addPrivacyRequest(r: PrivacyRequest) { return this.tx((d) => { d.requests.push(r); }); }
  async listPrivacyRequests() { return [...this.read().requests].reverse(); }
  updatePrivacyRequest(id: string, status: PrivacyRequest["status"]) {
    return this.tx((d) => { const r = d.requests.find((x) => x.id === id); if (r) { r.status = status; r.resolved_at = status === "closed" ? new Date().toISOString() : null; } });
  }
  addAudit(a: AuditEntry) { return this.tx((d) => { d.audit.push(a); }); }
  async listAudit(limit: number) { return this.read().audit.slice(-limit).reverse(); }
  purge(c: { participantsBefore: string; consentBefore: string; requestsBefore: string; auditBefore: string }) {
    return this.tx((d) => {
      const n = { participants: d.participants.length, consent: d.consent.length, requests: d.requests.length, audit: d.audit.length };
      d.participants = d.participants.filter((p) => p.updated_at >= c.participantsBefore);
      d.consent = d.consent.filter((e) => e.created_at >= c.consentBefore);
      d.requests = d.requests.filter((r) => r.status !== "closed" || (r.resolved_at ?? r.created_at) >= c.requestsBefore);
      d.audit = d.audit.filter((a) => a.created_at >= c.auditBefore);
      return { participants: n.participants - d.participants.length, consent_events: n.consent - d.consent.length, privacy_requests: n.requests - d.requests.length, audit: n.audit - d.audit.length };
    });
  }
}
