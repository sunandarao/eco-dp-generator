import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store, Participant, ConsentEvent, PrivacyRequest, AuditEntry } from "./types";

/** Server-side only. Uses the service-role key (never shipped to the browser). RLS denies anon access. */
export class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  private ok<T>(r: { data: T; error: unknown }) { if (r.error) throw new Error("Database error: " + JSON.stringify(r.error)); return r.data; }
  async getParticipant(id: string) { return this.ok(await this.db.from("participants").select("*").eq("id", id).maybeSingle()) as Participant | null; }
  async upsertParticipant(p: Participant) { this.ok(await this.db.from("participants").upsert(p)); }
  async deleteParticipant(id: string) { this.ok(await this.db.from("participants").delete().eq("id", id)); }
  async listParticipants() {
    const all: Participant[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = this.ok(await this.db.from("participants").select("*").order("created_at").range(from, from + 999)) as Participant[];
      all.push(...rows); if (rows.length < 1000) break;
    }
    return all;
  }
  async addConsentEvent(e: ConsentEvent) { this.ok(await this.db.from("consent_events").insert(e)); }
  async addPrivacyRequest(r: PrivacyRequest) { this.ok(await this.db.from("privacy_requests").insert(r)); }
  async listPrivacyRequests() { return this.ok(await this.db.from("privacy_requests").select("*").order("created_at", { ascending: false }).limit(500)) as PrivacyRequest[]; }
  async updatePrivacyRequest(id: string, status: PrivacyRequest["status"]) {
    this.ok(await this.db.from("privacy_requests").update({ status, resolved_at: status === "closed" ? new Date().toISOString() : null }).eq("id", id));
  }
  async addAudit(a: AuditEntry) { this.ok(await this.db.from("admin_audit").insert(a)); }
  async listAudit(limit: number) { return this.ok(await this.db.from("admin_audit").select("*").order("created_at", { ascending: false }).limit(limit)) as AuditEntry[]; }
  async purge(c: { participantsBefore: string; consentBefore: string; requestsBefore: string; auditBefore: string }) {
    const del = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await q; if (r.error) throw new Error(JSON.stringify(r.error)); return r.count ?? 0; };
    return {
      participants: await del(this.db.from("participants").delete({ count: "exact" }).lt("updated_at", c.participantsBefore)),
      consent_events: await del(this.db.from("consent_events").delete({ count: "exact" }).lt("created_at", c.consentBefore)),
      privacy_requests: await del(this.db.from("privacy_requests").delete({ count: "exact" }).eq("status", "closed").lt("resolved_at", c.requestsBefore)),
      audit: await del(this.db.from("admin_audit").delete({ count: "exact" }).lt("created_at", c.auditBefore)),
    };
  }
}
