export const CATEGORIES = ["corporate", "ccr_chauffeur", "ets_chauffeur"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Non-image operational record. Photographs are never stored. */
export type Participant = {
  id: string;                     // random pseudonymous id (httpOnly cookie)
  staff_id: string | null;        // OPTIONAL Employee/Chauffeur ID
  category: Category | null;
  branch: string | null;
  consent_version: string | null;
  consent_at: string | null;
  generated_count: number;
  first_generated_at: string | null;
  download_count: number;
  first_downloaded_at: string | null;
  whatsapp_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsentEvent = {
  id: string; participant_id: string; action: "granted" | "withdrawn";
  notice_version: string; lang: string; created_at: string;
};

export type PrivacyRequest = {
  id: string; reference: string; participant_id: string | null;
  request_type: "access" | "correction" | "erasure" | "withdraw_consent" | "grievance" | "nomination" | "other";
  contact: string | null; message: string; status: "open" | "in_progress" | "closed";
  created_at: string; resolved_at: string | null;
};

export type AuditEntry = { id: string; actor: string; action: string; detail: string | null; created_at: string };

export interface Store {
  getParticipant(id: string): Promise<Participant | null>;
  upsertParticipant(p: Participant): Promise<void>;
  deleteParticipant(id: string): Promise<void>;
  listParticipants(): Promise<Participant[]>;
  addConsentEvent(e: ConsentEvent): Promise<void>;
  addPrivacyRequest(r: PrivacyRequest): Promise<void>;
  listPrivacyRequests(): Promise<PrivacyRequest[]>;
  updatePrivacyRequest(id: string, status: PrivacyRequest["status"]): Promise<void>;
  addAudit(a: AuditEntry): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
  /** Retention: delete records older than the cut-off dates. Returns counts deleted. */
  purge(c: { participantsBefore: string; consentBefore: string; requestsBefore: string; auditBefore: string }): Promise<Record<string, number>>;
}
