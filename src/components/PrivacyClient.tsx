"use client";

import { useEffect, useState } from "react";
import { dict } from "@/lib/i18n";
import { LangButton, useLang } from "./LangPicker";

type Record_ = {
  recordId: string; staffId: string | null; category: string; categoryCode: string | null; branch: string | null;
  consentAt: string | null; dpsGenerated: number; downloads: number; whatsappConfirmedAt: string | null; status: string;
};

const CATS = ["corporate", "ccr_chauffeur", "ets_chauffeur"] as const;
const TYPES = ["access", "correction", "erasure", "withdraw_consent", "grievance", "nomination", "other"] as const;

export default function PrivacyClient({ privacyEmail, grievanceOfficer, branches }: { privacyEmail: string | null; grievanceOfficer: string | null; branches: string[] }) {
  const [lang, setLang] = useLang();
  const t = dict[lang];
  const [rec, setRec] = useState<Record_ | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const [staffId, setStaffId] = useState("");
  const [type, setType] = useState<string>("access");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/participant", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ exists: false }));
    setRec(r.exists ? r.record : null);
    if (r.exists) { setCat(r.record.categoryCode); setBranch(r.record.branch || ""); setStaffId(r.record.staffId || ""); }
  }
  useEffect(() => { load(); }, []);

  async function withdraw() {
    if (!confirm(t.pWithdrawConfirm)) return;
    setBusy(true);
    const r = await fetch("/api/participant", { method: "DELETE" });
    setBusy(false);
    if (r.ok) { setRec(null); setMsg(t.pWithdrawn); } else setMsg(t.errors.processing_failed);
  }

  async function saveEdit() {
    setBusy(true);
    const r = await fetch("/api/participant", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: cat, branch: branch || null, staffId: staffId.trim() || null }) });
    setBusy(false);
    if (r.ok) { setEditing(false); load(); } else setMsg((await r.json().catch(() => ({}))).error === "invalid_staff_id" ? t.staffInvalid : t.errors.processing_failed);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/privacy-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, message: text, contact }) });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setRef(j.reference); setText(""); } else setMsg(t.errors[j.error] || t.errors.processing_failed);
  }

  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

  return (
    <>
      <header className="flex items-center justify-between py-4">
        <a href="/" className="min-h-[44px] content-center font-bold text-eco">← {t.pBack}</a>
        <LangButton lang={lang} label={t.chooseLang} onPick={setLang} />
      </header>
      <h1 className="text-2xl font-extrabold">{t.pTitle}</h1>
      <p className="mt-2 text-ink-muted">{t.pIntro}</p>

      <section className="card mt-5">
        <h2 className="mb-3 text-lg font-bold">{t.pMyData}</h2>
        {rec === undefined ? <p>…</p> : rec === null ? <p>{t.pNoData}</p> : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {(["staffId", "category", "branch", "consentAt", "dpsGenerated", "downloads", "whatsappConfirmedAt", "status"] as const).map((k) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-ink-muted">{t.pFields[k]}</dt>
                  <dd className="break-words">{k === "consentAt" || k === "whatsappConfirmedAt" ? fmt(rec[k]) : String(rec[k] ?? "—")}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm font-semibold text-green-800">✓ {t.pNoPhoto}</p>
            {editing ? (
              <div className="mt-4 flex flex-col gap-2">
                {CATS.map((c) => (
                  <button key={c} onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c}
                    className={`btn min-h-[48px] border-2 text-base ${cat === c ? "border-eco bg-eco text-white" : "border-neutral-300"}`}>{t.cats[c]}</button>
                ))}
                <select className="field" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={t.branchLabel}>
                  <option value="">{t.branchPick}</option>
                  {branches.map((b) => <option key={b}>{b}</option>)}
                </select>
                <input className="field uppercase" value={staffId} onChange={(e) => setStaffId(e.target.value)} maxLength={32} placeholder={t.staffLabel} aria-label={t.staffLabel} />
                <button className="btn-primary" disabled={busy} onClick={saveEdit}>{t.next}</button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                <button className="btn-outline min-h-[52px] text-base" onClick={() => setEditing(true)}>{t.pEdit}</button>
                <button className="btn min-h-[52px] border-2 border-neutral-400 text-base text-ink" disabled={busy} onClick={withdraw}>{t.pWithdraw}</button>
              </div>
            )}
          </>
        )}
        {msg && <p role="status" className="mt-3 rounded-lg bg-eco-soft p-3 font-semibold text-eco-dark">{msg}</p>}
      </section>

      <section className="card mt-5">
        <h2 className="mb-3 text-lg font-bold">{t.pRequestTitle}</h2>
        {ref ? (
          <p className="rounded-lg bg-green-50 p-3 font-semibold text-green-800">{t.pSubmitted}: <b>{ref}</b></p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-semibold">{t.pReqType}
              <select className="field font-normal" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((ty) => <option key={ty} value={ty}>{t.pReqTypes[ty]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">{t.pMessage}
              <textarea className="field min-h-[110px] py-3 font-normal" required minLength={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">{t.pContact}
              <input className="field font-normal" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
            </label>
            <button className="btn-primary" disabled={busy || text.trim().length < 5}>{t.pSubmit}</button>
          </form>
        )}
      </section>

      <section className="card mt-5 text-sm">
        <h2 className="mb-2 text-lg font-bold">{t.pContactTitle}</h2>
        {grievanceOfficer && <p>{grievanceOfficer}</p>}
        {privacyEmail ? <a className="font-semibold text-eco underline" href={`mailto:${privacyEmail}`}>{privacyEmail}</a> : <p className="text-amber-800">—</p>}
        <p className="mt-3 text-ink-muted">{t.pBoard}</p>
        <a href="#notice" className="mt-3 inline-block font-semibold text-eco underline">{t.pLegalNote} ↓</a>
      </section>
    </>
  );
}
